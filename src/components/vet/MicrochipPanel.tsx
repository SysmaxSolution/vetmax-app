'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, ShieldCheck, AlertCircle, Check, Cpu, Calendar, Factory, Hash, ScrollText, Stethoscope,
} from 'lucide-react'
import {
  saveMicrochipAndFinalize,
  listMicrochipHistoryForPatient,
  findMicrochippingService,
  type MicrochipHistoryRow,
} from '@/lib/actions/microchip'
import type { VetConsultationDetail } from '@/lib/actions/vet'
import InsuranceCard from '@/components/pet/InsuranceCard'
import { speciesLabel } from '@/lib/species'

/**
 * MicrochipPanel — UI mínima do fluxo simplificado (Item 4, 2026-06-02).
 *
 * Renderizado pelo ConsultationDetail SOMENTE quando visit_reason='microchipping'.
 * Esconde anamnese/triagem/prescrição/documentos clínicos — só pede os 4
 * campos (todos opcionais por design) e um botão "Salvar e Finalizar".
 *
 * Ao salvar: insere microchip_records, atualiza patients.microchip_id, lança
 * serviço "Microchipagem" do catálogo (split convênio Item 5 entra
 * automaticamente em addServiceToConsultation), fecha a consulta e gera fatura.
 */

interface Props {
  consultation:  VetConsultationDetail
  insuranceCard?: import('@/lib/actions/insurance-coverage').InsuranceCardData | null
}

