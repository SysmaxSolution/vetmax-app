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
import {
  consultarPorNsu, consultarPorChave, lerDadosDaNota,
  type CredencialSefaz, type RespostaDfe, type DocumentoDfe,
} from '@/lib/fiscal/sefaz-dfe'
import { enviarEvento } from '@/lib/fiscal/sefaz-evento'
import { decidirConsulta, aplicarResposta, suspeitaDeOutroConsumidor } from '@/lib/fiscal/dfe-nsu'
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

/**
 * Credencial da empresa: certificado e-CNPJ + CNPJ.
 *
 * O mesmo certificado do banco serve à SEFAZ — é o e-CNPJ A1 da empresa. Por
 * isso a entrega de 23/10, que passou a guardar um certificado POR EMPRESA,
 * é o que torna esta rotina possível com três CNPJs.
 */
async function credencialDaEmpresa(
  admin: ReturnType<typeof createAdminClient>, clinicId: string, companyId: string,
): Promise<CredencialSefaz | { error: string }> {
  const { data: emp } = await admin
    .from('companies').select('cnpj').eq('id', companyId).eq('clinic_id', clinicId).maybeSingle()
  const cnpj = String((emp as { cnpj?: string } | null)?.cnpj ?? '').replace(/\D/g, '')
  if (!cnpj) return { error: 'A empresa não tem CNPJ cadastrado.' }

  // O certificado da empresa; na falta dele, o geral da clínica.
  const base = () => admin.from('clinic_bank_certificates')
    .select('pfx_encrypted, passphrase_encrypted, not_after').eq('clinic_id', clinicId)
  let cert = (await base().eq('company_id', companyId).maybeSingle()).data as Record<string, unknown> | null
  if (!cert) cert = (await base().is('company_id', null).maybeSingle()).data as Record<string, unknown> | null
  if (!cert) return { error: 'Esta empresa não tem certificado digital cadastrado.' }

  const pfx = decryptSecret(cert.pfx_encrypted as string)
  if (!pfx) return { error: 'Não foi possível ler o certificado guardado.' }
  const senha = decryptSecret((cert.passphrase_encrypted as string | null) ?? null)

  const venc = cert.not_after as string | null
  if (venc && new Date(venc).getTime() < Date.now()) {
    return { error: 'O certificado digital desta empresa está vencido.' }
  }

  return {
    ambiente: 'producao',
    pfx,
    passphrase: senha ? senha.toString('utf8') : null,
    cnpj,
  }
}

/**
 * Grava os documentos do lote.
 *
 * O XML completo NUNCA é sobrescrito por um resumo: a mesma nota chega várias
 * vezes (resumo primeiro, completa depois da Ciência), e deixar o resumo
 * apagar o arquivo seria perder justamente o que interessa.
 */
async function guardarDocumentos(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string, companyId: string, origem: 'nsu' | 'chave',
  documentos: DocumentoDfe[],
): Promise<{ novas: number; comXml: number }> {
  let novas = 0
  let comXml = 0

  for (const doc of documentos) {
    // Eventos não são notas; interessam só pelo efeito que já registramos.
    if (doc.tipo === 'evento' || doc.tipo === 'resumo_evento') continue
    const dados = lerDadosDaNota(doc.xml, doc.chave)
    if (!dados) continue

    const completo = doc.tipo === 'completo'
    const { data: ja } = await admin.from('dfe_documentos')
      .select('id, xml').eq('clinic_id', clinicId).eq('chave', dados.chave).maybeSingle()

    const campos: Record<string, unknown> = {
      clinic_id: clinicId, company_id: companyId, chave: dados.chave,
      nsu: doc.nsu || null, tipo: doc.tipo, origem,
      emitente_cnpj: dados.emitenteCnpj, emitente_nome: dados.emitenteNome,
      numero: dados.numero, serie: dados.serie, valor: dados.valor,
      emitida_em: dados.emitidaEm, situacao: dados.situacao,
      updated_at: new Date().toISOString(),
    }
    // Só grava o XML quando ele é o completo. Resumo não apaga arquivo.
    if (completo) campos.xml = doc.xml

    if (ja) {
      const tinhaXml = Boolean((ja as { xml?: string | null }).xml)
      await admin.from('dfe_documentos').update(campos).eq('id', (ja as { id: string }).id)
      if (completo && !tinhaXml) comXml++
    } else {
      await admin.from('dfe_documentos').insert(campos)
      novas++
      if (completo) comXml++
    }
  }

  return { novas, comXml }
}

