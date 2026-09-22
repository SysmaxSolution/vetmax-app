'use client'

import { useState, useEffect } from 'react'
import { Loader2, Save, Barcode } from 'lucide-react'
import { listBoletoAccounts, saveBoletoConfig, type BoletoConfig } from '@/lib/actions/boleto-cobranca'

export default function BoletoCarteiraPanel({ accountId }: { accountId: string }) {
  const [cfg, setCfg] = useState<BoletoConfig>({})
  const [enabled, setEnabled] = useState(false)
  const [nextNN, setNextNN] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  useEffect(() => {
    listBoletoAccounts().then(accs => {
      const a = accs.find(x => x.id === accountId)
      if (a) { setCfg(a.config ?? {}); setEnabled(a.enabled); setNextNN(a.nextNossoNumero) }
      setLoading(false)
    })
  }, [accountId])

  const set = <K extends keyof BoletoConfig>(k: K, v: BoletoConfig[K]) => setCfg(c => ({ ...c, [k]: v }))
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')))

  async function save() {
    setBusy(true); setMsg(null)
    const r = await saveBoletoConfig(accountId, cfg, enabled, nextNN)
    setBusy(false)
    setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: 'Carteira salva.' })
  }

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>

  const F = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none'
  const L = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 flex items-start gap-2">
        <Barcode className="h-4 w-4 text-teal-600 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-teal-800">Emissão de boletos por esta conta</p>
          <p className="text-[11px] text-teal-600">Preencha os dados da carteira do banco. Em ambiente de testes use dados fictícios (seguindo o manual) para ver o layout.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600" />
          <span className="text-xs font-semibold text-teal-800">Habilitar</span>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><label className={L}>Agência / Cooperativa</label><input className={F} value={cfg.agencia ?? ''} onChange={e => set('agencia', e.target.value)} placeholder="4321" /></div>
        <div><label className={L}>Conta</label><input className={F} value={cfg.conta ?? ''} onChange={e => set('conta', e.target.value)} placeholder="123456" /></div>
        <div><label className={L}>Dígito da conta</label><input className={F} value={cfg.contaDv ?? ''} onChange={e => set('contaDv', e.target.value)} placeholder="7" /></div>
        <div><label className={L}>Código do beneficiário</label><input className={F} value={cfg.codigoCliente ?? ''} onChange={e => set('codigoCliente', e.target.value)} placeholder="123456" /></div>
        <div><label className={L}>Carteira</label><input className={F} value={cfg.carteira ?? ''} onChange={e => set('carteira', e.target.value)} placeholder="1" /></div>
        <div><label className={L}>Modalidade</label><input className={F} value={cfg.modalidade ?? ''} onChange={e => set('modalidade', e.target.value)} placeholder="01" /></div>
        <div><label className={L}>Espécie doc.</label><input className={F} value={cfg.especie ?? ''} onChange={e => set('especie', e.target.value)} placeholder="DM" /></div>
        <div><label className={L}>% Multa (após venc.)</label><input className={F} value={cfg.multaPercent ?? ''} onChange={e => set('multaPercent', num(e.target.value))} placeholder="2" /></div>
        <div><label className={L}>% Juros ao mês</label><input className={F} value={cfg.jurosMesPercent ?? ''} onChange={e => set('jurosMesPercent', num(e.target.value))} placeholder="1" /></div>
        <div><label className={L}>Código de instrução</label><input className={F} value={cfg.instrucaoCodigo ?? ''} onChange={e => set('instrucaoCodigo', e.target.value)} placeholder="opcional" /></div>
        <div><label className={L}>Próximo nosso número</label><input type="number" className={F} value={nextNN} onChange={e => setNextNN(Math.max(1, Number(e.target.value) || 1))} /></div>
        <div>
          <label className={L}>Ambiente</label>
          <select className={F} value={cfg.environment ?? 'sandbox'} onChange={e => set('environment', e.target.value as 'sandbox' | 'production')}>
            <option value="sandbox">Testes (sandbox)</option>
            <option value="production">Produção</option>
          </select>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-600 mb-2">Dados do beneficiário (impressos no boleto)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={F} value={cfg.beneficiarioNome ?? ''} onChange={e => set('beneficiarioNome', e.target.value)} placeholder="Razão social do beneficiário" />
          <input className={F} value={cfg.beneficiarioDoc ?? ''} onChange={e => set('beneficiarioDoc', e.target.value)} placeholder="CNPJ/CPF do beneficiário" />
          <input className={`${F} sm:col-span-2`} value={cfg.beneficiarioEndereco ?? ''} onChange={e => set('beneficiarioEndereco', e.target.value)} placeholder="Endereço do beneficiário" />
        </div>
      </div>

      <div>
        <label className={L}>Mensagens / instruções no boleto (uma por linha)</label>
        <textarea className={F} rows={3} value={(cfg.mensagens ?? []).join('\n')} onChange={e => set('mensagens', e.target.value.split('\n'))} placeholder={'Não receber após 30 dias do vencimento\nApós o vencimento, cobrar multa de 2% + juros'} />
      </div>

      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}

      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar carteira
        </button>
      </div>
    </div>
  )
}
