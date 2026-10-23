'use server'

// Notas emitidas contra o CNPJ da empresa — os dois caminhos da SEFAZ.
//
// "Verificar NFs disponíveis" varre a sequência de NSU; "Consulta NF-e" vai
// direto a uma chave. O primeiro entrega tudo mas disputa a sequência com
// qualquer outro software no mesmo CNPJ; o segundo não disputa com ninguém.
//
// Em ambos, o XML completo só vem depois da manifestação de Ciência — por isso
// a Ciência é disparada aqui mesmo, quando a empresa autorizou.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { decryptSecret } from '@/lib/integrations/bank-certificate'
import { consultarPorChave, type RespostaDfe } from '@/lib/fiscal/sefaz-dfe'
import {
  sincronizarEmpresa, credencialDaEmpresa, guardarDocumentos, manifestarPendentes,
} from '@/lib/fiscal/dfe-sync'
import { suspeitaDeOutroConsumidor } from '@/lib/fiscal/dfe-nsu'
import type { NotaDisponivel, ResumoConsulta, ConfiguracaoDfe } from '@/types/dfe'
import { mensagemErro } from '@/lib/errors'

const PODE_OPERAR = ['admin', 'owner', 'manager']

type Ctx = {
  admin: ReturnType<typeof createAdminClient>
  clinicId: string
  userId: string
  role: string
}

async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sua sessão expirou. Entre de novo para continuar.' }
  const { data: p } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!p?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { admin: createAdminClient(), clinicId: p.clinic_id as string, userId: user.id, role: (p.role as string) ?? '' }
}




// ─── As duas consultas, como a tela chama ────────────────────────────────────

/** Botão "Verificar NFs disponíveis": varre a sequência de NSU da empresa. */
export async function verificarNfsDisponiveis(companyId: string): Promise<ResumoConsulta | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_OPERAR.includes(c.role)) return { error: 'Seu usuário não tem permissão para esta operação.' }

  const r = await sincronizarEmpresa(c.admin, c.clinicId, companyId)

  if (!r.ok) {
    // O motivo técnico ficou gravado para o suporte; aqui vai o que dá para
    // fazer a respeito.
    return { error: r.erro?.includes('certificado')
      ? 'O certificado digital desta empresa precisa ser revisto.'
      : 'Não foi possível falar com a Receita agora. Tente de novo em alguns minutos.' }
  }

  if (r.bloqueado) {
    return { novas: 0, comXml: 0, aguardando: true,
      mensagem: 'A Receita limita a frequência das consultas. Tente novamente mais tarde.' }
  }
  if (r.emDia) {
    return { novas: 0, comXml: 0, aguardando: false, mensagem: 'Nenhuma nota nova. A lista já está em dia.' }
  }

  revalidatePath('/dashboard/purchases')

  const partes: string[] = []
  if (r.novas) partes.push(`${r.novas} nota(s) nova(s)`)
  if (r.comXml) partes.push(`${r.comXml} com XML disponível`)
  if (r.manifestadas) partes.push(`${r.manifestadas} liberada(s) para download`)

  return {
    novas: r.novas, comXml: r.comXml, aguardando: false,
    mensagem: partes.length ? partes.join(' · ') + '.' : 'Nenhuma nota nova.',
  }
}

