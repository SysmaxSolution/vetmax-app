'use client'

/**
 * Configuração fiscal da clínica (NFS-e via Focus NFe) — Faturamento Fase 3.
 * Vive na aba Gestão > Configurações > Contábil. Lê/grava clinic_fiscal_config
 * pelas server actions (getFiscalConfig / upsertFiscalConfig). O token NUNCA é
 * carregado de volta ao client: a UI só mostra se já existe um token salvo
 * (has_token_*) e permite substituí-lo.
 */

import { useEffect, useState } from 'react'
import { Loader2, Save, ShieldCheck, FileCheck2, ToggleLeft, ToggleRight, KeyRound } from 'lucide-react'
import {
  getFiscalConfig, upsertFiscalConfig,
  type FiscalConfig, type FiscalConfigInput,
} from '@/lib/actions/nfse'

interface Props {
  onToast: (type: 'success' | 'error', msg: string) => void
}

type FormState = {
  emits_nfse:          boolean
  is_active:           boolean
  environment:         'sandbox' | 'production'
  cnpj:                string
  inscricao_municipal: string
  razao_social:        string
  regime_tributario:   string
  optante_simples:     boolean
  codigo_municipio:    string
  cnae:                string
  iss_aliquota_pct:    string  // exibido em %, convertido p/ fração ao salvar
  iss_retido:          boolean
  rps_serie:           string
  rps_proximo_numero:  string
  rps_lote:            string
  token_sandbox:       string  // só preenche se for trocar
  token_production:    string
}

const EMPTY: FormState = {
  emits_nfse: false, is_active: false, environment: 'sandbox',
  cnpj: '', inscricao_municipal: '', razao_social: '', regime_tributario: 'simples_nacional',
  optante_simples: true, codigo_municipio: '', cnae: '',
  iss_aliquota_pct: '', iss_retido: false,
  rps_serie: '1', rps_proximo_numero: '1', rps_lote: '1',
  token_sandbox: '', token_production: '',
}

function fromConfig(c: FiscalConfig): FormState {
  return {
    emits_nfse: c.emits_nfse, is_active: c.is_active, environment: c.environment,
    cnpj: c.cnpj ?? '', inscricao_municipal: c.inscricao_municipal ?? '',
    razao_social: c.razao_social ?? '', regime_tributario: c.regime_tributario ?? 'simples_nacional',
    optante_simples: c.optante_simples, codigo_municipio: c.codigo_municipio ?? '',
    cnae: c.cnae ?? '',
    iss_aliquota_pct: c.iss_aliquota === null ? '' : String(Math.round(c.iss_aliquota * 10000) / 100),
    iss_retido: c.iss_retido, rps_serie: c.rps_serie ?? '1',
    rps_proximo_numero: String(c.rps_proximo_numero ?? 1), rps_lote: String(c.rps_lote ?? 1),
    token_sandbox: '', token_production: '',
  }
}

