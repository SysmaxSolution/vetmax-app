'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, FileSearch, Loader2, Save, ToggleLeft, ToggleRight, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import { salvarConfiguracaoDfe } from '@/lib/actions/dfe'
import type { ConfiguracaoDfe } from '@/types/dfe'

/**
 * Notas emitidas contra o CNPJ desta empresa.
 *
 * Fica aqui, e não em Configurações, porque a chave é o CNPJ: cada empresa tem
 * seu certificado, sua sequência na Receita e sua decisão de manifestar. Em
 * Configurações, que é por clínica, uma única chave valeria para os três CNPJs
 * da Animais.
 *
 * São DOIS interruptores separados de propósito. Consultar é leitura; declarar
 * ciência é assinar com o certificado da empresa, e isso não pode ser efeito
 * colateral de ligar a consulta.
 */

interface Props {
  config:  ConfiguracaoDfe
  onClose: () => void
  onSaved: () => void
}

export default function CompanyDfeModal({ config, onClose, onSaved }: Props) {
  const [enabled, setEnabled]   = useState(config.enabled)
  const [ciencia, setCiencia]   = useState(config.auto_ciencia)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState<string | null>(null)

  const semCnpj = !config.company_cnpj

  async function salvar() {
    setSalvando(true); setErro(null)
    const r = await salvarConfiguracaoDfe({
      companyId: config.company_id, enabled, autoCiencia: ciencia,
    })
    setSalvando(false)
    if ('error' in r) { setErro(r.error); return }
    onSaved()
    onClose()
  }

  const corpo = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="my-6 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-slate-100 bg-indigo-50/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600">
              <FileSearch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notas contra o CNPJ</h2>
              <p className="text-[11px] text-slate-500">{config.company_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">

          {semCnpj && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              Esta empresa ainda não tem CNPJ cadastrado. A Receita identifica a empresa pelo CNPJ —
              sem ele, não há o que consultar.
            </p>
          )}

          {/* Consulta */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Buscar notas automaticamente</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  O sistema consulta a Receita e mostra as notas que os fornecedores emitiram contra
                  este CNPJ, mesmo as que não chegaram por e-mail.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(v => !v)}
                disabled={semCnpj}
                className={`shrink-0 transition-colors disabled:opacity-40 ${enabled ? 'text-indigo-600' : 'text-slate-300'}`}
              >
                {enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
              </button>
            </div>

            {enabled && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
                A Receita entrega cada nota <strong>uma única vez por CNPJ</strong>. Se a contabilidade
                também fizer essa busca automática, cada nota vai para quem pedir primeiro.
                Combine com ela que a consulta em massa fica só aqui — pelo site da Receita ela
                continua consultando à vontade.
              </p>
            )}
          </div>

          {/* Manifestação */}
          <div className={`rounded-xl border p-4 ${enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50/50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Declarar ciência automaticamente</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  É o que libera o arquivo XML para download. Sem isso, a Receita mostra que a nota
                  existe, mas não entrega o arquivo — e a entrada continua sendo digitada à mão.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCiencia(v => !v)}
                disabled={!enabled || semCnpj}
                className={`shrink-0 transition-colors disabled:opacity-40 ${ciencia ? 'text-indigo-600' : 'text-slate-300'}`}
              >
                {ciencia ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
              </button>
            </div>

            {ciencia && (
              <div className="mt-3 space-y-2">
                <p className="flex items-start gap-2 rounded-lg bg-indigo-50 p-2.5 text-[11px] text-indigo-900">
                  <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
                  Usa o certificado digital desta empresa para declarar à Receita que a clínica
                  <strong> tomou conhecimento</strong> da nota. Não confirma recebimento de mercadoria
                  nem aceita a compra.
                </p>
                <p className="text-[11px] text-slate-500">
                  A declaração só é aceita nos <strong>10 primeiros dias</strong> após a nota ser
                  emitida. Por isso a busca precisa rodar com frequência — nota mais antiga que isso
                  não libera mais o arquivo.
                </p>
              </div>
            )}
          </div>

          {config.conflito && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              A Receita tem recusado nossas consultas com frequência neste CNPJ. Isso costuma
              significar que outro sistema também busca as notas automaticamente.
            </p>
          )}

          {erro && (
            <p className="flex items-start gap-2 text-xs font-medium text-rose-700">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />{erro}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="h-4 w-4" /> Salvar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(corpo, document.body)
}
