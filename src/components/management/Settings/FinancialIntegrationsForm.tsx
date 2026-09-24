'use client'

import { useState, useEffect } from 'react'
import { Landmark, QrCode, ToggleLeft, ToggleRight, Save, Loader2, Plus, Trash2 } from 'lucide-react'
import {
  getFinancialIntegrations, updateFinancialIntegrations,
  type FinancialIntegrations, type BankIntegration,
} from '@/lib/actions/financial-integrations'

const BANKS = [
  { code: '756', name: 'Sicoob' }, { code: '748', name: 'Sicredi' }, { code: '001', name: 'Banco do Brasil' },
  { code: '341', name: 'Itaú' }, { code: '237', name: 'Bradesco' }, { code: '033', name: 'Santander' },
]
const bankName = (code: string) => BANKS.find(b => b.code === code)?.name ?? code
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'

export default function FinancialIntegrationsForm({ onToast }: { onToast: (t: 'success' | 'error', m: string) => void }) {
  const [cfg, setCfg]     = useState<FinancialIntegrations | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { getFinancialIntegrations().then(setCfg) }, [])
  if (!cfg) return <div className="p-6 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  const set = (patch: Partial<FinancialIntegrations>) => setCfg(c => c ? { ...c, ...patch } : c)
  const setBank = (i: number, patch: Partial<BankIntegration>) =>
    set({ banks: cfg.banks.map((b, j) => j === i ? { ...b, ...patch } : b) })
  const addBank = () => set({ banks: [...cfg.banks, { bank_code: '756', provider: 'sicoob', environment: 'sandbox', client_id: '', agencia: '', conta: '' }] })
  const removeBank = (i: number) => set({ banks: cfg.banks.filter((_, j) => j !== i) })

  async function save() {
    if (!cfg) return
    setSaving(true)
    const res = await updateFinancialIntegrations({ ...cfg, pix: { ...cfg.pix, enabled: cfg.pix_enabled } })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Integrações financeiras salvas!')
  }

  return (
    <div className="space-y-4">
      {/* Integração bancária */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50"><Landmark className="h-4 w-4 text-sky-600" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Utiliza integração bancária?</h3>
              <p className="text-xs text-slate-500">Buscar extrato por período e conciliar automaticamente</p>
            </div>
          </div>
          <button onClick={() => set({ bank_enabled: !cfg.bank_enabled })} className={`transition-colors ${cfg.bank_enabled ? 'text-sky-600' : 'text-slate-300'}`}>
            {cfg.bank_enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
          </button>
        </div>
        {cfg.bank_enabled && (
          <div className="px-6 py-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase">Bancos que utilizam integração</p>
            {cfg.banks.length === 0 && <p className="text-xs text-slate-400">Nenhum banco configurado.</p>}
            {cfg.banks.map((b, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">{bankName(b.bank_code)}</span>
                  <button onClick={() => removeBank(i)} className="text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Banco</span>
                    <select value={b.bank_code} onChange={e => setBank(i, { bank_code: e.target.value })} className={input}>
                      {BANKS.map(bk => <option key={bk.code} value={bk.code}>{bk.name}</option>)}
                    </select></label>
                  <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Integração</span>
                    <select value={b.provider} onChange={e => setBank(i, { provider: e.target.value })} className={input}>
                      <option value="sicoob">Sicoob API (Conta Corrente v4)</option>
                      <option value="ofx">Arquivo OFX (manual)</option>
                    </select></label>
                  <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Ambiente</span>
                    <select value={b.environment} onChange={e => setBank(i, { environment: e.target.value as 'sandbox' | 'production' })} className={input}>
                      <option value="sandbox">Sandbox (teste)</option>
                      <option value="production">Produção</option>
                    </select></label>
                  <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Client ID</span>
                    <input value={b.client_id} onChange={e => setBank(i, { client_id: e.target.value })} className={input} placeholder="do app no portal Sicoob" /></label>
                  <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Agência</span>
                    <input value={b.agencia} onChange={e => setBank(i, { agencia: e.target.value })} className={input} /></label>
                  <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Conta</span>
                    <input value={b.conta} onChange={e => setBank(i, { conta: e.target.value })} className={input} /></label>
                </div>
                {b.provider === 'sicoob' && b.environment === 'production' && (
                  <p className="text-[11px] text-amber-600">Produção exige o certificado e-CNPJ A1 (mTLS) da clínica — configuração no onboarding.</p>
                )}
              </div>
            ))}
            <button onClick={addBank} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"><Plus className="h-3.5 w-3.5" /> Adicionar banco</button>
          </div>
        )}
      </div>

      {/* Integração PIX */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50"><QrCode className="h-4 w-4 text-emerald-600" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Utiliza integração PIX?</h3>
              <p className="text-xs text-slate-500">Recebimento PIX no caixa (estático por chave ou dinâmico por QR Code)</p>
            </div>
          </div>
          <button onClick={() => set({ pix_enabled: !cfg.pix_enabled })} className={`transition-colors ${cfg.pix_enabled ? 'text-emerald-600' : 'text-slate-300'}`}>
            {cfg.pix_enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
          </button>
        </div>
        {cfg.pix_enabled && (
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Provedor</span>
              <select value={cfg.pix.provider} onChange={e => set({ pix: { ...cfg.pix, provider: e.target.value } })} className={input}>
                <option value="sicoob">Sicoob PIX</option>
              </select></label>
            <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Ambiente</span>
              <select value={cfg.pix.environment} onChange={e => set({ pix: { ...cfg.pix, environment: e.target.value as 'sandbox' | 'production' } })} className={input}>
                <option value="sandbox">Sandbox (teste)</option><option value="production">Produção</option>
              </select></label>
            <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Chave PIX (estática)</span>
              <input value={cfg.pix.pix_key} onChange={e => set({ pix: { ...cfg.pix, pix_key: e.target.value } })} className={input} placeholder="CNPJ, e-mail, aleatória…" /></label>
            <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Client ID</span>
              <input value={cfg.pix.client_id} onChange={e => set({ pix: { ...cfg.pix, client_id: e.target.value } })} className={input} /></label>
            <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Client Secret</span>
              <input type="password" value={cfg.pix.client_secret} onChange={e => set({ pix: { ...cfg.pix, client_secret: e.target.value } })} className={input} /></label>
            <label className="block"><span className="text-[10px] font-semibold text-slate-500 uppercase">Token</span>
              <input type="password" value={cfg.pix.token} onChange={e => set({ pix: { ...cfg.pix, token: e.target.value } })} className={input} /></label>
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="h-4 w-4" /> Salvar Integrações</>}
      </button>
      <p className="text-[11px] text-slate-400">As credenciais ficam vinculadas à clínica e gatam as funcionalidades: sem ativar, os botões de integração não aparecem no Financeiro/Caixa. PIX dinâmico (QR na tela) e TEF entram nas próximas fases.</p>
    </div>
  )
}