export default function FiscalConfigForm({ onToast }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [hasTokenSandbox, setHasTokenSandbox] = useState(false)
  const [hasTokenProduction, setHasTokenProduction] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFiscalConfig().then(res => {
      if (cancelled) return
      if (res && !('error' in res)) {
        setForm(fromConfig(res))
        setHasTokenSandbox(res.has_token_sandbox)
        setHasTokenProduction(res.has_token_production)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    // Validação leve quando a emissão está ligada
    if (form.emits_nfse) {
      const missing: string[] = []
      if (!form.cnpj.trim())                missing.push('CNPJ')
      if (!form.inscricao_municipal.trim()) missing.push('Inscrição municipal')
      if (!form.codigo_municipio.trim())    missing.push('Código do município')
      if (!form.iss_aliquota_pct.trim())    missing.push('Alíquota ISS')
      if (missing.length) { onToast('error', 'Para emitir NFS-e, preencha: ' + missing.join(', ')); return }
    }

    const issFraction = form.iss_aliquota_pct.trim()
      ? Math.round(parseFloat(form.iss_aliquota_pct.replace(',', '.')) * 100) / 10000
      : null

    const payload: FiscalConfigInput = {
      emits_nfse: form.emits_nfse, is_active: form.is_active, environment: form.environment,
      cnpj: form.cnpj.trim() || null, inscricao_municipal: form.inscricao_municipal.trim() || null,
      razao_social: form.razao_social.trim() || null, regime_tributario: form.regime_tributario || null,
      optante_simples: form.optante_simples, codigo_municipio: form.codigo_municipio.trim() || null,
      cnae: form.cnae.trim() || null,
      iss_aliquota: issFraction, iss_retido: form.iss_retido,
      rps_serie: form.rps_serie.trim() || '1',
      rps_proximo_numero: Math.max(1, parseInt(form.rps_proximo_numero || '1', 10) || 1),
      rps_lote: Math.max(1, parseInt(form.rps_lote || '1', 10) || 1),
    }
    if (form.token_sandbox.trim())    payload.focus_token_sandbox = form.token_sandbox.trim()
    if (form.token_production.trim()) payload.focus_token_production = form.token_production.trim()

    setSaving(true)
    const res = await upsertFiscalConfig(payload)
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    if (payload.focus_token_sandbox)    setHasTokenSandbox(true)
    if (payload.focus_token_production) setHasTokenProduction(true)
    set('token_sandbox', ''); set('token_production', '')
    onToast('success', 'Configuração fiscal salva!')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando configuração fiscal…
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
          <FileCheck2 className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Emissão de NFS-e (Focus NFe)</h3>
          <p className="text-xs text-slate-500">Dados do prestador, tributação e credenciais do provedor</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Toggles principais */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Toggle
            label="Emitir NFS-e" desc="Habilita a pergunta de nota no caixa"
            value={form.emits_nfse} onChange={v => set('emits_nfse', v)} />
          <Toggle
            label="Configuração ativa" desc="Liga a integração com o provedor"
            value={form.is_active} onChange={v => set('is_active', v)} />
        </div>

        {/* Ambiente */}
        <div>
          <Label>Ambiente</Label>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit text-sm">
            {(['sandbox', 'production'] as const).map(env => (
              <button key={env} type="button" onClick={() => set('environment', env)}
                className={`px-4 py-2 font-semibold transition-colors ${
                  form.environment === env ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}>
                {env === 'sandbox' ? 'Homologação' : 'Produção'}
              </button>
            ))}
          </div>
        </div>

        {/* Prestador */}
        <Section title="Prestador">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="CNPJ" value={form.cnpj} onChange={v => set('cnpj', v)} placeholder="00.000.000/0001-00" />
            <Field label="Inscrição Municipal" value={form.inscricao_municipal} onChange={v => set('inscricao_municipal', v)} />
            <Field label="Razão Social" value={form.razao_social} onChange={v => set('razao_social', v)} className="sm:col-span-2" />
            <Field label="Código do Município (IBGE)" value={form.codigo_municipio} onChange={v => set('codigo_municipio', v)} placeholder="7 dígitos" />
            <Field label="CNAE" value={form.cnae} onChange={v => set('cnae', v)} />
          </div>
        </Section>

        {/* Tributação */}
        <Section title="Tributação">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Alíquota ISS (%)" value={form.iss_aliquota_pct} onChange={v => set('iss_aliquota_pct', v)} placeholder="ex.: 2" />
            <div className="flex items-end">
              <Toggle label="ISS retido" desc="" value={form.iss_retido} onChange={v => set('iss_retido', v)} />
            </div>
            <div>
              <Label>Regime tributário</Label>
              <select value={form.regime_tributario} onChange={e => set('regime_tributario', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="simples_nacional">Simples Nacional</option>
                <option value="mei">MEI</option>
                <option value="normal">Lucro Presumido/Real</option>
              </select>
            </div>
            <div className="flex items-end">
              <Toggle label="Optante do Simples" desc="" value={form.optante_simples} onChange={v => set('optante_simples', v)} />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            O <strong>item da lista de serviço (LC 116)</strong> e o <strong>código tributário do município</strong> são
            definidos por serviço, no cadastro de cada serviço (Farmácia/Estoque &gt; Serviços).
          </p>
        </Section>

        {/* RPS */}
        <Section title="Numeração (RPS)">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Série" value={form.rps_serie} onChange={v => set('rps_serie', v)} />
            <Field label="Próximo nº" value={form.rps_proximo_numero} onChange={v => set('rps_proximo_numero', v)} />
            <Field label="Lote" value={form.rps_lote} onChange={v => set('rps_lote', v)} />
          </div>
        </Section>

        {/* Token do provedor */}
        <Section title="Credenciais Focus NFe">
          <div className="grid sm:grid-cols-2 gap-3">
            <TokenField
              label="Token (Homologação)" has={hasTokenSandbox}
              value={form.token_sandbox} onChange={v => set('token_sandbox', v)} />
            <TokenField
              label="Token (Produção)" has={hasTokenProduction}
              value={form.token_production} onChange={v => set('token_production', v)} />
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            O token é gravado de forma segura no servidor e nunca é exibido novamente. Deixe em branco para manter o atual.
          </div>
        </Section>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="h-4 w-4" /> Salvar Configuração Fiscal</>}
        </button>
      </div>
    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600 mb-1.5">{children}</label>
}

function Field({ label, value, onChange, placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
    </div>
  )
}

function TokenField({ label, has, value, onChange }: {
  label: string; has: boolean; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <Label>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="h-3 w-3" /> {label}
          {has && <span className="text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">configurado</span>}
        </span>
      </Label>
      <input type="password" value={value} onChange={e => onChange(e.target.value)}
        placeholder={has ? '•••••••• (manter atual)' : 'Cole o token do provedor'}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</p>
      {children}
    </div>
  )
}

function Toggle({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 transition-colors w-full">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
      <span className={value ? 'text-emerald-600' : 'text-slate-300'}>
        {value ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
      </span>
    </button>
  )
}