/** Botão "Consulta NF-e": vai direto a uma chave, sem tocar na sequência. */
export async function consultarNfePorChave(
  companyId: string, chaveBruta: string,
): Promise<ResumoConsulta | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_OPERAR.includes(c.role)) return { error: 'Seu usuário não tem permissão para esta operação.' }

  const chave = (chaveBruta ?? '').replace(/\D/g, '')
  if (chave.length !== 44) {
    return { error: 'A chave deve ter 44 números. Confira no rodapé do DANFE.' }
  }

  const cred = await credencialDaEmpresa(c.admin, c.clinicId, companyId)
  if ('error' in cred) return cred

  let r: RespostaDfe
  try { r = await consultarPorChave(cred, chave) }
  catch { return { error: 'Não foi possível falar com a Receita agora. Tente de novo em alguns minutos.' } }

  if (!r.documentos.length) {
    return {
      novas: 0, comXml: 0, aguardando: false,
      mensagem: 'Nenhuma nota encontrada com esta chave para o CNPJ desta empresa.',
    }
  }

  const g = await guardarDocumentos(c.admin, c.clinicId, companyId, 'chave', r.documentos)

  // Veio só o resumo: a Ciência é o que libera o arquivo. Vale pedir aqui
  // mesmo — quem digitou a chave quer o XML, não a notícia de que ela existe.
  let liberada = false
  const { data: cfg } = await c.admin.from('company_dfe')
    .select('auto_ciencia').eq('company_id', companyId).maybeSingle()
  if (r.documentos.every(d => d.tipo !== 'completo') && (cfg as { auto_ciencia?: boolean } | null)?.auto_ciencia) {
    const feitas = await manifestarPendentes(c.admin, cred, c.clinicId, companyId, 1)
    if (feitas) {
      // Depois da Ciência, o XML já pode ser buscado pela mesma chave.
      try {
        const r2 = await consultarPorChave(cred, chave)
        const g2 = await guardarDocumentos(c.admin, c.clinicId, companyId, 'chave', r2.documentos)
        liberada = g2.comXml > 0
      } catch { /* a nota já está registrada; o XML vem na próxima tentativa */ }
    }
  }

  revalidatePath('/dashboard/purchases')
  return {
    novas: g.novas, comXml: g.comXml + (liberada ? 1 : 0), aguardando: false,
    mensagem: (g.comXml || liberada)
      ? 'Nota encontrada e XML disponível para lançamento.'
      : 'Nota encontrada. O XML ainda não foi liberado pela Receita.',
  }
}

/**
 * Várias chaves de uma vez — o caminho para o HISTÓRICO.
 *
 * A Receita não gera NSU retroativo: para um CNPJ que nunca usou a
 * distribuição, a sequência começa no primeiro acesso e as notas anteriores
 * NÃO entram. Elas existem e continuam acessíveis por 90 dias, mas só pela
 * chave — daí este lote.
 *
 * O limite de 20 consultas por hora é da Receita e vale por chave. Parar no
 * teto e dizer quantas faltam é melhor do que gastar o limite e deixar o CNPJ
 * bloqueado no meio do trabalho.
 */
export async function consultarNfesPorChaves(
  companyId: string, texto: string,
): Promise<{ processadas: number; encontradas: number; restantes: number; invalidas: number; mensagem: string } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_OPERAR.includes(c.role)) return { error: 'Seu usuário não tem permissão para esta operação.' }

  // Aceita o que o operador tiver: uma por linha, separadas por vírgula, ou
  // coladas de uma planilha. O que importa são sequências de 44 dígitos.
  const todas = [...new Set((texto.match(/\d{44}/g) ?? []))]
  const invalidas = (texto.split(/[\s,;]+/).filter(Boolean).length) - todas.length

  if (!todas.length) {
    return { error: 'Nenhuma chave válida encontrada. Cada chave tem 44 números.' }
  }

  const TETO = 18   // margem sob o limite de 20/hora da Receita
  const lote = todas.slice(0, TETO)

  const cred = await credencialDaEmpresa(c.admin, c.clinicId, companyId)
  if ('error' in cred) return cred

  let encontradas = 0
  for (const chave of lote) {
    try {
      const r = await consultarPorChave(cred, chave)
      if (r.documentos.length) {
        await guardarDocumentos(c.admin, c.clinicId, companyId, 'chave', r.documentos)
        encontradas++
      }
    } catch {
      // Uma chave que falha não interrompe o lote.
    }
  }

  const restantes = todas.length - lote.length
  revalidatePath('/dashboard/purchases')

  const partes = [`${encontradas} de ${lote.length} nota(s) encontrada(s)`]
  if (restantes) partes.push(`${restantes} ficaram para a próxima hora (limite da Receita)`)
  if (invalidas > 0) partes.push(`${invalidas} linha(s) ignorada(s) por não ter 44 números`)

  return {
    processadas: lote.length, encontradas, restantes, invalidas: Math.max(0, invalidas),
    mensagem: partes.join(' · ') + '.',
  }
}

// ─── Leitura para a tela ─────────────────────────────────────────────────────

