'use client'

/**
 * Grupos de acesso — Diretoria, Recepção, Veterinários, Caixa, Estoque…
 *
 * A clínica cria os grupos que quiser e marca o que cada um enxerga. Depois,
 * no cadastro da pessoa, basta escolher o grupo: os acessos entram prontos e
 * continuam ajustáveis um a um.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Plus, Trash2, Loader2, Users, ChevronDown, ChevronRight, Check,
} from 'lucide-react'
import { ACCESS_CATALOG } from '@/config/access-catalog'
import {
  listarGruposDeAcesso, salvarGrupoDeAcesso, excluirGrupoDeAcesso,
} from '@/lib/actions/access-groups'
import type { AccessGroup } from '@/types/access-groups'

interface Props {
  /** Módulos que a clínica tem contratados — só eles aparecem para marcar. */
  activeModules: string[]
  onClose: () => void
  /** Avisa a tela de usuários que os grupos mudaram. */
  onChanged?: () => void
}

/** Sugestões de nome, para a clínica não começar de uma folha em branco. */
const SUGESTOES = ['Diretoria', 'Administrativo', 'Recepção', 'Veterinários', 'Laboratório', 'Caixa', 'Estoque', 'Faturamento']

export default function AccessGroupsModal({ activeModules, onClose, onChanged }: Props) {
  const [grupos, setGrupos]   = useState<AccessGroup[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)

  // Grupo em edição (null = nenhum aberto)
  const [edit, setEdit] = useState<{ id?: string; name: string; description: string; modules: Set<string> } | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const doCatalogo = ACCESS_CATALOG.filter(m => activeModules.includes(m.key))

  async function carregar() {
    setCarregando(true)
    const r = await listarGruposDeAcesso()
    setCarregando(false)
    if ('error' in r) { setErro(r.error); return }
    setErro(null)
    setGrupos(r)
  }

  useEffect(() => { void carregar() }, [])

  function novo(nome = '') {
    setEdit({ name: nome, description: '', modules: new Set(activeModules) })
  }

  function editar(g: AccessGroup) {
    setEdit({ id: g.id, name: g.name, description: g.description ?? '', modules: new Set(g.modules) })
  }

  async function salvar() {
    if (!edit) return
    setSalvando(true)
    setErro(null)
    const r = await salvarGrupoDeAcesso({
      id: edit.id,
      name: edit.name,
      description: edit.description,
      modules: [...edit.modules],
      // Os direitos detalhados continuam sendo ajustados pessoa a pessoa; o
      // grupo decide o que a pessoa enxerga. Guardamos a lista vazia para o
      // molde não apagar nada que foi afinado à mão.
      rights: [],
    })
    setSalvando(false)
    if ('error' in r) { setErro(r.error); return }
    setEdit(null)
    await carregar()
    onChanged?.()
  }

  async function excluir(g: AccessGroup) {
    if (!confirm(`Excluir o grupo "${g.name}"? Quem está nele mantém os acessos que já tem.`)) return
    setExcluindo(g.id)
    const r = await excluirGrupoDeAcesso(g.id)
    setExcluindo(null)
    if ('error' in r) { setErro(r.error); return }
    await carregar()
    onChanged?.()
  }

  function alternarModulo(key: string) {
    if (!edit) return
    const m = new Set(edit.modules)
    if (m.has(key)) m.delete(key); else m.add(key)
    setEdit({ ...edit, modules: m })
  }

  const conteudo = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Grupos de acesso</h2>
              <p className="text-xs text-slate-500">O que cada função enxerga por padrão</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{erro}</p>}

          {carregando ? (
            <p className="flex items-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…
            </p>
          ) : edit ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Nome do grupo</span>
                  <input
                    value={edit.name}
                    onChange={e => setEdit({ ...edit, name: e.target.value })}
                    maxLength={60}
                    placeholder="Recepção"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Descrição (opcional)</span>
                  <input
                    value={edit.description}
                    onChange={e => setEdit({ ...edit, description: e.target.value })}
                    placeholder="Atendimento e agenda"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Módulos deste grupo</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEdit({ ...edit, modules: new Set(doCatalogo.map(m => m.key)) })}
                      className="text-xs font-semibold text-teal-700 hover:underline">Marcar todos</button>
                    <button type="button" onClick={() => setEdit({ ...edit, modules: new Set() })}
                      className="text-xs font-semibold text-slate-500 hover:underline">Limpar</button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {doCatalogo.map(m => {
                    const marcado = edit.modules.has(m.key)
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => alternarModulo(m.key)}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                          marcado ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{m.label}</span>
                        {marcado && <Check className="h-4 w-4 flex-shrink-0 text-teal-600" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  type="button" onClick={() => void salvar()} disabled={salvando || !edit.name.trim()}
                  className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {edit.id ? 'Salvar grupo' : 'Criar grupo'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {grupos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-500">Nenhum grupo criado ainda</p>
                  <p className="mt-1 text-xs text-slate-400">Comece por um destes, ou crie com o nome que a clínica usa:</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {SUGESTOES.map(s => (
                      <button key={s} type="button" onClick={() => novo(s)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-700">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {grupos.map(g => (
                    <li key={g.id} className="rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button type="button" onClick={() => setAberto(aberto === g.id ? null : g.id)} className="text-slate-400">
                          {aberto === g.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{g.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {g.modules.length} {g.modules.length === 1 ? 'módulo' : 'módulos'} · {g.pessoas} {g.pessoas === 1 ? 'pessoa' : 'pessoas'}
                            {g.description ? ` · ${g.description}` : ''}
                          </p>
                        </div>
                        <button type="button" onClick={() => editar(g)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-700">
                          Editar
                        </button>
                        <button type="button" onClick={() => void excluir(g)} disabled={excluindo === g.id}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                          {excluindo === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {aberto === g.id && (
                        <div className="border-t border-slate-100 px-4 py-2">
                          <p className="text-xs text-slate-500">
                            {g.modules.length === 0
                              ? 'Nenhum módulo marcado — quem entrar neste grupo fica sem acesso até receber módulos.'
                              : g.modules
                                  .map(k => ACCESS_CATALOG.find(m => m.key === k)?.label ?? k)
                                  .join(' · ')}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button" onClick={() => novo()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-teal-300 hover:text-teal-700"
              >
                <Plus className="h-4 w-4" /> Novo grupo
              </button>
            </>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-xs text-slate-500">
            O grupo é o ponto de partida. Depois de aplicá-lo a alguém, os acessos daquela pessoa podem ser ajustados sem mexer no grupo.
          </p>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(conteudo, document.body)
}
