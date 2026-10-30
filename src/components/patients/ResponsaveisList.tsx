'use client'

/**
 * Cadastro visto POR RESPONSÁVEL.
 *
 * Pedido da Aline (30/10/2026): buscar pelo nome dela devolvia um card grande
 * por animal, com os mesmos dados repetidos em cada um. Aqui a lista traz uma
 * linha por pessoa; os animais aparecem quando ela abre a linha, e o clique no
 * animal leva ao mesmo cadastro e ao mesmo histórico da visão por animal.
 */

import { useState, useEffect, useRef } from 'react'
import { ChevronRight, Pencil, History, KeyRound, User, Loader2 } from 'lucide-react'
import { getResponsaveisList, type ResponsavelListItem } from '@/lib/actions/tutors'
import TutorPortalAccessModal from '@/components/patients/TutorPortalAccessModal'
import { getPatientsList, type PatientsListItem } from '@/lib/actions/timeline'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { formatPetAge } from '@/lib/utils/pet-age'

interface Props {
  /** Mesmo texto da busca da tela — a lista acompanha o que foi digitado. */
  query: string
  onEdit: (p: PatientsListItem) => void
  onViewFeed: (p: PatientsListItem) => void
}

function formatCpf(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export default function ResponsaveisList({ query, onEdit, onViewFeed }: Props) {
  const [lista, setLista]       = useState<ResponsavelListItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]         = useState(false)
  const [aberto, setAberto]     = useState<string | null>(null)
  const [animais, setAnimais]   = useState<Record<string, PatientsListItem[]>>({})
  const [carregandoAnimais, setCarregandoAnimais] = useState<string | null>(null)
  const [portal, setPortal] = useState<ResponsavelListItem | null>(null)
  // Busca fora de ordem: resposta antiga não pode sobrescrever a nova.
  const seq = useRef(0)

  useEffect(() => {
    const termo = query.trim()
    if (termo.length === 1) return            // mesma regra da busca por animal
    const meu = ++seq.current
    setCarregando(true)
    setErro(false)
    const t = setTimeout(async () => {
      try {
        const r = await getResponsaveisList(termo)
        if (meu !== seq.current) return
        if ('error' in r) setErro(true)
        else setLista(r)
      } catch {
        if (meu === seq.current) setErro(true)
      } finally {
        if (meu === seq.current) setCarregando(false)
      }
    }, termo ? 350 : 0)
    return () => clearTimeout(t)
  }, [query])

  async function alternar(id: string) {
    if (aberto === id) { setAberto(null); return }
    setAberto(id)
    if (animais[id]) return                   // já carregado nesta sessão
    setCarregandoAnimais(id)
    const r = await getPatientsList('', { tutorId: id })
    setCarregandoAnimais(null)
    if (!('error' in r)) setAnimais(prev => ({ ...prev, [id]: r }))
  }

  if (carregando && lista.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando responsáveis…
      </div>
    )
  }

  if (erro) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        Não foi possível carregar os responsáveis. Verifique sua conexão e tente de novo.
      </p>
    )
  }

  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <User className="h-7 w-7 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">
          {query ? `Nenhum responsável encontrado para "${query}"` : 'Nenhum responsável cadastrado'}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {query ? 'Busque por nome, CPF ou telefone' : 'Os responsáveis aparecem aqui após o primeiro cadastro'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {lista.map(r => {
        const expandido = aberto === r.id
        const doResponsavel = animais[r.id] ?? []
        return (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => void alternar(r.id)}
              aria-expanded={expandido}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${expandido ? 'rotate-90' : ''}`} />
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{r.name ?? 'Sem nome'}</p>
                <p className="truncate text-xs text-slate-500">
                  {[r.cpf ? `CPF ${formatCpf(r.cpf)}` : null, r.phone, r.city].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                </p>
              </div>
              <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {r.animais} {r.animais === 1 ? 'animal' : 'animais'}
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Acesso ao portal"
                onClick={e => { e.stopPropagation(); setPortal(r) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPortal(r) } }}
                className="flex-shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-teal-300 hover:text-teal-700"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </span>
            </button>

            {expandido && (
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                {carregandoAnimais === r.id ? (
                  <p className="flex items-center gap-2 py-3 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando animais…
                  </p>
                ) : doResponsavel.length === 0 ? (
                  <p className="py-3 text-xs text-slate-400">Nenhum animal ativo neste responsável.</p>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {doResponsavel.map(p => (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <PetAvatar name={p.name} photoUrl={p.photo_url} species={p.species} size="sm" deceased={Boolean(p.deceased_at)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {[p.breed, formatPetAge(p.birth_date)]
                              .filter(Boolean).join(' · ') || 'Sem dados clínicos'}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button" onClick={() => onEdit(p)} title="Editar cadastro"
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-teal-300 hover:text-teal-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button" onClick={() => onViewFeed(p)} title="Ver histórico"
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-teal-300 hover:text-teal-700"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })}
      {portal && (
        <TutorPortalAccessModal
          tutorId={portal.id}
          tutorName={portal.name ?? null}
          onClose={() => setPortal(null)}
        />
      )}
      {lista.length === 100 && (
        <p className="text-center text-xs text-slate-400 pt-2">
          Mostrando os primeiros 100 responsáveis. Use a busca para refinar.
        </p>
      )}
    </div>
  )
}