export async function listarNotasDisponiveis(filtro?: {
  companyId?: string
  de?: string
  ate?: string
  /** 'todas' | 'pendentes' | 'lancadas' */
  situacao?: string
  fornecedor?: string
}): Promise<NotaDisponivel[] | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }

  let q = c.admin.from('dfe_documentos')
    .select('id, chave, emitente_nome, emitente_cnpj, numero, serie, valor, emitida_em, xml, lancado_em, origem, manifestado_em')
    .eq('clinic_id', c.clinicId)

  if (filtro?.companyId) q = q.eq('company_id', filtro.companyId)
  if (filtro?.de)   q = q.gte('emitida_em', filtro.de)
  if (filtro?.ate)  q = q.lte('emitida_em', filtro.ate + 'T23:59:59')
  if (filtro?.situacao === 'pendentes') q = q.is('purchase_order_id', null)
  if (filtro?.situacao === 'lancadas')  q = q.not('purchase_order_id', 'is', null)
  if (filtro?.fornecedor) q = q.ilike('emitente_nome', `%${filtro.fornecedor}%`)

  const { data, error } = await q.order('emitida_em', { ascending: false }).limit(300)
  if (error) return { error: 'Não foi possível carregar as notas agora.' }

  return (data ?? []).map(l => {
    const r = l as Record<string, unknown>
    return {
      id:            r.id as string,
      chave:         r.chave as string,
      emitenteNome:  (r.emitente_nome as string | null) ?? null,
      emitenteCnpj:  (r.emitente_cnpj as string | null) ?? null,
      numero:        (r.numero as string | null) ?? null,
      serie:         (r.serie as string | null) ?? null,
      valor:         r.valor === null ? null : Number(r.valor),
      emitidaEm:     (r.emitida_em as string | null) ?? null,
      temXml:        Boolean(r.xml),
      lancadaEm:     (r.lancado_em as string | null) ?? null,
      origem:        (r.origem as string) ?? 'nsu',
      manifestadaEm: (r.manifestado_em as string | null) ?? null,
    }
  })
}

/** O XML de uma nota, para alimentar a entrada de compra. */
export async function obterXmlDaNota(id: string): Promise<{ xml: string; chave: string } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  const { data } = await c.admin.from('dfe_documentos')
    .select('xml, chave').eq('id', id).eq('clinic_id', c.clinicId).maybeSingle()
  const xml = (data as { xml?: string | null } | null)?.xml
  if (!xml) return { error: 'O XML desta nota ainda não foi liberado pela Receita.' }
  return { xml, chave: (data as { chave: string }).chave }
}

export async function listarConfiguracaoDfe(): Promise<ConfiguracaoDfe[] | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }

  const { data: empresas } = await c.admin
    .from('companies').select('id, name, cnpj').eq('clinic_id', c.clinicId).order('code')
  const { data: cfgs } = await c.admin
    .from('company_dfe').select('*').eq('clinic_id', c.clinicId)

  const porEmpresa = new Map((cfgs ?? []).map(x => [(x as { company_id: string }).company_id, x as Record<string, unknown>]))

  return (empresas ?? []).map(e => {
    const emp = e as { id: string; name: string; cnpj: string | null }
    const cfg = porEmpresa.get(emp.id)
    return {
      company_id:    emp.id,
      company_name:  emp.name,
      company_cnpj:  emp.cnpj,
      enabled:       Boolean(cfg?.enabled),
      auto_ciencia:  Boolean(cfg?.auto_ciencia),
      emDia:         Boolean(cfg) && Number(cfg?.ult_nsu ?? 0) >= Number(cfg?.max_nsu ?? 0),
      ultimoSucesso: (cfg?.ultimo_sucesso as string | null) ?? null,
      conflito:      suspeitaDeOutroConsumidor(Number(cfg?.bloqueios ?? 0)),
    }
  })
}

export async function salvarConfiguracaoDfe(input: {
  companyId: string; enabled: boolean; autoCiencia: boolean
}): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_OPERAR.includes(c.role)) return { error: 'Seu usuário não tem permissão para alterar isto.' }

  const { error } = await c.admin.from('company_dfe').upsert({
    company_id: input.companyId, clinic_id: c.clinicId,
    enabled: input.enabled, auto_ciencia: input.autoCiencia,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' })

  if (error) return { error: 'Não foi possível salvar a configuração agora.' }
  revalidatePath('/dashboard/management')
  return { ok: true }
}
