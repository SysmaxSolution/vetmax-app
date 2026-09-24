'use server'

// Entrega do Extrato do Cliente: gera o PDF, guarda no Storage e envia.
//
// Ana Lucia (18/09/2026): "entregar para o meu cliente, enviar um PDF para ele".
//
// Reaproveita o caminho já provado pelo Orçamento de Serviços
// (generateBillingDocumentPdf / sendBillingDocumentWhatsApp): render no
// servidor -> upload em `clinic-attachments` -> URL assinada -> anexo no
// WhatsApp via Evolution. O e-mail usa o Resend que já está configurado; é o
// primeiro envio COM ANEXO do projeto (os demais mandam link).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientStatement } from '@/lib/actions/client-statement'
import type { ClientKind, ClientStatementResult } from '@/lib/reports/client-statement-logic'

interface StatementParams {
  from:        string
  to:          string
  client_kind: ClientKind
  client_id:   string
  company_id?: string | null
}

async function getClinicId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  return (profile?.clinic_id as string | undefined) ?? null
}

const BRL = (v: number) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtBR = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/** `extrato-joao-da-silva-2026-09-01-a-2026-09-30.pdf` */
function fileNameFor(data: ClientStatementResult): string {
  const slug = data.client.name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'cliente'
  return `extrato-${slug}-${data.filters.from}-a-${data.filters.to}.pdf`
}

// ─── Geração ──────────────────────────────────────────────────────────────────

/**
 * Gera o PDF do extrato e devolve URL assinada (1h) + nome do arquivo.
 * Caminho determinístico com upsert: regerar o mesmo recorte sobrescreve em vez
 * de empilhar arquivos órfãos no bucket.
 */
export async function generateClientStatementPdf(
  params: StatementParams,
): Promise<{ signed_url: string; file_name: string; storage_path: string } | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const data = await getClientStatement(params)
  if ('error' in data) return { error: data.error }

  // Lib pesada sob demanda — fica fora do bundle das páginas.
  const { renderClientStatementPdfBuffer } = await import('@/lib/reports/render-client-statement-pdf')
  let buffer: Buffer
  try {
    buffer = await renderClientStatementPdfBuffer(data)
  } catch (e) {
    return { error: 'Falha ao gerar o PDF: ' + (e instanceof Error ? e.message : 'erro') }
  }

  const fileName    = fileNameFor(data)
  const storagePath = `${clinicId}/statements/${params.client_kind}-${params.client_id}/${fileName}`

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from('clinic-attachments')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })
  if (upErr) return { error: 'Erro ao salvar o PDF: ' + upErr.message }

  const { data: signed } = await admin.storage
    .from('clinic-attachments')
    .createSignedUrl(storagePath, 3600)

  return { signed_url: signed?.signedUrl ?? '', file_name: fileName, storage_path: storagePath }
}

// ─── Mensagem padrão ──────────────────────────────────────────────────────────

