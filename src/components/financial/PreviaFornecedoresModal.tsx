'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, UserPlus, CheckCircle2, AlertTriangle } from 'lucide-react'
import { previewFornecedoresDda } from '@/lib/actions/pagfor'
import type { DdaBoleto, PreviaFornecedorDda } from '@/types/pagfor'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  boletos:  DdaBoleto[]
  onClose:  () => void
  /** Confirma o lançamento; `cadastrar` diz se cria fornecedor junto. */
  onConfirmar: (cadastrar: boolean) => void
  lancando: boolean
}

/**
 * Mostra quais fornecedores o lançamento vai criar, ANTES de criar.
 *
 * Existe porque consulta pública erra — CNPJ baixado, razão social
 * desatualizada, empresa que mudou de nome. Criar cadastro em silêncio é como
 * o sistema se enche de registro que ninguém assume. Aqui a operadora vê o
 * nome que vai entrar e decide.
 *
 * Também é onde fica visível o motivo de tudo isto: o nome que o banco manda
 * vem cortado em 40 caracteres, e a coluna "como vai ficar" mostra o nome
 * inteiro da Receita ao lado.
 */
export default function PreviaFornecedoresModal({ boletos, onClose, onConfirmar, lancando }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [previa, setPrevia] = useState<PreviaFornecedorDda[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [cadastrar, setCadastrar] = useState(true)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await previewFornecedoresDda(boletos)
      if (!vivo) return
      if ('error' in r) setErro(r.error)
      else setPrevia(r)
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [boletos])

  const novos = previa.filter(p => !p.ja_cadastrado)
  const existentes = previa.filter(p => p.ja_cadastrado)
  const semDocumento = boletos.filter(b => !(b.beneficiary_doc ?? '').replace(/\D/g, '')).length

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-indigo-100 p-2 text-indigo-700"><UserPlus className="h-5 w-5" /></span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Fornecedores deste lançamento</h3>
              <p className="text-xs text-slate-500">O banco manda o nome cortado em 40 caracteres. Confira como vai ficar antes de cadastrar.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {carregando && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando os CNPJs na Receita…
            </div>
          )}

          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{erro}</p>}

          {!carregando && !erro && (
            <div className="space-y-4">
              {novos.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Serão cadastrados ({novos.length})
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">CNPJ</th>
                          <th className="px-3 py-2 text-left">Como vem do banco</th>
                          <th className="px-3 py-2 text-left">Como vai ficar</th>
                          <th className="px-3 py-2 text-right">Boletos</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {novos.map(p => (
                          <tr key={p.documento}>
                            <td className="px-3 py-2 font-mono text-slate-500">{p.documento_fmt}</td>
                            <td className="px-3 py-2 text-slate-400">{p.nome_no_banco ?? '—'}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">
                              {p.nome_final ?? '—'}
                              {p.nome_enriquecido && (
                                <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Receita</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p.boletos}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">{BRL(p.valor_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Sem a etiqueta <b>Receita</b>, o nome é o do banco — a consulta pública tem limite de chamadas.
                    Use <b>Completar cadastros</b> depois do lançamento para buscar os que faltaram.
                  </p>
                </div>
              )}

              {existentes.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Já cadastrados ({existentes.length}) — só serão vinculados
                  </p>
                  <ul className="space-y-1">
                    {existentes.map(p => (
                      <li key={p.documento} className="flex items-center gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-mono text-slate-400">{p.documento_fmt}</span>
                        <span>{p.nome_final ?? p.nome_no_banco}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {semDocumento > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {semDocumento} boleto(s) vieram <b>sem CNPJ do beneficiário</b>. Entram em contas a pagar
                    normalmente, mas ficam sem fornecedor vinculado — o cadastro precisa ser feito à mão.
                  </span>
                </p>
              )}

              {!previa.length && !semDocumento && (
                <p className="py-6 text-center text-sm text-slate-400">Nenhum fornecedor identificável nestes boletos.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={cadastrar} onChange={e => setCadastrar(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300" />
            Cadastrar e vincular os fornecedores
          </label>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={lancando}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={() => onConfirmar(cadastrar)} disabled={lancando || carregando}
              className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {lancando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Lançar {boletos.length} título(s)
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
