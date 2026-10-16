// Resolve o fornecedor de um boleto do DDA: acha, adota ou cria — sempre pelo
// DOCUMENTO, nunca pelo nome.
//
// Por quê o documento: o DDA do Sicoob devolve a razão social **truncada em 40
// caracteres**. Medido na resposta real da Clínica Animais:
// "SAPRA LANDAUER SERVICO DE ASSESSORIA E P" — cortado no meio da palavra.
// Cadastrar por esse nome e, mais tarde, alguém digitar o nome completo cria
// dois fornecedores para o mesmo CNPJ e parte o histórico de compras em dois.
// O CNPJ não varia; o nome varia conforme a origem (boleto, XML de NF-e,
// digitação).
//
// O nome bom vem da consulta pública de CNPJ (`lookupCnpj`), que já existe no
// projeto e devolve razão social completa, nome fantasia, endereço, telefone e
// e-mail. O nome do banco só é usado se a consulta falhar.

import type { SupabaseClient } from '@supabase/supabase-js'
import { lookupCnpj } from '@/lib/cnpj'

export type OrigemFornecedor = 'encontrado' | 'adotado' | 'criado' | 'sem_documento' | 'erro'

export interface FornecedorResolvido {
  supplier_id: string | null
  origem:      OrigemFornecedor
  nome:        string | null
  /** true quando o nome veio da consulta pública, não do texto truncado do banco. */
  nome_enriquecido: boolean
  erro?:       string
}

export interface DadosDoBoleto {
  beneficiary:     string | null
  beneficiary_doc: string | null
}

/** Só dígitos — é assim que o índice único compara, e como o mesmo CNPJ chega mascarado ou limpo. */
export function apenasDigitos(doc: string | null | undefined): string {
  return String(doc ?? '').replace(/\D/g, '')
}

/** 14 dígitos = CNPJ, 11 = CPF. Qualquer outra coisa não serve como chave. */
export function documentoValido(doc: string | null | undefined): boolean {
  const d = apenasDigitos(doc)
  return d.length === 14 || d.length === 11
}

export function formatarCnpj(doc: string): string {
  const d = apenasDigitos(doc)
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return doc
}

/**
 * Procura, adota ou cria o fornecedor.
 *
 * A ordem importa e cada passo existe por um motivo:
 *
 *  1. **Por documento** — é a chave de verdade. Compara só dígitos, porque o
 *     mesmo CNPJ entra ora mascarado, ora limpo.
 *  2. **Adoção de cadastro sem documento** — a clínica costuma ter o fornecedor
 *     digitado à mão, sem CNPJ, antes do primeiro boleto. Criar um segundo
 *     seria duplicar; o certo é completar o que já existe.
 *  3. **Criar** — com os dados da consulta pública. Se o nome colidir com um
 *     cadastro de OUTRO documento, desambigua com o CNPJ no fim, porque a
 *     trava por nome continua valendo para quem não tem documento.
 *
 * Nunca lança: devolve `origem: 'erro'` com a mensagem. Fornecedor é
 * conveniência — não pode derrubar o lançamento do título a pagar.
 */
export async function resolverFornecedor(
  admin:    SupabaseClient,
  clinicId: string,
  boleto:   DadosDoBoleto,
  opcoes:   { criarSeNaoExistir?: boolean; consultarCnpj?: boolean; userId?: string | null } = {},
): Promise<FornecedorResolvido> {
  const criar     = opcoes.criarSeNaoExistir !== false
  const consultar = opcoes.consultarCnpj !== false
  const doc       = apenasDigitos(boleto.beneficiary_doc)
  const nomeBanco = (boleto.beneficiary ?? '').trim() || null

  if (!documentoValido(doc)) {
    return { supplier_id: null, origem: 'sem_documento', nome: nomeBanco, nome_enriquecido: false }
  }

  try {
    // ── 1. por documento ────────────────────────────────────────────────────
    const { data: porDoc } = await admin
      .from('suppliers')
      .select('id, name, document')
      .eq('clinic_id', clinicId)
      .not('document', 'is', null)

    const achado = (porDoc ?? []).find(s => apenasDigitos((s as { document: string }).document) === doc)
    if (achado) {
      const s = achado as { id: string; name: string }
      return { supplier_id: s.id, origem: 'encontrado', nome: s.name, nome_enriquecido: false }
    }

    if (!criar) {
      return { supplier_id: null, origem: 'sem_documento', nome: nomeBanco, nome_enriquecido: false }
    }

    // ── nome bom: consulta pública antes de gravar qualquer coisa ──────────
    let nome = nomeBanco
    let enriquecido = false
    let extras: { phone?: string; email?: string; address?: string } = {}

    if (consultar && doc.length === 14) {
      const r = await lookupCnpj(doc)
      if (r.ok && r.razao_social) {
        nome = r.razao_social
        enriquecido = true
        extras = { phone: r.phone || undefined, email: r.email || undefined, address: r.address || undefined }
      }
    }
    if (!nome) nome = `Fornecedor ${formatarCnpj(doc)}`

    // ── 2. adotar cadastro de mesmo nome que esteja SEM documento ──────────
    const { data: porNome } = await admin
      .from('suppliers')
      .select('id, name, document')
      .eq('clinic_id', clinicId)
      .in('name', [nome, nomeBanco].filter(Boolean) as string[])

    const semDoc = (porNome ?? []).find(s => !apenasDigitos((s as { document: string | null }).document))
    if (semDoc) {
      const s = semDoc as { id: string; name: string }
      const patch: Record<string, unknown> = { document: formatarCnpj(doc) }
      // Só completa o que está vazio — não sobrescreve o que a clínica digitou.
      if (enriquecido) {
        if (extras.phone)   patch.phone = extras.phone
        if (extras.email)   patch.email = extras.email
        if (extras.address) patch.address = extras.address
        if (nome && nome !== s.name) patch.name = nome
      }
      const { error } = await admin.from('suppliers').update(patch).eq('id', s.id).eq('clinic_id', clinicId)
      if (error) return { supplier_id: s.id, origem: 'adotado', nome: s.name, nome_enriquecido: false }
      return { supplier_id: s.id, origem: 'adotado', nome: (patch.name as string) ?? s.name, nome_enriquecido: enriquecido }
    }

    // ── 3. criar ────────────────────────────────────────────────────────────
    const ocupado = (porNome ?? []).some(s => (s as { name: string }).name === nome)
    const nomeFinal = ocupado ? `${nome} (${formatarCnpj(doc)})` : nome

    const { data: novo, error } = await admin.from('suppliers').insert({
      clinic_id: clinicId,
      name:      nomeFinal,
      document:  formatarCnpj(doc),
      category:  'Fornecedores',
      is_active: true,
      phone:     extras.phone ?? null,
      email:     extras.email ?? null,
      address:   extras.address ?? null,
      notes:     'Cadastrado automaticamente a partir do DDA do banco.',
      created_by: opcoes.userId ?? null,
    }).select('id').single()

    if (error || !novo) {
      return { supplier_id: null, origem: 'erro', nome: nomeFinal, nome_enriquecido: enriquecido,
               erro: error?.message ?? 'não foi possível criar o fornecedor' }
    }
    return { supplier_id: (novo as { id: string }).id, origem: 'criado', nome: nomeFinal, nome_enriquecido: enriquecido }
  } catch (e) {
    return { supplier_id: null, origem: 'erro', nome: nomeBanco, nome_enriquecido: false,
             erro: e instanceof Error ? e.message : 'falha ao resolver fornecedor' }
  }
}