function statementMessage(data: ClientStatementResult): string {
  const t = data.summary.totals
  const periodo = `${fmtBR(data.filters.from)} a ${fmtBR(data.filters.to)}`
  const saudacao = `Olá, ${data.client.name}!`
  const corpo = `Segue em anexo o seu extrato de ${periodo} junto à ${data.clinic.name}.`
  const pago = `Pago no período: ${BRL(t.paid_total)}`
  const aberto = t.pending_total > 0
    ? `Em aberto: ${BRL(t.pending_total)}${t.overdue_total > 0 ? ` (vencido: ${BRL(t.overdue_total)})` : ''}`
    : 'Não há títulos em aberto no período.'
  return `${saudacao} ${corpo}\n\n${pago}\n${aberto}\n\nQualquer dúvida, estamos à disposição. 🐾`
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Envia o extrato por WhatsApp. Para TUTOR passa `tutorId`, que dispara a
 * checagem de consentimento LGPD dentro de `sendWhatsAppMessage`. Para CLÍNICA
 * PARCEIRA / PROTETOR não há tutor: é contato comercial B2B (CNPJ), fora do
 * escopo do consentimento de titular — por isso `tutorId` vai indefinido.
 */
export async function sendClientStatementWhatsApp(
  params: StatementParams & { phone?: string },
): Promise<{ success: true } | { error: string }> {
  const data = await getClientStatement(params)
  if ('error' in data) return { error: data.error }

  const phone = params.phone || data.client.phone
  if (!phone) {
    return { error: data.client.kind === 'tutor'
      ? 'Tutor sem telefone cadastrado.'
      : 'Clínica parceira sem telefone cadastrado.' }
  }

  const pdf = await generateClientStatementPdf(params)
  if ('error' in pdf) return { error: pdf.error }

  const { sendWhatsAppMessage } = await import('./whatsapp')
  const res = await sendWhatsAppMessage({
    phone,
    message:     statementMessage(data),
    trigger:     'documents_sent',
    tutorName:   data.client.name,
    tutorId:     data.client.kind === 'tutor' ? data.client.id : undefined,
    attachments: [{ name: pdf.file_name, signedUrl: pdf.signed_url, mimeType: 'application/pdf' }],
  })
  if ('error' in res) return { error: res.error }
  return { success: true }
}

// ─── E-mail ───────────────────────────────────────────────────────────────────

const FROM = 'SysVetMax <noreply@sysmaxsolutions.com>'

function emailHtml(data: ClientStatementResult): string {
  const t = data.summary.totals
  const periodo = `${fmtBR(data.filters.from)} a ${fmtBR(data.filters.to)}`
  const linha = (label: string, value: string, color: string) =>
    `<tr><td style="padding:6px 0;color:#475569;font-size:13px;">${label}</td>` +
    `<td style="padding:6px 0;text-align:right;font-size:14px;font-weight:700;color:${color};">${value}</td></tr>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#16a34a;padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escapeHtml(data.clinic.name)}</h1>
      <p style="margin:6px 0 0;color:#dcfce7;font-size:13px;">Extrato do cliente</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="margin:0 0 14px;font-size:15px;color:#0f172a;">Olá, <strong>${escapeHtml(data.client.name)}</strong>!</p>
      <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.6;">
        Segue em anexo o seu extrato referente ao período de <strong>${periodo}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;">
        ${linha('Pago no período', BRL(t.paid_total), '#16a34a')}
        ${linha('Em aberto', BRL(t.pending_total), '#b45309')}
        ${t.overdue_total > 0 ? linha('Vencido', BRL(t.overdue_total), '#b91c1c') : ''}
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#94a3b8;">
        Qualquer dúvida sobre este extrato, estamos à disposição.
      </p>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">${escapeHtml(data.clinic.name)}${data.clinic.phone ? ' · ' + escapeHtml(data.clinic.phone) : ''}</p>
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Envia o extrato por e-mail com o PDF ANEXADO (não link): é um documento que o
 * cliente arquiva. Primeiro envio com anexo do projeto — os demais e-mails
 * transacionais mandam link.
 */
export async function sendClientStatementEmail(
  params: StatementParams & { email?: string },
): Promise<{ success: true } | { error: string }> {
  if (!process.env.RESEND_API_KEY) return { error: 'Envio de e-mail não configurado.' }

  const data = await getClientStatement(params)
  if ('error' in data) return { error: data.error }

  const to = params.email || data.client.email
  if (!to) return { error: 'Cliente sem e-mail cadastrado.' }

  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const { renderClientStatementPdfBuffer } = await import('@/lib/reports/render-client-statement-pdf')
  let buffer: Buffer
  try {
    buffer = await renderClientStatementPdfBuffer(data)
  } catch (e) {
    return { error: 'Falha ao gerar o PDF: ' + (e instanceof Error ? e.message : 'erro') }
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const periodo = `${fmtBR(data.filters.from)} a ${fmtBR(data.filters.to)}`

  const { error } = await resend.emails.send({
    from:    FROM,
    to,
    subject: `Extrato ${periodo} · ${data.clinic.name}`,
    html:    emailHtml(data),
    attachments: [{ filename: fileNameFor(data), content: buffer.toString('base64') }],
  })
  if (error) return { error: 'Erro ao enviar e-mail: ' + error.message }
  return { success: true }
}
