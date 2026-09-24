import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPortalPetDetail } from '@/lib/actions/portal-data'
import {
  ChevronLeft, Syringe, FlaskConical, FileImage, FileText, Download, ArrowUpRight,
  ShieldCheck, CalendarClock, Pill, Phone, LineChart, Clock, Stethoscope,
} from 'lucide-react'
import PortalShareButton from '@/components/portal/PortalShareButton'
import PortalChat from '@/components/portal/PortalChat'
import TrendChart from '@/components/portal/TrendChart'
import type { PortalTimelineType } from '@/lib/portal/types'
import { portalClinicPath } from '@/lib/portal/clinic-context'

export const dynamic = 'force-dynamic'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', rabbit: '🐰', rodent: '🐭', reptile: '🦎', fish: '🐟', exotic: '🐾',
}
const serif = { fontFamily: 'var(--pt-heading-font)' }

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const s = d.length <= 10 ? d + 'T12:00:00' : d
  return new Date(s).toLocaleDateString('pt-BR')
}

const FLAG: Record<string, { txt: string; cls: string }> = {
  H: { txt: 'alto',      cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  L: { txt: 'baixo',     cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  A: { txt: 'alterado',  cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
}

const TL_META: Record<PortalTimelineType, { label: string; bg: string; icon: React.ReactNode }> = {
  consulta:  { label: 'Consulta',  bg: 'bg-[var(--pt-primary-dark)]', icon: <Stethoscope className="h-3.5 w-3.5 text-[var(--pt-accent)]" /> },
  exame:     { label: 'Exame',     bg: 'bg-[var(--pt-primary)]', icon: <FlaskConical className="h-3.5 w-3.5 text-white" /> },
  imagem:    { label: 'Imagem',    bg: 'bg-[var(--pt-primary)]', icon: <FileImage className="h-3.5 w-3.5 text-white" /> },
  vacina:    { label: 'Vacina',    bg: 'bg-[var(--pt-accent)]', icon: <Syringe className="h-3.5 w-3.5 text-white" /> },
  receita:   { label: 'Receita',   bg: 'bg-[var(--pt-accent-strong)]', icon: <Pill className="h-3.5 w-3.5 text-white" /> },
  documento: { label: 'Documento', bg: 'bg-slate-400', icon: <FileText className="h-3.5 w-3.5 text-white" /> },
}

export default async function PortalPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getPortalPetDetail(id)

  if ('error' in res) {
    if (res.error === 'auth') {
      return (
        <div className="px-5 sm:px-8 lg:px-12 py-16 text-center">
          <p className="text-[var(--pt-muted)]">Sua sessão expirou.</p>
          <p className="text-sm text-[var(--pt-muted-soft)] mt-1">Acesse novamente pelo link enviado no WhatsApp.</p>
        </div>
      )
    }
    notFound()
  }

  const pet = res
  const byPanel = new Map<string, typeof pet.exams>()
  for (const e of pet.exams) {
    const k = e.panel || 'Resultados'
    if (!byPanel.has(k)) byPanel.set(k, [])
    byPanel.get(k)!.push(e)
  }
  const nextVaccine = pet.vaccines.find(v => v.nextDueDate)

  return (
    <div>
      {/* Hero do pet — full-width */}
      {/* Gradiente em `style` (e não em classe utilitária) porque as paradas
          vêm de variáveis resolvidas em tempo de execução — assim o resultado
          não depende de como o Tailwind compila cor arbitrária com variável. */}
      <section className="relative overflow-hidden"
               style={{ background: 'linear-gradient(135deg, var(--pt-primary-dark), var(--pt-primary-mid) 55%, var(--pt-primary))' }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 15% 30%, white 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        <div className="relative w-full px-5 sm:px-8 lg:px-12 pt-6 pb-10 sm:pb-12">
          {/* Volta para o contexto da clínica DONA do pet (não para a raiz):
              é o que mantém o tutor multi-clínica dentro da mesma identidade. */}
          <Link href={pet.clinicSlug ? portalClinicPath(pet.clinicSlug) : '/portal'}
                className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white transition">
            <ChevronLeft className="h-4 w-4" />Meus pets
          </Link>
          <div className="mt-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full ring-2 ring-[var(--pt-accent-ring)] bg-[var(--pt-tint)] flex items-center justify-center text-5xl overflow-hidden flex-shrink-0">
                {pet.photoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                  : (SPECIES_EMOJI[pet.species ?? ''] ?? '🐾')}
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl text-white leading-none" style={serif}>{pet.name}</h1>
                <p className="mt-2 text-sm text-white/70">{[pet.breed, pet.clinicName].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/portal/pet/${pet.id}/imprimir`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 text-white px-4 py-3 text-sm font-medium hover:bg-white/10 transition">
                <Download className="h-4 w-4" />Histórico
              </Link>
              <Link href={`/portal/pet/${pet.id}/pre-consulta`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 text-white px-4 py-3 text-sm font-medium hover:bg-white/10 transition">
                <Stethoscope className="h-4 w-4" />Pré-consulta
              </Link>
              {pet.canBook && (
                <Link href={`/portal/pet/${pet.id}/agendar`}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--pt-accent)] text-[var(--pt-on-accent)] px-6 py-3 text-sm font-semibold hover:bg-[var(--pt-accent-light)] transition shadow-lg shadow-black/10">
                  <CalendarClock className="h-4 w-4" />Agendar consulta
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Conteúdo — full-width, grid 12 col no desktop */}
      <section className="w-full px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Coluna principal */}
          <div className="lg:col-span-8 space-y-6">
            {/* Em processamento — exames/imagens coletados, aguardando laudo */}
            {pet.processing.length > 0 && (
              <Card icon={<Clock className="h-4 w-4" />} title="Em processamento" count={pet.processing.length}>
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {pet.processing.map(p => (
                    <div key={`${p.kind}-${p.id}`} className="flex items-center justify-between gap-4 px-6 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--pt-accent-faint)]">
                          {p.kind === 'imagem' ? <FileImage className="h-4 w-4 text-[var(--pt-accent-strong)]" /> : <FlaskConical className="h-4 w-4 text-[var(--pt-accent-strong)]" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--pt-text)] truncate">{p.title}</p>
                          <p className="text-[12px] text-[var(--pt-muted-soft)]">{p.statusLabel}</p>
                        </div>
                      </div>
                      <span className="flex-none inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent-faint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--pt-accent-strong)] ring-1 ring-[var(--pt-accent-line)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pt-accent)] animate-pulse" />aguardando
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Exames — relatório de laboratório */}
            <Card icon={<FlaskConical className="h-4 w-4" />} title="Exames liberados" count={pet.exams.length}>
              {pet.exams.length === 0 ? <Empty text="Nenhum resultado liberado ainda." /> : (
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {Array.from(byPanel.entries()).map(([panel, items]) => (
                    <div key={panel} className="px-6 py-5">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-primary)]">{panel}</span>
                        <span className="flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--pt-accent-line), transparent)' }} />
                      </div>
                      <div className="space-y-2.5">
                        {items.map((e, i) => {
                          const f = e.flag && e.flag !== 'N' ? FLAG[e.flag] : null
                          return (
                            <div key={i} className="flex items-baseline justify-between gap-4">
                              <span className="text-sm text-[var(--pt-text-soft)]">{e.analyteName}</span>
                              <span className="flex items-baseline gap-2.5 text-right">
                                {f && <span className={`text-[10px] font-bold uppercase rounded-full px-1.5 py-0.5 ring-1 ${f.cls}`}>{f.txt}</span>}
                                <span className={`text-sm font-semibold tabular-nums ${f ? (e.flag === 'L' ? 'text-sky-700' : e.flag === 'H' ? 'text-rose-700' : 'text-amber-700') : 'text-[var(--pt-text)]'}`}>
                                  {e.value}{e.unit ? ` ${e.unit}` : ''}
                                </span>
                                {e.refText && <span className="text-[11px] text-[var(--pt-faint)] tabular-nums w-24">{e.refText}</span>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Evolução dos exames */}
            {pet.trends.length > 0 && (
              <Card icon={<LineChart className="h-4 w-4" />} title="Evolução dos exames" count={pet.trends.length}>
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {pet.trends.map(t => <TrendChart key={t.analyte} trend={t} />)}
                </div>
              </Card>
            )}

            {/* Imagem */}
            <Card icon={<FileImage className="h-4 w-4" />} title="Exames de imagem" count={pet.imaging.length}>
              {pet.imaging.length === 0 ? <Empty text="Nenhum exame de imagem liberado." /> : (
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {pet.imaging.map(s => (
                    <div key={s.id} className="px-6 py-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--pt-text)]">{s.title || s.modality || 'Exame de imagem'}</p>
                        <p className="text-xs text-[var(--pt-muted-soft)]">{fmtDate(s.createdAt)}{s.laudoAvailable ? ' · laudo disponível' : ' · imagens'}</p>
                      </div>
                      {s.link && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <PortalShareButton url={s.link} label="Enviar ao vet" />
                          <a href={s.link} target="_blank" rel="noopener noreferrer"
                             className="text-xs font-semibold text-[var(--pt-primary)] flex items-center gap-1 rounded-full border border-[var(--pt-border)] px-3 py-1.5 hover:border-[var(--pt-accent-ring)] whitespace-nowrap">
                            Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Receitas */}
            <Card icon={<Pill className="h-4 w-4" />} title="Receitas" count={pet.prescriptions.length}>
              {pet.prescriptions.length === 0 ? <Empty text="Nenhuma receita assinada." /> : (
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {pet.prescriptions.map(rx => (
                    <div key={rx.id} className="px-6 py-4">
                      <p className="text-sm font-medium text-[var(--pt-text)] flex items-center gap-2">
                        {rx.medication}
                        {rx.isControlled && <span className="text-[10px] font-bold uppercase bg-sky-50 text-sky-700 ring-1 ring-sky-200 rounded-full px-1.5 py-0.5">controlado</span>}
                      </p>
                      <p className="text-xs text-[var(--pt-muted)] mt-0.5">{[rx.dose, rx.form, rx.route].filter(Boolean).join(' · ')}</p>
                      <p className="text-[11px] text-[var(--pt-muted-soft)] mt-0.5">Prescrita em {fmtDate(rx.signedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Documentos */}
            <Card icon={<FileText className="h-4 w-4" />} title="Documentos" count={pet.documents.length}>
              {pet.documents.length === 0 ? <Empty text="Nenhum documento disponível." /> : (
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {pet.documents.map(d => (
                    <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                       className="px-6 py-4 flex items-center justify-between gap-3 hover:bg-[var(--pt-tint)]">
                      <div>
                        <p className="text-sm font-medium text-[var(--pt-text)]">{d.name}</p>
                        <p className="text-xs text-[var(--pt-muted-soft)]">{fmtDate(d.createdAt)}</p>
                      </div>
                      <Download className="h-4 w-4 text-[var(--pt-primary)] flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </Card>

            {/* Linha do tempo de saúde */}
            {pet.timeline.length > 0 && (
              <Card icon={<Clock className="h-4 w-4" />} title="Linha do tempo" count={pet.timeline.length}>
                <ol className="px-6 py-4 space-y-4">
                  {pet.timeline.map((ev, i) => {
                    const m = TL_META[ev.type]
                    return (
                      <li key={i} className="relative flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`h-7 w-7 rounded-full flex items-center justify-center ${m.bg}`}>{m.icon}</span>
                          {i < pet.timeline.length - 1 && <span className="w-px flex-1 bg-[var(--pt-border-soft)] mt-1" />}
                        </div>
                        <div className="pb-1 -mt-0.5">
                          <p className="text-sm font-medium text-[var(--pt-text)]">{ev.title}</p>
                          <p className="text-xs text-[var(--pt-muted-soft)]">{m.label} · {fmtDate(ev.date)}{ev.subtitle ? ` · ${ev.subtitle}` : ''}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            )}
          </div>

          {/* Coluna lateral (rail) */}
          <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 self-start">
            {/* Fale com a clínica */}
            <PortalChat petId={pet.id} />

            {/* Vacinas */}
            <Card icon={<Syringe className="h-4 w-4" />} title="Vacinas" count={pet.vaccines.length}>
              {pet.vaccines.length === 0 ? <Empty text="Nenhuma vacina registrada." /> : (
                <div className="divide-y divide-[var(--pt-border-soft)]">
                  {pet.vaccines.map(v => (
                    <div key={v.id} className="px-6 py-3.5">
                      <p className="text-sm font-medium text-[var(--pt-text)]">{v.vaccineName}</p>
                      <p className="text-xs text-[var(--pt-muted-soft)]">Aplicada em {fmtDate(v.dateAdministered)}</p>
                      {v.nextDueDate && <p className="text-[11px] text-[var(--pt-primary)] mt-0.5">Próxima: {fmtDate(v.nextDueDate)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {nextVaccine?.nextDueDate && (
              <div className="rounded-2xl bg-[var(--pt-primary-dark)] text-white p-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--pt-accent)]">Próxima vacina</p>
                <p className="mt-2 text-lg" style={serif}>{nextVaccine.vaccineName}</p>
                <p className="text-sm text-white/70 mt-1">{fmtDate(nextVaccine.nextDueDate)}</p>
              </div>
            )}

            <div className="rounded-2xl border border-[var(--pt-border)] bg-white p-5">
              <p className="text-[11px] text-[var(--pt-muted)] leading-relaxed flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--pt-primary)] flex-shrink-0 mt-0.5" />
                As informações são liberadas pelo médico-veterinário responsável.
              </p>
              {pet.clinicPhone && (
                <p className="text-xs text-[var(--pt-muted)] mt-3 flex items-center gap-2 pt-3 border-t border-[var(--pt-border-soft)]">
                  <Phone className="h-3.5 w-3.5 text-[var(--pt-accent)]" />Dúvidas? {pet.clinicPhone}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function Card({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--pt-border)] overflow-hidden shadow-[0_1px_2px_rgba(16,34,28,0.04)]">
      <div className="px-6 py-4 border-b border-[var(--pt-border-soft)] flex items-center gap-2.5">
        <span className="text-[var(--pt-primary)]">{icon}</span>
        <h2 className="text-[15px] text-[var(--pt-text)]" style={{ fontFamily: 'var(--pt-heading-font)' }}>{title}</h2>
        {count > 0 && <span className="text-xs text-[var(--pt-faint)]">({count})</span>}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-6 py-8 text-sm text-[var(--pt-faint)] text-center">{text}</p>
}
