import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateVerifyCode, sha256Hex, hashCanvasDocument } from '@/lib/portal/laudo-verify'
import QRCode from 'qrcode'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const BUCKET = 'patient-documents'

export interface LaudoVerification {
  found: boolean
  integrity: 'ok' | 'tampered' | 'unknown'
  documentName: string | null
  petName: string | null
  clinicName: string | null
  signerName: string | null
  signerCrmv: string | null
  signedAt: string | null
  contentHash: string | null
}

/**
 * Assina o laudo (documento): carimba QR + linha de autenticidade no PDF,
 * calcula o hash SHA-256 do PDF FINAL e grava código/hash/assinante.
 * Idempotente: se já assinado (verify_code presente), não recarimba.
 * Best-effort: nunca lança (falha de PDF não deve travar a liberação do laudo).
 */
export async function signLaudoDocument(
  documentId: string, clinicId: string,
  signer: { id: string; name: string | null; crmv: string | null },
  origin: string,
): Promise<{ verifyCode: string } | { skipped: string }> {
  try {
    const admin = createAdminClient()
    const { data: doc } = await admin
      .from('patient_documents')
      .select('id, generated_pdf_path, verify_code, document_name')
      .eq('id', documentId).eq('clinic_id', clinicId).maybeSingle()
    if (!doc) return { skipped: 'doc_not_found' }
    if ((doc as any).verify_code) return { verifyCode: (doc as any).verify_code } // já assinado
    const path = (doc as any).generated_pdf_path as string | null
    if (!path) return { skipped: 'no_pdf' }

    // baixa o PDF atual
    const { data: file } = await admin.storage.from(BUCKET).download(path)
    if (!file) return { skipped: 'download_failed' }
    const bytes = new Uint8Array(await file.arrayBuffer())

    const verifyCode = generateVerifyCode()
    const verifyUrl = `${origin}/public/verificar/${verifyCode}`

    // carimba QR + linha de autenticidade no rodapé (best-effort)
    let finalBytes: Uint8Array = bytes
    try {
      const pdf = await PDFDocument.load(bytes)
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 120 })
      const qrPng = await pdf.embedPng(qrDataUrl)
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const pages = pdf.getPages()
      const last = pages[pages.length - 1]
      const { width } = last.getSize()
      const qrSize = 46, pad = 24
      last.drawImage(qrPng, { x: width - pad - qrSize, y: pad, width: qrSize, height: qrSize })
      const lines = [
        'Documento autenticado eletronicamente.',
        signer.crmv ? `Liberado por ${signer.name ?? 'MV'} — CRMV ${signer.crmv}` : `Liberado por ${signer.name ?? 'MV'}`,
        `Verifique em ${verifyUrl}`,
        `Código: ${verifyCode}`,
      ]
      lines.forEach((ln, i) => last.drawText(ln, {
        x: pad, y: pad + qrSize - 8 - i * 10, size: 7, font, color: rgb(0.35, 0.35, 0.35),
      }))
      finalBytes = await pdf.save()
      await admin.storage.from(BUCKET).update(path, Buffer.from(finalBytes), { contentType: 'application/pdf', upsert: true })
    } catch {
      // se o carimbo falhar (PDF protegido/corrompido), assina o PDF original sem QR embutido
      finalBytes = bytes
    }

    const contentHash = sha256Hex(finalBytes)
    await admin.from('patient_documents').update({
      content_hash: contentHash, verify_code: verifyCode,
      signed_by: signer.id, signed_at: new Date().toISOString(),
      signer_name: signer.name, signer_crmv: signer.crmv,
    }).eq('id', documentId)
    return { verifyCode }
  } catch {
    return { skipped: 'error' }
  }
}

/** Consulta pública de autenticidade por código (recomputa o hash do PDF atual). */
export async function getLaudoVerification(code: string): Promise<LaudoVerification> {
  const empty: LaudoVerification = {
    found: false, integrity: 'unknown', documentName: null, petName: null,
    clinicName: null, signerName: null, signerCrmv: null, signedAt: null, contentHash: null,
  }
  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('patient_documents')
    .select('id, document_name, generated_pdf_path, content_hash, signer_name, signer_crmv, signed_at, patient_id, clinic_id, canvas_state_snapshot, content_json')
    .eq('verify_code', code).maybeSingle()
  if (!doc) return empty

  const [{ data: pet }, { data: clinic }] = await Promise.all([
    admin.from('patients').select('name').eq('id', (doc as any).patient_id).maybeSingle(),
    admin.from('clinics').select('name').eq('id', (doc as any).clinic_id).maybeSingle(),
  ])

  // Integridade: (a) laudo com PDF no storage → hash do arquivo atual;
  // (b) documento do motor Canvas (print client-side, sem PDF) → hash do
  //     snapshot do layout + conteúdo preenchido (hashCanvasDocument).
  let integrity: LaudoVerification['integrity'] = 'unknown'
  const path = (doc as any).generated_pdf_path as string | null
  const storedHash = (doc as any).content_hash as string | null
  if (path && storedHash) {
    try {
      const { data: file } = await admin.storage.from(BUCKET).download(path)
      if (file) integrity = sha256Hex(new Uint8Array(await file.arrayBuffer())) === storedHash ? 'ok' : 'tampered'
    } catch { integrity = 'unknown' }
  } else if (storedHash && ((doc as any).canvas_state_snapshot || (doc as any).content_json)) {
    integrity = hashCanvasDocument((doc as any).canvas_state_snapshot ?? null, (doc as any).content_json ?? null) === storedHash
      ? 'ok' : 'tampered'
  }

  return {
    found: true, integrity,
    documentName: (doc as any).document_name ?? 'Laudo',
    petName: (pet as any)?.name ?? null,
    clinicName: (clinic as any)?.name ?? null,
    signerName: (doc as any).signer_name ?? null,
    signerCrmv: (doc as any).signer_crmv ?? null,
    signedAt: (doc as any).signed_at ?? null,
    contentHash: storedHash,
  }
}
