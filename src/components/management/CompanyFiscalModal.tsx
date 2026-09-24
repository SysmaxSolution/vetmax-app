'use client'

// Configuração fiscal (NFS-e) POR EMPRESA FATURANTE — Fase 1 · 1.A.
// Cada CNPJ do grupo tem seu token/tributação → a nota sai desmembrada por
// empresa no checkout. Identidade (CNPJ/inscrição) vem do cadastro da empresa.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, KeyRound, ShieldCheck, FileCheck2 } from 'lucide-react'
import {
  upsertCompanyFiscalConfig,
  type CompanyFiscalConfig, type CompanyFiscalConfigInput,
} from '@/lib/actions/nfse'

interface Props {
  company: { id: string; name: string; cnpj: string | null; inscricao_municipal: string | null }
  config:  CompanyFiscalConfig | undefined
  onClose: () => void
  onSaved: () => void
  onToast: (type: 'success' | 'error', msg: string) => void
}

export default function CompanyFiscalModal({ company, config, onClose, onSaved, onToast }: Props) {
  const [emits, setEmits]           = useState(Boolean(config?.emits_nfse))
  const [active, setActive]         = useState(Boolean(config?.is_active))
  const [environment, setEnv]       = useState<'sandbox' | 'production'>(config?.environment ?? 'sandbox')
  const [regime, setRegime]         = useState(config?.regime_tributario ?? 'simples_nacional')
  const [optSimples, setOptSimples] = useState(config?.optante_simples ?? true)
  const [codMun, setCodMun]         = useState(config?.codigo_municipio ?? '')
  const [cnae, setCnae]             = useState(config?.cnae ?? '')
  const [itemLc, setItemLc]         = useState(config?.item_lista_servico ?? '')
  const [codTrib, setCodTrib]       = useState(config?.codigo_tributario_municipio ?? '')
  const [issPct, setIssPct]         = useState(config?.iss_aliquota === null || config?.iss_aliquota === undefined ? '' : String(Math.round(config.iss_aliquota * 10000) / 100))
  const [issRetido, setIssRetido]   = useState(Boolean(config?.iss_retido))
  const [tokenSb, setTokenSb]       = useState('')
  const [tokenProd, setTokenProd]   = useState('')
  const [saving, setSaving]         = useState(false)

  async function save() {
    if (emits) {
      const missing: string[] = []
      if (!company.cnpj)                missing.push('CNPJ da empresa (cadastro)')
      if (!company.inscricao_municipal) missing.push('Inscrição municipal (cadastro)')
      if (!codMun.trim())               missing.push('Código do município')
      if (!issPct.trim())               missing.push('Alíquota ISS')
      if (missing.length) { onToast('error', 'Para emitir NFS-e, preencha: ' + missing.join(', ')); return }
    }
    const issFraction = issPct.trim()
      ? Math.round(parseFloat(issPct.replace(',', '.')) * 100) / 10000
      : null
    const payload: CompanyFiscalConfigInput = {
      company_id: company.id,
      emits_nfse: emits, is_active: active, environment,
      regime_tributario: regime || null, optante_simples: optSimples,
      codigo_municipio: codMun.trim() || null, cnae: cnae.trim() || null,
      item_lista_servico: itemLc.trim() || null, codigo_tributario_municipio: codTrib.trim() || null,
      iss_aliquota: issFraction, iss_retido: issRetido,
    }
    if (tokenSb.trim())   payload.focus_token_sandbox = tokenSb.trim()
    if (tokenProd.trim()) payload.focus_token_production = tokenProd.trim()

    setSaving(true)
    const res = await upsertCompanyFiscalConfig(payload)
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', `Configuração fiscal de ${company.name} salva!`)
    onSaved()
    onClose()
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
  const lblCls   = 'block text-[11px] font-semibold text-slate-600 mb-1'

  return typeof document === 'undefined' ? null : createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl my-4 flex flex-col max-h-[92vh]">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50"><FileCheck2 className="h-4 w-4 text-blue-600" /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Fiscal (NFS-e) — {company.name}</h3>
              <p className="text-xs text-slate-500">
                {company.cnpj ? company.cnpj : 'sem CNPJ'}{company.inscricao_municipal ? ` · IM ${company.inscricao_municipal}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {(!company.cnpj || !company.inscricao_municipal) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              Preencha o <strong>CNPJ</strong> e a <strong>inscrição municipal</strong> no cadastro da empresa (botão Editar) — são a identidade do prestador na nota.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Toggle label="Emitir NFS-e" value={emits} onChange={setEmits} />
            <Toggle label="Configuração ativa" value={active} onChange={setActive} />
          </div>

          <div>
            <span className={lblCls}>Ambiente</span>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit text-sm">
              {(['sandbox', 'production'] as const).map(env => (
                <button key={env} type="button" onClick={() => setEnv(env)}
                  className={`px-4 py-2 font-semibold transition-colors ${environment === env ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {env === 'sandbox' ? 'Homologação' : 'Produção'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div><span className={lblCls}>Código do Município (IBGE)</span><input className={inputCls} value={codMun} onChange={e => setCodMun(e.target.value)} placeholder="7 dígitos" /></div>
            <div><span className={lblCls}>CNAE</span><input className={inputCls} value={cnae} onChange={e => setCnae(e.target.value)} /></div>
            <div><span className={lblCls}>Alíquota ISS (%)</span><input className={inputCls} value={issPct} onChange={e => setIssPct(e.target.value)} placeholder="ex.: 2" /></div>
            <div className="flex items-end"><Toggle label="ISS retido" value={issRetido} onChange={setIssRetido} /></div>
            <div>
              <span className={lblCls}>Regime tributário</span>
              <select className={inputCls} value={regime} onChange={e => setRegime(e.target.value)}>
                <option value="simples_nacional">Simples Nacional</option>
                <option value="mei">MEI</option>
                <option value="normal">Lucro Presumido/Real</option>
              </select>
            </div>
            <div className="flex items-end"><Toggle label="Optante do Simples" value={optSimples} onChange={setOptSimples} /></div>
            <div><span className={lblCls}>Item LC116 (padrão)</span><input className={inputCls} value={itemLc} onChange={e => setItemLc(e.target.value)} placeholder="ex.: 5.09" /></div>
            <div><span className={lblCls}>Cód. tributário município</span><input className={inputCls} value={codTrib} onChange={e => setCodTrib(e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-slate-500">
            O item LC116 pode ser definido por serviço (cadastro do serviço). O valor acima é o <strong>padrão</strong> usado quando o serviço não tiver o código.
          </p>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Credenciais Focus NFe</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <TokenField label="Token (Homologação)" has={Boolean(config?.has_token_sandbox)} value={tokenSb} onChange={setTokenSb} />
              <TokenField label="Token (Produção)" has={Boolean(config?.has_token_production)} value={tokenProd} onChange={setTokenProd} />
            </div>
            <div className="flex items-start gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              Token gravado de forma segura no servidor; nunca é exibido novamente. Deixe em branco para manter o atual.
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 flex gap-3 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30" />
    </label>
  )
}

function TokenField({ label, has, value, onChange }: { label: string; has: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold text-slate-600 mb-1">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="h-3 w-3" /> {label}
          {has && <span className="text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">configurado</span>}
        </span>
      </span>
      <input type="password" value={value} onChange={e => onChange(e.target.value)}
        placeholder={has ? '•••••••• (manter atual)' : 'Cole o token do provedor'}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
    </div>
  )
}
