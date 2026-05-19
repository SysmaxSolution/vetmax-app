'use client'

/**
 * DuplicateTemplateModal — exclusivo para Sysmax Suporte (is_sysmax).
 *
 * Permite replicar um template do Canvas Editor para múltiplas clínicas
 * de uma vez. Cada clínica recebe a estrutura (canvas_state, margens,
 * block_style) preservada, mas SEM os assets específicos (logo, papel
 * timbrado) — cada clínica deve subir seus próprios.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Copy, Loader2, Search, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  listClinicsForSupport, duplicateTemplateToClinics,
  type ClinicSummary,
} from '@/lib/actions/canva-templates'
import type { DocumentTemplate } from '@/types'

interface Props {
  template: DocumentTemplate
  currentClinicId: string
  onClose: () => void
  onDuplicated?: (result: { created: number; skipped: number }) => void
}

export default function DuplicateTemplateModal({
  template, currentClinicId, onClose, onDuplicated,
}: Props) {
  const [clinics, setClinics] = useState<ClinicSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState(template.name)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()
  const [result, setResult] = useState<{ created_ids: string[]; skipped: Array<{ clinic_id: string; reason: string }> } | null>(null)

  useEffect(() => {
    listClinicsForSupport()
      .then(list => setClinics(list))
      .catch(e => setLoadError(e?.message ?? 'falha ao carregar clínicas'))
  }, [])

  const filtered = useMemo(() => {
    if (!clinics) return []
    const q = query.trim().toLowerCase()
    return clinics
      .filter(c => c.id !== currentClinicId)  // não duplica para a própria origem
      .filter(c => !q || c.name.toLowerCase().includes(q))
  }, [clinics, query, currentClinicId])

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAllVisible() {
    if (filtered.every(c => selectedIds.has(c.id))) {
      // Todas visíveis estão selecionadas → desmarca
      setSelectedIds(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.delete(c.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.add(c.id))
        return next
      })
    }
  }

  function submit() {
    setSubmitError(null)
    setResult(null)
    if (selectedIds.size === 0) {
      setSubmitError('Selecione pelo menos uma clínica de destino.')
      return
    }
    startSubmit(async () => {
      try {
        const res = await duplicateTemplateToClinics({
          template_id: template.id,
          target_clinic_ids: Array.from(selectedIds),
          new_name: newName !== template.name ? newName : undefined,
        })
        setResult(res)
        onDuplicated?.({ created: res.created_ids.length, skipped: res.skipped.length })
      } catch (e: any) {
        setSubmitError(e?.message ?? 'falha ao duplicar')
      }
    })
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ maxHeight: '90vh' }}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Copy className="w-4 h-4 text-violet-600" />
              Duplicar Layout para outras Clínicas
            </h2>
            <p className="text-[11px] text-slate-500 truncate">
              Origem: <strong>{template.name}</strong> · {template.type} · acesso exclusivo Sysmax Suporte
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </header>

        {result ? (
          <div className="overflow-y-auto p-5 space-y-3">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{result.created_ids.length}</strong> {result.created_ids.length === 1 ? 'clínica recebeu' : 'clínicas receberam'} o layout.
                {result.skipped.length > 0 && (
                  <span className="block text-amber-700 mt-1 text-xs">
                    {result.skipped.length} pulada{result.skipped.length === 1 ? '' : 's'} (template com mesmo nome+tipo já existia).
                  </span>
                )}
              </div>
            </div>
            {result.skipped.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-slate-700">
                  Ver clínicas puladas ({result.skipped.length})
                </summary>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                  {result.skipped.map((s, i) => {
                    const c = clinics?.find(x => x.id === s.clinic_id)
                    return (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{c?.name ?? s.clinic_id}</span>
                        <span className="text-amber-600">{s.reason}</span>
                      </li>
                    )
                  })}
                </ul>
              </details>
            )}
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* Nome no destino */}
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-700">Nome do template no destino</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={template.name}
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Mantenha o mesmo para padronizar entre clínicas.
                </span>
              </label>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar clínica…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Lista de clínicas */}
              {loadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {loadError}
                </div>
              ) : !clinics ? (
                <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando clínicas…
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                  Nenhuma clínica encontrada{query && ` para "${query}"`}.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>{selectedIds.size} de {filtered.length} selecionada{selectedIds.size === 1 ? '' : 's'}</span>
                    <button
                      onClick={toggleAllVisible}
                      className="text-violet-600 hover:underline"
                    >
                      {allVisibleSelected ? 'Desmarcar tudo' : 'Selecionar tudo visível'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {filtered.map(c => (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                          selectedIds.has(c.id)
                            ? 'border-violet-400 bg-violet-50'
                            : 'border-slate-200 bg-white hover:border-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggle(c.id)}
                          className="flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {c.business_type === 'vet_clinic' ? 'Clínica' : 'Estética'} · {c.status}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 leading-snug">
                <strong>Nota:</strong> a estrutura (margens, elementos, agrupamentos) é replicada,
                mas o <em>papel timbrado de fundo</em> e <em>imagens locais</em> ficam vazios — cada
                clínica precisa subir os próprios assets via Editor &gt; Trocar.
              </div>

              {submitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {submitError}
                </div>
              )}
            </div>

            <footer className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-2 flex-shrink-0">
              <span className="text-[11px] text-slate-500">
                Apenas Sysmax Suporte pode duplicar entre clínicas.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || selectedIds.size === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  Duplicar para {selectedIds.size} {selectedIds.size === 1 ? 'clínica' : 'clínicas'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
