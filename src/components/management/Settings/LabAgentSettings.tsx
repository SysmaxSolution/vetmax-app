'use client'

// Configuração dos agentes-ponte de laboratório: gera o código de pareamento,
// lista agentes e mostra o passo-a-passo de instalação (com seletor de ambiente).

import { useEffect, useState } from 'react'
import { Loader2, Plus, Copy, Check, ScanLine, Power, Download, Rocket, X } from 'lucide-react'
import { listLabAgents, createLabAgentToken, setLabAgentActive, promoteLabAgent, cancelLabAgentPromotion, type LabAgentRow } from '@/lib/actions/lab-agents'

export default function LabAgentSettings({ onToast }: { onToast: (type: 'success' | 'error', msg: string) => void }) {
  const [rows, setRows] = useState<LabAgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  async function reload() {
    const r = await listLabAgents()
    if (!('error' in r)) setRows(r); else onToast('error', r.error)
    setLoading(false)
  }
  useEffect(() => { void reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setBusy(true)
    const r = await createLabAgentToken(label || 'Agente de laboratório')
    setBusy(false)
    if ('error' in r) return onToast('error', r.error)
    onToast('success', 'Código de pareamento gerado.'); setLabel(''); void reload()
  }
  async function toggle(row: LabAgentRow) {
    const r = await setLabAgentActive(row.id, !row.is_active)
    if ('error' in r) return onToast('error', r.error)
    void reload()
  }
  function copy(token: string) { navigator.clipboard?.writeText(token); setCopied(token); setTimeout(() => setCopied(null), 2000) }

  const [promo, setPromo] = useState<{ id: string; label: string | null } | null>(null)
  const [promoEnv, setPromoEnv] = useState<'prod' | 'dev'>('prod')
  const [promoToken, setPromoToken] = useState('')
  const [promoUrl, setPromoUrl] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  async function doPromote() {
    if (!promo) return
    setPromoBusy(true)
    const r = await promoteLabAgent(promo.id, promoEnv, promoToken, promoUrl || undefined)
    setPromoBusy(false)
    if ('error' in r) return onToast('error', r.error)
    onToast('success', 'Troca agendada — o agente aplica no próximo ping (≤30s).')
    setPromo(null); setPromoToken(''); setPromoUrl(''); void reload()
  }
  async function cancelPromo(id: string) {
    const r = await cancelLabAgentPromotion(id)
    if ('error' in r) return onToast('error', r.error)
    void reload()
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3"><ScanLine className="h-4 w-4 text-teal-600" /><span className="text-sm font-semibold text-slate-800">Novo agente</span></div>
        <div className="flex gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex.: PC Hematologia (URIT)" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
          <button onClick={create} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Gerar código</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
              <tr><th className="text-left px-4 py-2.5">Agente</th><th className="text-left px-2 py-2.5">Código de pareamento</th><th className="text-left px-2 py-2.5">Ambiente</th><th className="text-left px-2 py-2.5">Visto por último</th><th className="text-center px-2 py-2.5">Instalador</th><th className="text-right px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2 font-medium text-slate-800">{r.label}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => copy(r.token)} className="flex items-center gap-1.5 font-mono text-xs text-slate-600 hover:text-teal-700">
                      {copied === r.token ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {r.token.slice(0, 12)}…{r.token.slice(-4)}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {r.last_env
                        ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.last_env === 'prod' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.last_env}</span>
                        : <span className="text-[11px] text-slate-400">—</span>}
                      <button onClick={() => { setPromo({ id: r.id, label: r.label }); setPromoEnv(r.last_env === 'dev' ? 'prod' : 'prod') }} title="Promover / repontar ambiente" className="text-slate-400 hover:text-teal-700"><Rocket className="h-3.5 w-3.5" /></button>
                    </div>
                    {r.pending_env && <button onClick={() => cancelPromo(r.id)} className="mt-0.5 block text-[10px] text-amber-600 hover:underline">→ {r.pending_env} (aguardando ping · cancelar)</button>}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-500">{r.last_seen_at ? new Date(r.last_seen_at).toLocaleString('pt-BR') : 'nunca conectou'}</td>
                  <td className="px-2 py-2 text-center">
                    <a href={`/api/lab/installer?agent=${r.id}`} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"><Download className="h-3 w-3" /> Baixar (.zip)</a>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => toggle(r)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${r.is_active ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <Power className="h-3 w-3" /> {r.is_active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-700">Como instalar o agente na máquina do laboratório</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Clique em <strong>Baixar (.zip)</strong> na linha do agente — o instalador já vem com o token e o ambiente deste sistema embutidos.</li>
          <li>No PC ligado aos aparelhos (via AnyDesk), descompacte e execute <code>INSTALAR.bat</code> (confirme a permissão de administrador).</li>
          <li>O agente se instala como serviço, detecta os aparelhos e se configura sozinho. No fim, ele mostra o <strong>IP e a porta</strong>.</li>
          <li>No aparelho (URIT / BK-200), ligue <strong>“transmitir para o host/LIS”</strong> apontando para esse IP:porta (ver <code>INSTALACAO.md</code> no .zip).</li>
        </ol>
        <p className="text-slate-400">O instalador aponta para o ambiente em que você está agora — baixe aqui (DEV) para testar antes de produção.</p>
        <p className="text-slate-400"><strong>Promover para produção sem visita:</strong> gere um agente no sistema de produção, copie o código de pareamento, e clique no 🚀 na linha do agente (coluna Ambiente). O agente troca sozinho no próximo ping — sem AnyDesk.</p>
      </div>

      {/* Modal de promoção / repontamento remoto */}
      {promo && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setPromo(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-teal-600" /><h3 className="font-semibold text-slate-800">Trocar ambiente do agente</h3></div>
              <button onClick={() => setPromo(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500">Agente <strong className="text-slate-700">{promo.label ?? 'de laboratório'}</strong>. O agente aplica no próximo ping (≤30s), reescreve o config e passa a apontar para o novo ambiente — sem AnyDesk, sem visita.</p>
              <div>
                <label className="text-xs font-medium text-slate-500">Ambiente de destino</label>
                <div className="mt-1 flex gap-2">
                  {(['prod', 'dev'] as const).map(e => (
                    <button key={e} onClick={() => setPromoEnv(e)} className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold uppercase ${promoEnv === e ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500'}`}>{e === 'prod' ? 'Produção' : 'DEV (teste)'}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Código de pareamento do destino</label>
                <input value={promoToken} onChange={e => setPromoToken(e.target.value)} placeholder="lab_… (gerado no ambiente de destino)" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                <p className="mt-1 text-[11px] text-slate-400">O token vale só no ambiente onde foi criado. Gere o agente no sistema de <strong>{promoEnv === 'prod' ? 'produção' : 'DEV'}</strong> e cole o código aqui.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">URL do ambiente (opcional)</label>
                <input value={promoUrl} onChange={e => setPromoUrl(e.target.value)} placeholder={promoEnv === 'prod' ? 'https://app.sysvetmaxsolutions.com' : 'https://sysvetmax-dev.vercel.app'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <p className="mt-1 text-[11px] text-slate-400">Deixe em branco para usar o endereço padrão do ambiente.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setPromo(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={doPromote} disabled={promoBusy || !promoToken.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {promoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}Agendar troca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
