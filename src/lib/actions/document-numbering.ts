'use server'

// Numeração configurável de documentos (Sprint Animais, Fase 0, peça 0.9).
// CRUD sobre document_number_sequences (migration 0421): número inicial,
// prefixo, zero-fill e ativação por tipo de documento e por empresa faturante.
// A emissão em si usa a função atômica next_document_number (SECURITY DEFINER).
// Tabelas com RLS sem policy pública → acesso via service role.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Tipos de documento oferecidos na configuração (rótulos amigáveis na UI).
export const DOC_TYPES: { key: string; label: string }[] = [
  { key: 'os',        label: 'Ordem de Serviço (nº de atendimento)' },
  { key: 'rps',       label: 'RPS (NFS-e)' },
  { key: 'nfse',      label: 'Número da NFS-e' },
  { key: 'orcamento', label: 'Orçamento' },
  { key: 'recibo',    label: 'Recibo' },
]

export interface DocumentSequence {
  id: string
  clinic_id: string
  company_id: string | null
  doc_type: string
  prefix: string
  next_number: number
  padding: number
  is_active: boolean
  company_name: string | null  // resolvido para exibição (null = Geral do grupo)
}

export interface CompanyLite {
  id: string
  code: string
  name: string
}

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, role: profile.role as string }
}

const CAN_MANAGE = ['admin', 'owner', 'manager']

export async function listCompaniesLite(): Promise<CompanyLite[]> {
  const ctx = await getCtx()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('companies')
    .select('id, code, name')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_active', true)
    .order('code', { ascending: true })
  return (data ?? []) as CompanyLite[]
}

export async function listDocumentSequences(): Promise<DocumentSequence[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()

  const [{ data: seqs, error }, { data: companies }] = await Promise.all([
    admin.from('document_number_sequences')
      .select('id, clinic_id, company_id, doc_type, prefix, next_number, padding, is_active')
      .eq('clinic_id', ctx.clinic_id)
      .order('doc_type', { ascending: true }),
    admin.from('companies').select('id, name').eq('clinic_id', ctx.clinic_id),
  ])
  if (error) return { error: `Erro ao listar numerações: ${error.message}` }

  const byId = new Map((companies ?? []).map((c: any) => [c.id, c.name as string]))
  return ((seqs ?? []) as any[]).map(s => ({
    ...s,
    next_number: Number(s.next_number),
    padding: Number(s.padding),
    company_name: s.company_id ? (byId.get(s.company_id) ?? null) : null,
  })) as DocumentSequence[]
}

export async function upsertDocumentSequence(input: {
  id?: string
  company_id: string | null
  doc_type: string
  prefix: string
  next_number: number
  padding: number
  is_active?: boolean
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }

  const docType = input.doc_type.trim()
  if (!docType) return { error: 'Informe o tipo de documento' }
  const next = Math.trunc(Number(input.next_number))
  if (!Number.isFinite(next) || next < 1) return { error: 'Número inicial deve ser ≥ 1' }
  const pad = Math.trunc(Number(input.padding))
  if (!Number.isFinite(pad) || pad < 0 || pad > 20) return { error: 'Dígitos (zero-fill) inválido (0 a 20)' }

  const admin = createAdminClient()
  const payload = {
    clinic_id: ctx.clinic_id,
    company_id: input.company_id || null,
    doc_type: docType,
    prefix: input.prefix ?? '',
    next_number: next,
    padding: pad,
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await admin
      .from('document_number_sequences')
      .update(payload)
      .eq('id', input.id)
      .eq('clinic_id', ctx.clinic_id)
      .select('id')
      .single()
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
    revalidatePath('/dashboard/management')
    return { id: data.id as string }
  }

  const { data, error } = await admin
    .from('document_number_sequences')
    .insert(payload)
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma numeração para esse tipo/empresa' }
    return { error: `Erro ao criar: ${error.message}` }
  }
  revalidatePath('/dashboard/management')
  return { id: data.id as string }
}
