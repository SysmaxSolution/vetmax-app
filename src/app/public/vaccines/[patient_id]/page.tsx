import { notFound } from 'next/navigation'
import { getPublicPatientVaccines } from '@/lib/actions/public-data'
import { Syringe, Phone, CheckCircle2, AlertTriangle, Clock, ShieldCheck, MapPin } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { patient_id: string } }) {
  return {
    title: 'Carteira de Vacinação',
    description: 'Carteira de vacinação digital — modelo CFMV',
  }
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', rabbit: '🐰',
  rodent: '🐭', reptile: '🦎', fish: '🐟', exotic: '🐾',
}
const SPECIES_LABEL: Record<string, string> = {
  dog: 'Canina', cat: 'Felina', bird: 'Aves', rabbit: 'Lagomorfo',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}
const GENDER_LABEL: Record<string, string> = {
  male: 'Macho', female: 'Fêmea', unknown: 'Não informado',
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function ageFromBirth(birth: string | null): string | null {
  if (!birth) return null
  const b = new Date(birth + 'T12:00:00')
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months -= 1
  if (months < 0) return null
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0) return `${rem} ${rem === 1 ? 'mês' : 'meses'}`
  if (rem === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`
  return `${years}a ${rem}m`
}

function ResenhaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-medium text-slate-700 text-right">{value}</span>
    </div>
  )
}

export default async function PublicVaccinesPage({ params }: { params: { patient_id: string } }) {
  const result = await getPublicPatientVaccines(params.patient_id)

  if ('error' in result) notFound()

  const {
    petName, petSpecies, petBreed, petGender, petNeutered, petColor,
    petBirthDate, petMicrochip, tutorName, tutorCpfMasked,
    clinicName, clinicPhone, clinicCnpj, clinicAddress, clinicLogo,
    vaccines, nextDue,
  } = result

  const today = new Date().toISOString().split('T')[0]
  const age = ageFromBirth(petBirthDate)
  const birthLabel = petBirthDate
    ? `${fmtDate(petBirthDate)}${age ? ` (${age})` : ''}`
    : null
  const genderLabel = petGender
    ? `${GENDER_LABEL[petGender] ?? petGender}${petNeutered ? ' · castrado(a)' : ''}`
    : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">

      {/* Cabeçalho do estabelecimento (CFMV: identificação) */}
      <header className="bg-white shadow-sm border-b border-slate-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {clinicLogo ? (
            <img src={clinicLogo} alt={clinicName} className="h-10 w-auto object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
              <Syringe className="h-5 w-5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-tight">{clinicName}</p>
            {clinicCnpj && <p className="text-[11px] text-slate-400">CNPJ {clinicCnpj}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {clinicPhone && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Phone className="h-3 w-3" />{clinicPhone}
                </span>
              )}
              {clinicAddress && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{clinicAddress}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Título do documento */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-center">
          <div className="text-5xl mb-2">{SPECIES_EMOJI[petSpecies] ?? '🐾'}</div>
          <h1 className="text-2xl font-bold text-slate-900">{petName}</h1>
          <p className="text-sm font-semibold text-teal-700 mt-1">Carteira de Vacinação</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Documento digital · Resolução CFMV nº 1321/2020</p>
        </div>

        {/* Resenha do animal + Tutor */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Identificação do animal</h2>
          <ResenhaRow label="Espécie" value={SPECIES_LABEL[petSpecies] ?? petSpecies} />
          <ResenhaRow label="Raça" value={petBreed} />
          <ResenhaRow label="Sexo" value={genderLabel} />
          <ResenhaRow label="Pelagem" value={petColor} />
          <ResenhaRow label="Nascimento" value={birthLabel} />
          <ResenhaRow label="Microchip" value={petMicrochip} />

          {(tutorName || tutorCpfMasked) && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 mt-4">Tutor responsável</h2>
              <ResenhaRow label="Nome" value={tutorName} />
              <ResenhaRow label="CPF" value={tutorCpfMasked} />
            </>
          )}
        </div>

        {/* Próxima dose */}
        {nextDue && (
          <div className="bg-teal-600 text-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-teal-200 mb-0.5">Próxima Dose</p>
                <p className="text-lg font-bold">{nextDue.vaccine}</p>
                <p className="text-sm text-teal-100">
                  {new Date(nextDue.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Atos vacinais */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Syringe className="h-4 w-4 text-slate-400" />
              Registro de Vacinação
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {vaccines.length} ato{vaccines.length !== 1 ? 's' : ''} vacinal{vaccines.length !== 1 ? 'is' : ''} registrado{vaccines.length !== 1 ? 's' : ''}
            </p>
          </div>

          {vaccines.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Syringe className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nenhuma vacina registrada ainda</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {vaccines.map(v => {
                const isOverdue = v.next_due_date && v.next_due_date < today
                const isUpcoming = v.next_due_date && v.next_due_date >= today
                const doseLabel = v.dose_number
                  ? `${v.dose_number}${v.dose_total ? `/${v.dose_total}` : 'ª'}`
                  : null

                return (
                  <div key={v.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 text-sm">
                          {v.vaccine_name}
                          {v.vaccine_type && <span className="text-slate-400 font-normal"> · {v.vaccine_type}</span>}
                          {doseLabel && <span className="text-teal-600 font-normal"> · dose {doseLabel}</span>}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Aplicada em {fmtDate(v.date_administered)}
                        </p>

                        {/* Detalhes técnicos CFMV */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11px] text-slate-500">
                          {v.manufacturer && <span><span className="text-slate-400">Fabricante:</span> {v.manufacturer}</span>}
                          {v.lot_number && <span><span className="text-slate-400">Lote:</span> {v.lot_number}</span>}
                          {v.validity_date && <span><span className="text-slate-400">Validade:</span> {fmtDate(v.validity_date)}</span>}
                          {v.administration_route && <span><span className="text-slate-400">Via:</span> {v.administration_route}</span>}
                        </div>

                        {/* MV responsável (CFMV: ato privativo, assinatura) */}
                        {(v.vet_name || v.vet_crmv) && (
                          <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-teal-500" />
                            {v.vet_name ?? 'Médico-Veterinário'}{v.vet_crmv ? ` · CRMV ${v.vet_crmv}` : ''}
                          </p>
                        )}

                        {v.notes && <p className="text-xs text-slate-400 mt-1 italic">{v.notes}</p>}
                      </div>

                      {isOverdue ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-1 flex-shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          Atrasado
                        </span>
                      ) : isUpcoming ? (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Em dia
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Próxima: {fmtDate(v.next_due_date)}
                          </p>
                        </div>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Declaração CFMV */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" />
            <span>
              Documento de vacinação emitido eletronicamente sob responsabilidade de médico-veterinário,
              conforme a Resolução CFMV nº 1321/2020. Os atos vacinais são privativos do médico-veterinário
              responsável, identificado em cada registro acima. Versão digital sempre atualizada.
            </span>
          </p>
        </div>

        {/* Rodapé */}
        <div className="text-center text-xs text-slate-400 pb-4">
          <p>Emitido por <strong>{clinicName}</strong></p>
          <p className="mt-0.5">SYSVETMAX — Sistema de Gestão Veterinária</p>
        </div>
      </main>
    </div>
  )
}
