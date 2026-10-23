'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Search, RefreshCw, Loader2, FileDown, FileText, AlertTriangle, CheckCircle2, KeyRound,
} from 'lucide-react'
import {
  listarNotasDisponiveis, verificarNfsDisponiveis, consultarNfePorChave,
  consultarNfesPorChaves, obterXmlDaNota, listarConfiguracaoDfe,
} from '@/lib/actions/dfe'
import type { NotaDisponivel, ConfiguracaoDfe } from '@/types/dfe'

/**
 * Notas emitidas contra o CNPJ da clínica, direto da Receita.
 *
 * Responde à pergunta que hoje não tem resposta: "quais notas foram emitidas
 * contra a gente?". Sem isto, a clínica só sabe da nota quando o fornecedor
 * lembra de mandar o XML — e quando ele esquece, alguém digita a entrada à mão.
 *
 * Dois caminhos, e a diferença entre eles importa:
 *   "Verificar NFs disponíveis" varre tudo que a Receita tem para o CNPJ.
 *   "Buscar por chave" vai direto a UMA nota, pela chave do DANFE. Serve
 *   quando a mercadoria chegou e a nota ainda não apareceu na lista.
 */

const BRL = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'

interface Props {
  onClose:   () => void
  /** Chamado com o XML escolhido, para abrir a conferência da entrada. */
  onEntrada: (xml: string) => void
}

