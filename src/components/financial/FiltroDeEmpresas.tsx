'use client'

// Filtro multi-seleção de EMPRESAS FATURANTES (CNPJs do grupo) para as rotinas
// e relatórios financeiros. Convive com os filtros de conta já existentes:
// a empresa restringe o conjunto, a conta refina dentro dele.
//
// Seleção vazia = todas. Some sozinho quando a clínica tem menos de 2 empresas
// ativas. A escolha fica guardada no navegador (por usuário/aparelho).

import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { rotuloDaSelecao } from '@/lib/financial/empresas-filtro'

export interface EmpresaOpcao {
  id: string
  code: string
  name: string
  is_default: boolean
}

const CHAVE = 'sysvet:filtro-empresas'

/** Seleção guardada no navegador (ids que não existem mais são descartados pelo chamador). */
export function lerFiltroDeEmpresasSalvo(): string[] {
  try {
    const v = localStorage.getItem(CHAVE)
    const arr = v ? JSON.parse(v) : []
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []
  } catch { return [] }
}

export function salvarFiltroDeEmpresas(ids: string[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(ids)) } catch { /* navegador sem storage */ }
}

interface Props {
  empresas:  EmpresaOpcao[]
  /** ids selecionados; [] = todas */
  value:     string[]
  onChange:  (ids: string[]) => void
  className?: string
}

export default function FiltroDeEmpresas({ empresas, value, onChange, className = '' }: Props) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false) }
    const esc  = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  if (empresas.length < 2) return null

  const todas = value.length === 0
  function alternar(id: string) {
    const prox = value.includes(id) ? value.filter(x => x !== id) : [...value, id]
    // Marcar todas = sem filtro.
    onChange(prox.length >= empresas.length ? [] : prox)
  }

  return (
    <div ref={raiz} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          todas ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100'
        }`}
      >
        <Building2 className="h-4 w-4 text-slate-400" />
        <span className="max-w-[180px] truncate">{rotuloDaSelecao(value, empresas)}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div role="listbox" aria-multiselectable="true"
          className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <button type="button" role="option" aria-selected={todas} onClick={() => onChange([])}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${todas ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
            Todas as empresas
            {todas && <Check className="h-4 w-4 text-teal-600" />}
          </button>
          <div className="my-1 border-t border-slate-100" />
          {empresas.map(e => {
            const marcada = value.includes(e.id)
            return (
              <button key={e.id} type="button" role="option" aria-selected={marcada} onClick={() => alternar(e.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${marcada ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${marcada ? 'border-teal-600 bg-teal-600' : 'border-slate-300 bg-white'}`}>
                  {marcada && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="w-8 flex-shrink-0 text-[11px] font-bold text-slate-400">{e.code}</span>
                <span className="truncate">{e.name}</span>
                {e.is_default && <span className="ml-auto flex-shrink-0 text-[10px] font-semibold uppercase text-amber-600">padrão</span>}
              </button>
            )
          })}
          <p className="px-2.5 pb-1 pt-2 text-[10px] leading-snug text-slate-400">
            Título sem empresa marcada conta na empresa padrão. Conta bancária sem empresa também.
          </p>
        </div>
      )}
    </div>
  )
}