/**
 * O nome veio truncado do banco?
 *
 * O DDA corta a razão social em 40 caracteres. Medido nos fornecedores reais
 * da Clínica Animais: 5 dos 11 chegaram no limite, cortados no meio da
 * palavra ("...ASSESSORIA E P"). Não há campo que avise — o corte só se
 * reconhece pelo comprimento.
 */
export function pareceTruncado(nome: string | null | undefined): boolean {
  const n = (nome ?? '').trim()
  return n.length >= 39
}

/** Falta dado que a consulta pública preencheria? */
export function precisaEnriquecer(s: { name?: string | null; address?: string | null; phone?: string | null }): boolean {
  return pareceTruncado(s.name) || (!s.address && !s.phone)
}

/**
 * Completa um fornecedor já cadastrado com os dados da Receita.
 *
 * Existe porque **a consulta pública estrangula**: medido contra os CNPJs
 * reais da clínica, as duas fontes (`publica.cnpj.ws` e BrasilAPI) devolvem
 * HTTP 429 a partir da 5ª ou 6ª chamada seguida, mesmo com 1,2 s de intervalo.
 * Consultar 11 fornecedores no clique de "lançar" não funciona — e travar o
 * lançamento do título à espera disso seria pior ainda.
 *
 * Então o cadastro nasce com o nome que o banco deu (ainda que truncado), a
 * amarração pelo CNPJ é feita na hora — que é a parte que importa e nunca
 * falha — e o nome bom entra depois, por aqui. Como a chave é o documento,
 * renomear depois é seguro.
 */
export async function enriquecerFornecedor(
  admin:    SupabaseClient,
  clinicId: string,
  fornecedor: { id: string; name: string; document: string | null; address?: string | null; phone?: string | null },
): Promise<{ ok: true; alterado: boolean; nome?: string } | { ok: false; motivo: 'sem_documento' | 'nao_encontrado' | 'limite' | 'erro' }> {
  const doc = apenasDigitos(fornecedor.document)
  if (doc.length !== 14) return { ok: false, motivo: 'sem_documento' }

  try {
    const r = await lookupCnpj(doc)
    if (!r.ok) return { ok: false, motivo: r.reason === 'network' ? 'limite' : 'nao_encontrado' }

    const patch: Record<string, unknown> = {}
    // Só troca o nome se o atual parece cortado e o novo é mais completo —
    // nunca sobrescreve um nome que a clínica ajustou à mão.
    if (r.razao_social && pareceTruncado(fornecedor.name) && r.razao_social.length > fornecedor.name.length) {
      patch.name = r.razao_social
    }
    if (!fornecedor.address && r.address) patch.address = r.address
    if (!fornecedor.phone && r.phone)     patch.phone = r.phone

    if (!Object.keys(patch).length) return { ok: true, alterado: false }

    const { error } = await admin.from('suppliers').update(patch).eq('id', fornecedor.id).eq('clinic_id', clinicId)
    if (error) {
      // Colisão com a trava por nome: outro cadastro já usa a razão social
      // completa. Mantém o nome atual e grava só o resto.
      delete patch.name
      if (!Object.keys(patch).length) return { ok: true, alterado: false }
      const { error: e2 } = await admin.from('suppliers').update(patch).eq('id', fornecedor.id).eq('clinic_id', clinicId)
      if (e2) return { ok: false, motivo: 'erro' }
      return { ok: true, alterado: true }
    }
    return { ok: true, alterado: true, nome: patch.name as string | undefined }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}
