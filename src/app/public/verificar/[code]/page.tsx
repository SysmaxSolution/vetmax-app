import { getLaudoVerification } from '@/lib/actions/laudo-signature'
import { normalizeVerifyCode, formatVerifyCode } from '@/lib/portal/laudo-verify'
import { ShieldCheck, ShieldAlert, ShieldQuestion, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const v = await getLaudoVerification(normalizeVerifyCode(code))

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : null

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-6 justify-center text-slate-400">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-widest">Verificação de autenticidade</span>
        </div>

        {!v.found ? (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <ShieldQuestion className="h-8 w-8 text-slate-400" />
            </div>
            <h1 className="text-lg font-semibold text-slate-800">Documento não encontrado</h1>
            <p className="mt-1.5 text-sm text-slate-500">Nenhum laudo corresponde ao código <strong className="font-mono">{formatVerifyCode(code)}</strong>. Confira o código impresso no documento.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
            {/* Cabeçalho de status */}
            <div className={`px-8 py-7 text-center ${v.integrity === 'tampered' ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${v.integrity === 'tampered' ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                {v.integrity === 'tampered'
                  ? <ShieldAlert className="h-8 w-8 text-rose-600" />
                  : <ShieldCheck className="h-8 w-8 text-emerald-600" />}
              </div>
              <h1 className={`text-xl font-semibold ${v.integrity === 'tampered' ? 'text-rose-800' : 'text-emerald-800'}`}>
                {v.integrity === 'tampered' ? 'Documento alterado' : 'Documento autêntico'}
              </h1>
              <p className={`mt-1 text-sm ${v.integrity === 'tampered' ? 'text-rose-600' : 'text-emerald-700'}`}>
                {v.integrity === 'ok' && 'Emitido por esta clínica e íntegro (não foi modificado).'}
                {v.integrity === 'tampered' && 'O arquivo atual não confere com o conteúdo assinado. Não confie neste documento.'}
                {v.integrity === 'unknown' && 'Registro de emissão localizado nesta clínica.'}
              </p>
            </div>

            {/* Dados */}
            <div className="px-8 py-6">
              <Row label="Documento" value={v.documentName} />
              <Row label="Paciente" value={v.petName} />
              <Row label="Clínica" value={v.clinicName} />
              <Row label="Responsável" value={v.signerName} />
              <Row label="CRMV" value={v.signerCrmv} />
              <Row label="Liberado em" value={fmtDate(v.signedAt)} />
              {v.contentHash && (
                <div className="pt-3">
                  <span className="text-[13px] text-slate-500">Impressão digital (SHA-256)</span>
                  <p className="mt-1 font-mono text-[11px] text-slate-400 break-all leading-relaxed">{v.contentHash}</p>
                </div>
              )}
            </div>

            <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-start gap-2 text-[12px] text-slate-500">
              <FileText className="h-4 w-4 flex-none mt-0.5 text-slate-400" />
              <p>Autenticação eletrônica pelo prontuário desta clínica. A assinatura digital com certificado ICP-Brasil (quando disponível) reforça esta validação.</p>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400">Powered by SYSVETMAX</p>
      </div>
    </div>
  )
}
