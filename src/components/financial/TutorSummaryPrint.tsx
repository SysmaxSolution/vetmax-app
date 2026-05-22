'use client'

import { Printer } from 'lucide-react'
import type { CheckoutInsurancePreview } from '@/lib/actions/insurance-checkout.types'

interface Props {
  consultationId: string
  patientName:    string
  tutorName:      string
  serviceDate:    string
  preview:        CheckoutInsurancePreview
  clinicName?:    string
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtBR = (iso: string) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Botão que abre o resumo financeiro do atendimento em janela de impressão
 * (o tutor leva pra casa). Usa o navegador para gerar PDF — sem servidor.
 */
export default function TutorSummaryPrint(props: Props) {
  const { patientName, tutorName, serviceDate, preview, clinicName } = props

  function handlePrint() {
    const w = window.open('', '_blank', 'width=720,height=920')
    if (!w) return
    w.document.write(buildHtml({ patientName, tutorName, serviceDate, preview, clinicName }))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <button
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 px-3 py-1.5 rounded-lg border border-sky-200 hover:bg-sky-50"
    >
      <Printer className="h-3.5 w-3.5" />
      Resumo para o tutor
    </button>
  )
}

function buildHtml(props: Omit<Props, 'consultationId'>): string {
  const { patientName, tutorName, serviceDate, preview, clinicName } = props
  const t = preview.totals

  const rows = preview.items.map(it => `
    <tr>
      <td>${escapeHtml(it.description)}</td>
      <td class="num">${BRL(it.total_price)}</td>
      <td class="num">${it.charge_now > 0 ? BRL(it.charge_now) : '—'}</td>
      <td class="num">${it.deferred_provider > 0 ? BRL(it.deferred_provider) : '—'}</td>
      <td class="num">${it.receivable > 0 ? BRL(it.receivable) : '—'}</td>
    </tr>
  `).join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Resumo Financeiro · ${escapeHtml(patientName)}</title>
<style>
  * { box-sizing: border-box }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; color: #1e293b; }
  h1 { font-size: 18px; margin: 0 0 4px 0 }
  .muted { color: #64748b; font-size: 12px }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-top: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .kpi { padding: 12px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; }
  .kpi label { font-size: 10px; text-transform: uppercase; color: #475569; letter-spacing: .05em; }
  .kpi .val { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .savings { background: #ecfdf5; border-color: #a7f3d0; }
  .savings .val { color: #065f46 }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
  th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #e2e8f0 }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #475569; letter-spacing: .05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 24px; font-size: 11px; color: #64748b; }
  .footer p { margin: 4px 0 }
  @media print { body { padding: 16px } }
</style>
</head>
<body>
  <h1>${escapeHtml(clinicName ?? 'Clínica Veterinária')}</h1>
  <div class="muted">Resumo Financeiro do Atendimento</div>

  <div class="card">
    <div><strong>Pet:</strong> ${escapeHtml(patientName)}</div>
    <div><strong>Tutor:</strong> ${escapeHtml(tutorName)}</div>
    <div><strong>Atendimento:</strong> ${fmtBR(serviceDate)}</div>
    <div><strong>Convênio:</strong> ${escapeHtml(preview.provider_name ?? '—')} ${escapeHtml(preview.plan_type ?? '')}</div>
  </div>

  <div class="grid" style="margin-top:16px">
    <div class="kpi"><label>Você pagou hoje no caixa</label><div class="val">${BRL(t.charge_now)}</div></div>
    <div class="kpi"><label>Petlove cobrará no cartão</label><div class="val">${BRL(t.deferred_provider)}</div></div>
    <div class="kpi"><label>Cobertura do convênio</label><div class="val">${BRL(t.receivable)}</div></div>
    <div class="kpi savings"><label>Você economizou</label><div class="val">${BRL(t.tutor_saved)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Procedimento</th>
        <th class="num">Valor cheio</th>
        <th class="num">Caixa hoje</th>
        <th class="num">Cartão (Petlove)</th>
        <th class="num">Repasse</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <p>Cobertura do convênio: o valor de ${BRL(t.receivable)} foi absorvido pela ${escapeHtml(preview.provider_name ?? 'Petlove')} e não será cobrado de você.</p>
    <p>Coparticipação no cartão: a ${escapeHtml(preview.provider_name ?? 'Petlove')} cobra automaticamente no cartão cadastrado o valor de ${BRL(t.deferred_provider)}, em até 30 dias.</p>
    <p style="margin-top:12px; opacity:0.7">Documento informativo. Em caso de dúvidas, entre em contato com a clínica ou com a operadora.</p>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}