export default function NotasDisponiveisModal({ onClose, onEntrada }: Props) {
  const [empresas, setEmpresas]   = useState<ConfiguracaoDfe[]>([])
  const [empresaId, setEmpresaId] = useState<string>('')
  const [notas, setNotas]         = useState<NotaDisponivel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [buscando, setBuscando]   = useState(false)
  const [chave, setChave]         = useState('')
  const [erro, setErro]           = useState<string | null>(null)
  const [aviso, setAviso]         = useState<string | null>(null)
  const [marcadas, setMarcadas]   = useState<Set<string>>(new Set())
  const [varias, setVarias]       = useState(false)

  const hoje = new Date().toISOString().slice(0, 10)
  const trinta = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [de, setDe]   = useState(trinta)
  const [ate, setAte] = useState(hoje)
  const [situacao, setSituacao]     = useState('pendentes')
  const [fornecedor, setFornecedor] = useState('')

  const empresa = empresas.find(e => e.company_id === empresaId) ?? null

  const carregar = useCallback(async () => {
    setCarregando(true)
    const r = await listarNotasDisponiveis({
      companyId: empresaId || undefined, de, ate, situacao,
      fornecedor: fornecedor || undefined,
    })
    setCarregando(false)
    if ('error' in r) { setErro(r.error); return }
    setNotas(r)
    setMarcadas(new Set())
  }, [empresaId, de, ate, situacao, fornecedor])

  useEffect(() => {
    void listarConfiguracaoDfe().then(r => {
      if ('error' in r) return
      setEmpresas(r)
      const ativa = r.find(e => e.enabled) ?? r[0]
      if (ativa) setEmpresaId(ativa.company_id)
    })
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  async function verificar() {
    if (!empresaId) return
    setBuscando(true); setErro(null); setAviso(null)
    const r = await verificarNfsDisponiveis(empresaId)
    setBuscando(false)
    if ('error' in r) { setErro(r.error); return }
    setAviso(r.mensagem)
    await carregar()
  }

  async function buscarPorChave() {
    if (!empresaId) return
    setBuscando(true); setErro(null); setAviso(null)

    // Uma chave ou um lote: o mesmo campo serve aos dois, porque a diferença
    // é só quantas linhas o operador colou.
    const digitos = chave.match(/\d{44}/g) ?? []
    const r = digitos.length > 1
      ? await consultarNfesPorChaves(empresaId, chave)
      : await consultarNfePorChave(empresaId, chave.replace(/\D/g, ''))

    setBuscando(false)
    if ('error' in r) { setErro(r.error); return }
    setAviso(r.mensagem)
    setChave('')
    await carregar()
  }

  async function darEntrada(nota: NotaDisponivel) {
    const r = await obterXmlDaNota(nota.id)
    if ('error' in r) { setErro(r.error); return }
    onEntrada(r.xml)
  }

  /** Baixa os XMLs marcados, um arquivo por nota. */
  async function baixarMarcados() {
    const comXml = notas.filter(n => marcadas.has(n.id) && n.temXml)
    if (!comXml.length) {
      setErro('Nenhuma das notas marcadas tem XML disponível ainda.')
      return
    }
    setBuscando(true)
    for (const n of comXml) {
      const r = await obterXmlDaNota(n.id)
      if ('error' in r) continue
      const blob = new Blob([r.xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NFe-${r.chave}.xml`
      a.click()
      URL.revokeObjectURL(url)
      // O navegador engasga com downloads simultâneos; um pequeno intervalo
      // entre eles é o que faz o lote inteiro chegar.
      await new Promise(s => setTimeout(s, 250))
    }
    setBuscando(false)
    setAviso(`${comXml.length} arquivo(s) baixado(s).`)
  }

  function alternar(id: string) {
    setMarcadas(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const corpo = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="my-4 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-slate-100 bg-teal-50/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notas emitidas contra o CNPJ</h2>
              <p className="text-[11px] text-slate-500">
                O que a Receita tem registrado — inclusive o que o fornecedor não mandou por e-mail.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">

          {/* Empresa + as duas buscas */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              {empresas.length > 1 && (
                <label className="block min-w-[200px]">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">Empresa</span>
                  <select
                    value={empresaId} onChange={e => setEmpresaId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {empresas.map(e => <option key={e.company_id} value={e.company_id}>{e.company_name}</option>)}
                  </select>
                </label>
              )}

              <button
                onClick={() => void verificar()}
                disabled={buscando || !empresa?.enabled}
                title={empresa?.enabled ? undefined : 'A consulta automática não está ativada para esta empresa.'}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Verificar NFs disponíveis
              </button>

              <div className="flex items-end gap-1.5">
                <label className="block">
                  <span className="flex items-center gap-2 text-[10px] font-semibold uppercase text-slate-500">
                    Chave do DANFE
                    <button type="button" onClick={() => setVarias(v => !v)}
                      className="font-semibold normal-case text-teal-700 hover:underline">
                      {varias ? 'uma chave' : 'várias de uma vez'}
                    </button>
                  </span>
                  {varias ? (
                    <textarea
                      value={chave}
                      onChange={e => setChave(e.target.value)}
                      rows={3}
                      placeholder={'Cole as chaves — uma por linha'}
                      className="w-[300px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                    />
                  ) : (
                    <input
                      value={chave}
                      onChange={e => setChave(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void buscarPorChave() }}
                      placeholder="44 números"
                      inputMode="numeric"
                      className="w-[260px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    />
                  )}
                </label>
                <button
                  onClick={() => void buscarPorChave()}
                  disabled={buscando}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" /> Consultar NF-e
                </button>
              </div>
            </div>

            {empresa?.conflito && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                A Receita tem bloqueado nossas consultas com frequência. Isso costuma acontecer quando
                outro sistema também busca as notas deste CNPJ automaticamente.
              </p>
            )}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">De</span>
              <input type="date" value={de} onChange={e => setDe(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Até</span>
              <input type="date" value={ate} onChange={e => setAte(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Situação</span>
              <select value={situacao} onChange={e => setSituacao(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                <option value="pendentes">Não lançadas</option>
                <option value="lancadas">Já lançadas</option>
                <option value="todas">Todas</option>
              </select>
            </label>
            <label className="block flex-1 min-w-[160px]">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Fornecedor</span>
              <div className="flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input value={fornecedor} onChange={e => setFornecedor(e.target.value)}
                  placeholder="parte do nome"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
              </div>
            </label>
            {marcadas.size > 0 && (
              <button
                onClick={() => void baixarMarcados()}
                disabled={buscando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" /> Baixar XML ({marcadas.size})
              </button>
            )}
          </div>

          {erro && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{erro}
            </p>
          )}
          {aviso && !erro && (
            <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />{aviso}
            </p>
          )}

          {/* Lista */}
          <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200">
            {carregando ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : notas.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-600">Nenhuma nota neste período.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Use “Verificar NFs disponíveis” para buscar o que a Receita tem.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2 text-left">Fornecedor</th>
                    <th className="px-2 py-2 text-left">Nota</th>
                    <th className="px-2 py-2 text-left">Emissão</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2 text-left">Situação</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notas.map(n => (
                    <tr key={n.id} className={n.lancadaEm ? 'bg-slate-50/60' : ''}>
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={marcadas.has(n.id)}
                          onChange={() => alternar(n.id)} className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-2 py-2">
                        <span className="block font-medium text-slate-800">{n.emitenteNome ?? '—'}</span>
                        <span className="block font-mono text-[10px] text-slate-400">{n.chave}</span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        {n.numero ?? '—'}{n.serie ? `/${n.serie}` : ''}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600">{data(n.emitidaEm)}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-800">{BRL(n.valor)}</td>
                      <td className="px-2 py-2">
                        {n.lancadaEm
                          ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">lançada</span>
                          : n.temXml
                            ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">pronta para lançar</span>
                            : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">aguardando liberação</span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {!n.lancadaEm && n.temXml && (
                          <button
                            onClick={() => void darEntrada(n)}
                            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                          >
                            Dar entrada
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-1 text-[11px] text-slate-400">
            <p>
              “Aguardando liberação” significa que a Receita ainda não disponibilizou o arquivo da nota.
              Assim que liberar, o botão de lançar aparece.
            </p>
            <p>
              A busca automática só traz notas emitidas <strong>a partir do dia em que a rotina foi
              ativada</strong> — a Receita não entrega o histórico por esse caminho. Para notas
              anteriores, use a busca por chave.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  // Modal sempre pelo portal: dentro da árvore, qualquer ancestral com
  // transform ou overflow muda onde ele aparece.
  return typeof document === 'undefined' ? null : createPortal(corpo, document.body)
}