/** Dispara a Ciência das notas que ainda não têm XML, quando a empresa autorizou. */
async function manifestarPendentes(
  admin: ReturnType<typeof createAdminClient>,
  cred: CredencialSefaz, clinicId: string, companyId: string, limite = 20,
): Promise<number> {
  const { data: pendentes } = await admin.from('dfe_documentos')
    .select('id, chave')
    .eq('clinic_id', clinicId).eq('company_id', companyId)
    .is('xml', null).is('manifestado_em', null)
    .order('emitida_em', { ascending: false })
    .limit(limite)

  let feitas = 0
  for (const p of (pendentes ?? []) as { id: string; chave: string }[]) {
    try {
      const r = await enviarEvento(cred, p.chave, '210210')
      if (r.ok) {
        // Duplicidade conta como feita: alguém já manifestou e o XML foi
        // liberado do mesmo jeito.
        await admin.from('dfe_documentos').update({
          manifestado_em: new Date().toISOString(),
          manifestacao: r.duplicado ? '210210:duplicado' : '210210',
          updated_at: new Date().toISOString(),
        }).eq('id', p.id)
        feitas++
      } else if (r.foraDoPrazo) {
        // Passou dos 10 dias: não adianta tentar de novo, e insistir todo dia
        // só gastaria chamada. Marca para não voltar à fila.
        await admin.from('dfe_documentos').update({
          manifestacao: '210210:fora_do_prazo', updated_at: new Date().toISOString(),
        }).eq('id', p.id)
      }
    } catch {
      // Falha numa nota não interrompe as outras.
    }
  }
  return feitas
}

// ─── As duas consultas, como a tela chama ────────────────────────────────────

/** Botão "Verificar NFs disponíveis": varre a sequência de NSU da empresa. */
export async function verificarNfsDisponiveis(companyId: string): Promise<ResumoConsulta | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_OPERAR.includes(c.role)) return { error: 'Seu usuário não tem permissão para esta operação.' }

  const { data: cfg } = await c.admin.from('company_dfe')
    .select('enabled, auto_ciencia, ult_nsu, max_nsu, bloqueado_ate, bloqueios')
    .eq('company_id', companyId).eq('clinic_id', c.clinicId).maybeSingle()

  if (!cfg) return { error: 'A consulta de notas não está ativada para esta empresa.' }
  const estado = cfg as unknown as {
    enabled: boolean; auto_ciencia: boolean; ult_nsu: number
    max_nsu: number; bloqueado_ate: string | null; bloqueios: number
  }

  const agora = new Date().toISOString()
  const decisao = decidirConsulta(estado, agora)
  if (!decisao.consultar) {
    return {
      novas: 0, comXml: 0, aguardando: decisao.motivo === 'bloqueado',
      mensagem:
        decisao.motivo === 'desligado' ? 'A consulta de notas não está ativada para esta empresa.'
        : decisao.motivo === 'em_dia'  ? 'Nenhuma nota nova. A lista já está em dia.'
        : 'A Receita limita a frequência das consultas. Tente novamente mais tarde.',
    }
  }

  const cred = await credencialDaEmpresa(c.admin, c.clinicId, companyId)
  if ('error' in cred) return cred

  let nsu = decisao.aPartirDe
  let novas = 0, comXml = 0, bloqueios = estado.bloqueios
  let ultima: RespostaDfe | null = null

  // Até 20 lotes por execução (1000 documentos): o suficiente para pôr em dia
  // sem transformar um clique numa espera de minutos.
  for (let volta = 0; volta < 20; volta++) {
    try { ultima = await consultarPorNsu(cred, nsu) }
    catch (e) {
      await c.admin.from('company_dfe').update({
        ultima_consulta: agora, situacao: 'erro',
        erro_tecnico: mensagemErro(e, 'lib/actions/dfe.ts'), updated_at: agora,
      }).eq('company_id', companyId)
      return { error: 'Não foi possível falar com a Receita agora. Tente de novo em alguns minutos.' }
    }

    const g = await guardarDocumentos(c.admin, c.clinicId, companyId, 'nsu', ultima.documentos)
    novas += g.novas; comXml += g.comXml

    const proximo = aplicarResposta(
      { ...estado, ult_nsu: nsu, max_nsu: ultima.maxNSU },
      // `aplicarResposta` quer a CONTAGEM, não os documentos: ela decide sobre
      // a sequência, não sobre o conteúdo.
      { cStat: ultima.cStat, ultNSU: ultima.ultNSU, maxNSU: ultima.maxNSU, documentos: ultima.documentos.length },
      new Date().toISOString())
    nsu = proximo.ult_nsu
    if (proximo.contarBloqueio) bloqueios++

    await c.admin.from('company_dfe').update({
      ult_nsu: proximo.ult_nsu, max_nsu: proximo.max_nsu,
      bloqueado_ate: proximo.bloqueado_ate, bloqueios,
      ultima_consulta: new Date().toISOString(),
      ultimo_sucesso: new Date().toISOString(),
      situacao: 'ok', erro_tecnico: null, updated_at: new Date().toISOString(),
    }).eq('company_id', companyId)

    if (!proximo.continuar) break
  }

  // Com a Ciência ligada, as notas novas já saem desta rodada com o XML a
  // caminho — sem isso, a lista mostraria notas que não dá para lançar.
  let manifestadas = 0
  if (estado.auto_ciencia && novas > 0) {
    manifestadas = await manifestarPendentes(c.admin, cred, c.clinicId, companyId)
  }

  revalidatePath('/dashboard/purchases')

  const partes: string[] = []
  if (novas) partes.push(`${novas} nota(s) nova(s)`)
  if (comXml) partes.push(`${comXml} com XML disponível`)
  if (manifestadas) partes.push(`${manifestadas} liberada(s) para download`)

  return {
    novas, comXml, aguardando: false,
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
