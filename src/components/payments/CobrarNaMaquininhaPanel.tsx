'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Radio, Check, X, AlertTriangle, Smartphone } from 'lucide-react'
import {
  listarConfigAdquirente, listarTerminaisDaEmpresa,
  cobrarNaMaquininha, cancelarCobrancaMaquininha, acompanharCobrancaMaquininha,
} from '@/lib/actions/card-acquirer'
import type {
  ConfigAdquirente, TerminalDisponivel, CobrancaCriada, AndamentoCobranca,
} from '@/types/card-acquirer'
import { BANDEIRAS } from '@/lib/integrations/evoluservices-erros'

/**
 * Dispara a cobrança direto na maquininha, de dentro do caixa.
 *
 * O ganho aqui não é adivinhar o NSU: é a recepção parar de DIGITAR o valor na
 * máquina. Valor digitado à mão é onde nascem os erros de centavo e de valor
 * trocado, e é o que aparece na conciliação como divergência.
 *
 * O desfecho vem pelo callback, que pode demorar. Então a tela não trava: ela
 * consulta em segundo plano e, se o comprovante chegar enquanto o tutor ainda
 * está no balcão, preenche NSU e liberação sozinha. Se não chegar, a recepção
 * digita do papel como sempre fez — nada regride.
 *
 * Se a clínica não tem adquirente integrada, este painel não aparece e o modal
 * de cartão fica idêntico ao de hoje.
 */

