import { getBoletoViewByToken } from '@/lib/actions/boleto-cobranca'
import BoletoDocument from '@/components/financial/boleto/BoletoDocument'
import PrintButton from '@/components/portal/PrintButton'

export const dynamic = 'force-dynamic'

export default async function PublicBoletoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getBoletoViewByToken(token)

  if (!view) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500 text-sm">Boleto não encontrado ou expirado.</div>
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-3">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex justify-end print:hidden"><PrintButton label="Imprimir / Salvar PDF" /></div>
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-6 print:shadow-none print:ring-0 print:p-0">
          <BoletoDocument view={view} />
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400 print:hidden">Powered by SYSVETMAX</p>
      </div>
    </div>
  )
}
