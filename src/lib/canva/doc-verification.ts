import 'server-only'

/**
 * Contexto `doc` de autenticidade para o print de documentos Canvas:
 * código formatado, URL pública, QR (SVG gerado no servidor — nada de
 * fetch no cliente, o html2canvas rasteriza direto) e carimbos de emissão.
 */

import QRCode from 'qrcode'
import { formatVerifyCode } from '@/lib/portal/laudo-verify'

export interface DocVerificationInput {
  verifyCode: string | null | undefined
  origin: string
  signedAt?: string | null
  signerName?: string | null
  signerCrmv?: string | null
}

export function buildVerifyUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/public/verificar/${code}`
}

export async function buildDocVerificationContext(input: DocVerificationInput): Promise<Record<string, unknown>> {
  const printedAt = new Date().toISOString()
  if (!input.verifyCode) return { printed_at: printedAt }
  const verifyUrl = buildVerifyUrl(input.origin, input.verifyCode)
  let qrSvg: string | null = null
  try {
    const raw = await QRCode.toString(verifyUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
    // Sem width/height o <svg> inline não ocupa o container — força 100%.
    qrSvg = raw.replace(/<svg\s/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ')
  } catch {
    qrSvg = null
  }
  return {
    printed_at: printedAt,
    verify_code: input.verifyCode,
    verify_code_fmt: formatVerifyCode(input.verifyCode),
    verify_url: verifyUrl,
    qr_svg: qrSvg,
    signed_at: input.signedAt ?? null,
    signer_name: input.signerName ?? null,
    signer_crmv: input.signerCrmv ?? null,
  }
}