interface Props {
  paymentMethod:   'credit' | 'debit'
  valor:           number
  parcelas:        number
  consultationId?: string | null
  tutorId?:        string | null
  /** Título que esta cobrança vai baixar (fatura ou venda) — elo para estorno e extrato. */
  invoiceId?:      string | null
  saleId?:         string | null
  /** Chamado quando o comprovante chega pelo callback. */
  onComprovante:   (dados: { nsu: string; autorizacao: string; bandeira: string | null; card_transaction_id: string }) => void
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CobrarNaMaquininhaPanel({
  paymentMethod, valor, parcelas, consultationId, tutorId, invoiceId, saleId, onComprovante,
}: Props) {
  const [configs,    setConfigs]    = useState<ConfigAdquirente[]>([])
  const [empresaId,  setEmpresaId]  = useState<string>('')
  const [terminais,  setTerminais]  = useState<TerminalDisponivel[]>([])
  const [terminalId, setTerminalId] = useState<string>('')
  const [bandeira,   setBandeira]   = useState<string>('')
  const [carregando, setCarregando] = useState(true)
  const [disparando, setDisparando] = useState(false)
  const [cobranca,   setCobranca]   = useState<CobrancaCriada | null>(null)
  const [andamento,  setAndamento]  = useState<AndamentoCobranca | null>(null)
  const [erro,       setErro]       = useState<string | null>(null)

  // Trava para o polling não preencher os campos do caixa duas vezes.
  const jaPreencheu = useRef(false)

  const tipoAlvo = paymentMethod === 'credit' ? 'credito' : 'debito'
  const bandeirasDoTipo = Object.entries(BANDEIRAS).filter(([, b]) => b.tipo === tipoAlvo)

  useEffect(() => {
    let vivo = true
    async function carregar() {
      const res = await listarConfigAdquirente()
      if (!vivo) return
      setCarregando(false)
      if ('error' in res) return                         // sem adquirente: painel some
      const ativas = res.filter(c => c.enabled && c.acquirer === 'evoluservices')
      setConfigs(ativas)
      if (ativas.length >= 1) setEmpresaId(ativas[0].company_id)
    }
    void carregar()
    return () => { vivo = false }
  }, [])

  // Bandeira padrão: a primeira do tipo, para a recepção não ter de escolher no
  // caso comum (crédito Visa).
  useEffect(() => {
    setBandeira(prev => {
      if (prev && BANDEIRAS[prev]?.tipo === tipoAlvo) return prev
      const primeira = Object.entries(BANDEIRAS).find(([, b]) => b.tipo === tipoAlvo)
      return primeira ? primeira[0] : ''
    })
  }, [tipoAlvo])

  // Terminais da empresa escolhida. O status já vem traduzido do servidor.
  useEffect(() => {
    if (!empresaId) { setTerminais([]); return }
    let vivo = true
    async function carregar() {
      const res = await listarTerminaisDaEmpresa(empresaId)
      if (!vivo) return
      if ('error' in res) { setTerminais([]); return }
      setTerminais(res)
      const padrao = configs.find(c => c.company_id === empresaId)?.default_terminal_id
      const alvo = res.find(t => t.terminalId === padrao && t.pode_cobrar)
        ?? res.find(t => t.pode_cobrar)
      setTerminalId(alvo?.terminalId ?? '')
    }
    void carregar()
    return () => { vivo = false }
  }, [empresaId, configs])

  const consultar = useCallback(async (id: string) => {
    const res = await acompanharCobrancaMaquininha(id)
    if ('error' in res) return
    setAndamento(res)
    if (res.nsu && !jaPreencheu.current) {
      jaPreencheu.current = true
      onComprovante({
        nsu:         res.nsu,
        autorizacao: res.autorizacao ?? '',
        bandeira:    res.bandeira,
        card_transaction_id: id,
      })
    }
  }, [onComprovante])

  // Consulta de fundo enquanto o comprovante não chega. Para sozinha em 5
  // minutos: além disso a conferência é da conciliação, não do caixa.
  useEffect(() => {
    if (!cobranca?.card_transaction_id || andamento?.concluida) return
    const id = cobranca.card_transaction_id
    const relogio = setInterval(() => { void consultar(id) }, 5000)
    const fim = setTimeout(() => clearInterval(relogio), 5 * 60 * 1000)
    return () => { clearInterval(relogio); clearTimeout(fim) }
  }, [cobranca, andamento?.concluida, consultar])

  async function disparar() {
    setErro(null)
    setDisparando(true)
    const res = await cobrarNaMaquininha({
      companyId:      empresaId,
      valor,
      bandeira,
      parcelas,
      terminalId:     terminalId || null,
      consultationId: consultationId ?? null,
      tutorId:        tutorId ?? null,
      invoiceId:      invoiceId ?? null,
      saleId:         saleId ?? null,
    })
    setDisparando(false)
    if ('error' in res) { setErro(res.error); return }
    setCobranca(res)
  }

  async function cancelar() {
    if (!cobranca?.card_transaction_id) return
    setDisparando(true)
    const res = await cancelarCobrancaMaquininha(cobranca.card_transaction_id)
    setDisparando(false)
    if ('error' in res) { setErro(res.error); return }
    setCobranca(null)
    setAndamento(null)
    jaPreencheu.current = false
  }

  if (carregando || configs.length === 0) return null

  const terminalEscolhido = terminais.find(t => t.terminalId === terminalId)
  const nenhumDisponivel = terminais.length > 0 && !terminais.some(t => t.pode_cobrar)
  const debitoParcelado = paymentMethod === 'debit' && parcelas > 1

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-teal-700" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-teal-900">
          Cobrar direto na maquininha
        </h3>
      </div>

      {!cobranca ? (
        <>
          <p className="text-[11px] text-teal-800">
            O valor vai para a máquina pelo sistema — ninguém digita {fmt(valor)} no teclado dela.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {configs.length > 1 && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-teal-900 mb-1">
                  Empresa que fatura
                </label>
                <select
                  value={empresaId}
                  onChange={e => setEmpresaId(e.target.value)}
                  className="w-full rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  {configs.map(c => (
                    <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-teal-900 mb-1">Bandeira</label>
              <select
                value={bandeira}
                onChange={e => setBandeira(e.target.value)}
                className="w-full rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {bandeirasDoTipo.map(([chave, b]) => (
                  <option key={chave} value={chave}>{b.rotulo}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-teal-900 mb-1">Maquininha</label>
              <select
                value={terminalId}
                onChange={e => setTerminalId(e.target.value)}
                className="w-full rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {terminais.length === 0 && <option value="">Nenhuma encontrada</option>}
                {terminais.map(t => (
                  <option key={t.terminalId} value={t.terminalId} disabled={!t.pode_cobrar}>
                    {t.terminalId} · {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {terminalEscolhido && !terminalEscolhido.pode_cobrar && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              {terminalEscolhido.explicacao}
            </p>
          )}
          {nenhumDisponivel && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              Nenhuma maquininha disponível agora. Se for a de cabo, confira se o computador dela
              está com o programa da operadora aberto.
            </p>
          )}
          {debitoParcelado && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              Débito não pode ser parcelado. Mude para crédito ou cobre em uma parcela.
            </p>
          )}
          {erro && (
            <p className="flex items-start gap-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />{erro}
            </p>
          )}

          <button
            type="button"
            onClick={() => void disparar()}
            disabled={disparando || !empresaId || !bandeira || debitoParcelado}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {disparando
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Acionando…</>
              : <><Radio className="h-4 w-4" /> Acionar maquininha · {fmt(valor)}</>}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-lg bg-white/80 p-3">
            {andamento?.nsu
              ? <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-px" />
              : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600 mt-px" />}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-800">
                {andamento?.nsu ? 'Comprovante recebido — campos preenchidos.' : cobranca.mensagem}
              </p>
              {andamento && !andamento.nsu && (
                <p className="text-[11px] text-slate-600">
                  Situação: {andamento.rotulo}
                  {andamento.callbacks === 0 && ' · a operadora ainda não retornou'}
                </p>
              )}
              {cobranca.avisos.map((a, i) => (
                <p key={i} className="text-[11px] text-slate-500">{a}</p>
              ))}
            </div>
          </div>

          {erro && (
            <p className="flex items-start gap-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />{erro}
            </p>
          )}

          {!andamento?.nsu && (
            <button
              type="button"
              onClick={() => void cancelar()}
              disabled={disparando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Cancelar cobrança na máquina
            </button>
          )}
        </>
      )}
    </div>
  )
}
