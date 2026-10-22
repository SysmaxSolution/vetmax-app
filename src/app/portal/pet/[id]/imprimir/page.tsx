import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPortalPetDetail } from '@/lib/actions/portal-data'
import PrintButton from '@/components/portal/PrintButton'
import { ChevronLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const s = d.length <= 10 ? d + 'T12:00:00' : d
  return new Date(s).toLocaleDateString('pt-BR')
}

export default async function PortalPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getPortalPetDetail(id)
  if ('error' in res) {
    if (res.error === 'auth') return <div className="px-6 py-16 text-center text-slate-500">Sua sessão expirou.</div>
    notFound()
  }
  const pet = res

  return (
    <div className="w-full px-5 sm:px-8 lg:px-12 py-8 print:px-0 print:py-0">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link href={`/portal/pet/${id}`} className="inline-flex items-center gap-1 text-sm text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)]">
            <ChevronLeft className="h-4 w-4" />Voltar ao pet
          </Link>
          <PrintButton />
        </div>

        {/* Documento */}
        <div className="bg-white text-slate-900 print:text-black">
          {/* Cabeçalho */}
          <div className="border-b-2 border-slate-800 pb-3 mb-5 flex items-baseline justify-between">
            <div>
              <p className="text-lg font-bold">{pet.clinicName}</p>
              <p className="text-xs text-slate-500">Histórico de saúde — Portal do Tutor</p>
            </div>
            <p className="text-xs text-slate-500">Emitido em {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          {/* Pet */}
          <table className="w-full text-sm mb-6">
            <tbody>
              <tr><td className="py-0.5 pr-4 text-slate-500 w-32">Paciente</td><td className="font-medium">{pet.name}</td></tr>
              {pet.breed && <tr><td className="py-0.5 pr-4 text-slate-500">Raça</td><td>{pet.breed}</td></tr>}
              {pet.clinicPhone && <tr><td className="py-0.5 pr-4 text-slate-500">Clínica</td><td>{pet.clinicPhone}</td></tr>}
            </tbody>
          </table>

          <Section title="Vacinas">
            {pet.vaccines.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="py-1 font-medium">Vacina</th><th className="py-1 font-medium">Aplicada</th><th className="py-1 font-medium">Próxima</th></tr></thead>
                <tbody>{pet.vaccines.map(v => <tr key={v.id} className="border-b border-slate-100"><td className="py-1">{v.vaccineName}</td><td className="py-1">{fmtDate(v.dateAdministered)}</td><td className="py-1">{fmtDate(v.nextDueDate)}</td></tr>)}</tbody>
              </table>
            )}
          </Section>

          <Section title="Exames liberados">
            {pet.exams.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="py-1 font-medium">Painel</th><th className="py-1 font-medium">Analito</th><th className="py-1 font-medium text-right">Resultado</th><th className="py-1 font-medium text-right">Referência</th></tr></thead>
                <tbody>{pet.exams.map((e, i) => <tr key={i} className="border-b border-slate-100"><td className="py-1 text-slate-500">{e.panel}</td><td className="py-1">{e.analyteName}</td><td className="py-1 text-right font-medium">{e.value}{e.unit ? ` ${e.unit}` : ''}{e.flag && e.flag !== 'N' ? ' *' : ''}</td><td className="py-1 text-right text-slate-400">{e.refText ?? ''}</td></tr>)}</tbody>
              </table>
            )}
          </Section>

          <Section title="Exames de imagem">
            {pet.imaging.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
              <ul className="text-sm space-y-1">{pet.imaging.map(s => <li key={s.id}>{s.title || s.modality || 'Exame de imagem'} — {fmtDate(s.createdAt)}{s.laudoAvailable ? ' (laudo disponível)' : ''}</li>)}</ul>
            )}
          </Section>

          <Section title="Receitas">
            {pet.prescriptions.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
              <ul className="text-sm space-y-1">{pet.prescriptions.map(rx => <li key={rx.id}><span className="font-medium">{rx.medication}</span>{[rx.dose, rx.form, rx.route].filter(Boolean).length ? ` — ${[rx.dose, rx.form, rx.route].filter(Boolean).join(' · ')}` : ''} ({fmtDate(rx.signedAt)})</li>)}</ul>
            )}
          </Section>

          <Section title="Linha do tempo">
            {pet.timeline.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
              <ul className="text-sm space-y-1">{pet.timeline.map((ev, i) => <li key={i}><span className="text-slate-500">{fmtDate(ev.date)}</span> — {ev.title}{ev.subtitle ? ` (${ev.subtitle})` : ''}</li>)}</ul>
            )}
          </Section>

          <p className="text-[10px] text-slate-400 mt-8 pt-3 border-t border-slate-200">
            Documento gerado pelo Portal do Tutor sob responsabilidade do médico-veterinário. * valor fora da faixa de referência.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-2">{title}</h2>
      {children}
    </div>
  )
}