export default function MicrochipPanel({ consultation, insuranceCard }: Props) {
  const router = useRouter()
  const { patient, tutor } = consultation

  const [chipNumber,  setChipNumber]  = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expiryDate,  setExpiryDate]  = useState('')
  const [notes,       setNotes]       = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)
  const [warning,     setWarning]     = useState<string | null>(null)
  const [pending,     startTransition] = useTransition()
  const [history,     setHistory]     = useState<MicrochipHistoryRow[]>([])
  const [serviceInfo, setServiceInfo] = useState<{ status: 'loading' | 'ok' | 'missing'; name?: string }>({ status: 'loading' })

  const isFinalized = consultation.status === 'completed' || consultation.status === 'cancelled'

  // Histórico de chips deste pet — útil quando troca de chip (ex.: ilegível).
  useEffect(() => {
    void (async () => {
      const res = await listMicrochipHistoryForPatient(patient.id)
      if (Array.isArray(res)) setHistory(res)
    })()
  }, [patient.id])

  // Pré-checa se o catálogo tem o serviço Microchipagem
  useEffect(() => {
    void (async () => {
      const res = await findMicrochippingService()
      if (res && 'error' in res) setServiceInfo({ status: 'missing' })
      else if (!res)             setServiceInfo({ status: 'missing' })
      else                       setServiceInfo({ status: 'ok', name: res.name })
    })()
  }, [])

  function submit(mode: 'finalize' | 'continue') {
    setError(null); setSuccess(null); setWarning(null)
    startTransition(async () => {
      const res = await saveMicrochipAndFinalize({
        consultation_id: consultation.id,
        chip_number:     chipNumber.trim() || null,
        manufacturer:    manufacturer.trim() || null,
        batch_number:    batchNumber.trim() || null,
        expiry_date:     expiryDate || null,
        notes:           notes.trim() || null,
        mode,
      })
      if ('error' in res) { setError(res.error); return }
      if (res.warning) setWarning(res.warning)
      if (res.mode === 'finalize') {
        setSuccess(`Microchipagem registrada para ${patient.name}. Atendimento concluído.`)
        setTimeout(() => router.push('/dashboard/reception'), 2000)
      } else {
        setSuccess(`Microchipagem registrada. Abrindo prontuário clínico de ${patient.name}…`)
        // Recarrega a página: visit_reason mudou para 'consultation', ConsultationDetail
        // vai renderizar o fluxo completo (anamnese/prescrição/procedimentos).
        setTimeout(() => router.refresh(), 800)
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />Voltar
        </button>
        <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full flex items-center gap-1">
          <Cpu className="w-3 h-3" />Fluxo simplificado · Microchipagem
        </span>
      </div>

      {/* Identificação do pet */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{patient.name}</h1>
            <p className="text-xs text-slate-500">
              {speciesLabel(patient.species)}{patient.breed ? ` · ${patient.breed}` : ''} · Tutor: {tutor.name}
            </p>
            {patient.microchip_id && (
              <p className="text-[11px] text-amber-700 bg-amber-50 inline-flex items-center gap-1 px-2 py-0.5 rounded mt-1.5">
                <AlertCircle className="h-3 w-3" />
                Chip atual: <strong className="font-mono">{patient.microchip_id}</strong> — será substituído ao salvar
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Convênio do pet — se houver, split Item 5 entra no caixa */}
      {insuranceCard?.has_insurance && <InsuranceCard data={insuranceCard} />}

      {/* Guard: catálogo sem o serviço */}
      {serviceInfo.status === 'missing' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <strong className="block text-sm mb-1">Serviço "Microchipagem" não cadastrado</strong>
            Cadastre em <em>Estoque &gt; Serviços</em> com SKU <code className="font-mono bg-white px-1 rounded">MICROCHIPAGEM</code>
            (ou nome contendo "microchip") para conseguir fechar este atendimento.
            Defina também o <em>Preço Base de Convênio</em> se a clínica atende pets Petlove com microchipagem.
          </div>
        </div>
      )}

      {/* Form principal */}
      <form onSubmit={e => { e.preventDefault(); submit('finalize') }} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 bg-slate-50/60 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-800">Dados do Chip Implantado</h2>
          <span className="text-[10px] text-slate-400 italic">todos os campos opcionais</span>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                <Hash className="h-3 w-3" /> Número do Microchip
              </label>
              <input
                type="text"
                value={chipNumber}
                onChange={e => setChipNumber(e.target.value.replace(/\s+/g, ''))}
                placeholder="Ex.: 982000123456789 (15 dígitos ISO 11784)"
                disabled={isFinalized || pending}
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                <Factory className="h-3 w-3" /> Fabricante
              </label>
              <input
                type="text"
                value={manufacturer}
                onChange={e => setManufacturer(e.target.value)}
                placeholder="Ex.: Animall, Datamars, Pethome…"
                disabled={isFinalized || pending}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                <ScrollText className="h-3 w-3" /> Lote
              </label>
              <input
                type="text"
                value={batchNumber}
                onChange={e => setBatchNumber(e.target.value)}
                placeholder="Ex.: L2026-04-A"
                disabled={isFinalized || pending}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Validade
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                disabled={isFinalized || pending}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Observações (opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex.: implante no escapular esquerdo, sem intercorrências."
              disabled={isFinalized || pending}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          {warning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{warning}</div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
              <Check className="h-4 w-4" /> {success}
            </div>
          )}

          {!isFinalized && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={pending || serviceInfo.status !== 'ok' || !!success}
                title="Encerra o atendimento e lança no caixa. Use quando o pet só veio para microchipar."
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white disabled:opacity-50 transition-colors shadow-sm"
              >
                {pending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</>
                  : <><ShieldCheck className="h-4 w-4" /> Salvar e dar alta</>}
              </button>
              <button
                type="button"
                onClick={() => submit('continue')}
                disabled={pending || serviceInfo.status !== 'ok' || !!success}
                title="Salva o chip + serviço e abre o prontuário clínico completo para você seguir com medicação/procedimento."
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-sm font-bold text-white disabled:opacity-50 transition-colors shadow-sm"
              >
                {pending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</>
                  : <><Stethoscope className="h-4 w-4" /> Salvar e seguir com consulta</>}
              </button>
            </div>
          )}
          {!isFinalized && (
            <p className="text-[11px] text-slate-500 text-center">
              <strong>Dar alta:</strong> encerra o atendimento, lança no caixa e volta à recepção.
              {' · '}
              <strong>Seguir com consulta:</strong> abre o prontuário clínico para medicação/procedimento; fatura sai só ao finalizar a consulta.
            </p>
          )}

          {isFinalized && (
            <p className="text-center text-xs text-slate-500 italic">Atendimento já finalizado.</p>
          )}
        </div>
      </form>

      {/* Histórico de chips do pet — auditoria */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 bg-slate-50/60">
            <h3 className="text-sm font-semibold text-slate-800">Histórico de microchips deste pet</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {history.map(h => (
              <li key={h.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                <Cpu className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-slate-800">{h.chip_number ?? '(sem número)'}</p>
                  <p className="text-[10px] text-slate-500">
                    {h.manufacturer ?? '—'}
                    {h.batch_number  ? ` · Lote ${h.batch_number}` : ''}
                    {h.expiry_date   ? ` · Val ${h.expiry_date}`   : ''}
                    {' · '}
                    {new Date(h.implanted_at).toLocaleDateString('pt-BR')}
                    {h.implanted_by_name ? ` por ${h.implanted_by_name}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
