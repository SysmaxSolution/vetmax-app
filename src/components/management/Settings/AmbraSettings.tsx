'use client'

// Configuração da captura de imagens da Ambra (PACS em nuvem) — item 3.5 da
// Fase 3. A credencial é por clínica e a senha nunca volta para a tela: o campo
// fica vazio e só é enviado quando o operador digita uma senha nova.
//
// A tela também mostra os eventos que a Ambra mandou e que NÃO casaram com
// nenhum estudo — sem essa lista, imagem que chega com accession errado some em
// silêncio até o tutor cobrar o exame.

import { useEffect, useState } from 'react'
import {
  Loader2, Save, Copy, Check, Plug, Webhook, AlertTriangle, ExternalLink,
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  getConfigAmbra, salvarConfigAmbra, testarConexaoAmbra, registrarWebhookAmbra,
  listarEventosAmbraPendentes,
  type ConfigAmbraVisivel, type EventoAmbraPendente,
} from '@/lib/actions/ambra'

type Toast = (type: 'success' | 'error', msg: string) => void

export default function AmbraSettings({ onToast }: { onToast: Toast }) {
  const [cfg, setCfg] = useState<ConfigAmbraVisivel | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testando, setTestando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [senha, setSenha] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [orfaos, setOrfaos] = useState<EventoAmbraPendente[]>([])

  async function reload() {
    const r = await getConfigAmbra()
    if ('error' in r) { setErroCarga(r.error); setLoading(false); return }
    setCfg(r); setErroCarga(null); setLoading(false)
    const ev = await listarEventosAmbraPendentes(20)
    if (Array.isArray(ev)) setOrfaos(ev)
  }
  useEffect(() => { void reload() }, [])

  function set<K extends keyof ConfigAmbraVisivel>(k: K, v: ConfigAmbraVisivel[K]) {
    setCfg(c => (c ? { ...c, [k]: v } : c))
  }

  async function salvar() {
    if (!cfg) return
    setSaving(true)
    const r = await salvarConfigAmbra({
      enabled:            cfg.enabled,
      base_url:           cfg.base_url,
      login:              cfg.login ?? undefined,
      password:           senha || undefined,
      phi_namespace:      cfg.phi_namespace ?? undefined,
      account_id:         cfg.account_id ?? undefined,
      link_minutes_alive: cfg.link_minutes_alive,
      link_max_hits:      cfg.link_max_hits,
      notify_emails:      cfg.notify_emails ?? undefined,
    })
    setSaving(false)
    if ('error' in r) return onToast('error', r.error)
    setSenha('')
    onToast('success', 'Configuração da Ambra salva.')
    void reload()
  }

  async function testar() {
    setTestando(true)
    const r = await testarConexaoAmbra()
    setTestando(false)
    if ('error' in r) return onToast('error', r.error)
    onToast('success', `Conexão OK — ${r.estudosVisiveis} estudo(s) visíveis para este usuário.`)
  }

  async function registrar() {
    setRegistrando(true)
    const r = await registrarWebhookAmbra()
    setRegistrando(false)
    if ('error' in r) return onToast('error', r.error)
    onToast('success', 'Webhook registrado na Ambra.')
    void reload()
  }

  function copiar(txt: string) {
    navigator.clipboard?.writeText(txt)
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400 py-6"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  }

  if (erroCarga || !cfg) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {erroCarga ?? 'Não foi possível carregar a configuração.'}
      </div>
    )
  }

  const dias = (cfg.link_minutes_alive / 1440).toFixed(cfg.link_minutes_alive % 1440 === 0 ? 0 : 1)

  return (
    <div className="space-y-5">
      {/* Liga/desliga */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">Captura de imagens da Ambra</p>
          <p className="text-xs text-slate-500 mt-1">
            As imagens continuam na Ambra — guardamos apenas o link do visualizador deles, obtido por
            API e amarrado ao estudo pelo <strong>accession</strong>. Nenhum arquivo DICOM trafega ou
            fica armazenado aqui.
          </p>
        </div>
        <button
          type="button"
          onClick={() => set('enabled', !cfg.enabled)}
          className="flex-shrink-0 text-slate-400 hover:text-teal-600"
          title={cfg.enabled ? 'Desativar' : 'Ativar'}
        >
          {cfg.enabled
            ? <ToggleRight className="h-8 w-8 text-teal-600" />
            : <ToggleLeft className="h-8 w-8" />}
        </button>
      </div>

      {/* Credencial */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Plug className="h-4 w-4 text-slate-400" />Credencial do usuário de integração
        </h4>
        <p className="text-xs text-slate-500">
          Dados fornecidos pela Ambra ao criar o usuário de integração da clínica. A senha é
          guardada cifrada e nunca volta para esta tela.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="URL da Ambra">
            <input value={cfg.base_url} onChange={e => set('base_url', e.target.value)}
                   placeholder="https://access.ambrahealth.com" className={inputCls} />
          </Campo>
          <Campo label="Usuário (e-mail)">
            <input value={cfg.login ?? ''} onChange={e => set('login', e.target.value)}
                   autoComplete="off" placeholder="integracao@…" className={inputCls} />
          </Campo>
          <Campo label={cfg.tem_senha ? 'Senha (preenchida — digite para trocar)' : 'Senha'}>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                   autoComplete="new-password"
                   placeholder={cfg.tem_senha ? '•••••••• (mantém a atual)' : 'senha do usuário'}
                   className={inputCls} />
          </Campo>
          <Campo label="PHI Namespace">
            <input value={cfg.phi_namespace ?? ''} onChange={e => set('phi_namespace', e.target.value)}
                   placeholder="informado pela Ambra" className={inputCls} />
          </Campo>
          <Campo label="Account ID">
            <input value={cfg.account_id ?? ''} onChange={e => set('account_id', e.target.value)}
                   placeholder="informado pela Ambra" className={inputCls} />
          </Campo>
        </div>
      </div>

      {/* Segurança do link */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-slate-400" />Segurança do link de visualização
        </h4>
        <p className="text-xs text-slate-500">
          O link vai por e-mail e WhatsApp para o tutor e para o veterinário solicitante. Link eterno
          e de uso ilimitado circulando em WhatsApp é vazamento de imagem médica — por isso ele
          nasce com prazo e teto de acessos.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo label={`Validade em minutos (≈ ${dias} dia(s))`}>
            <input type="number" min={5} max={525600} value={cfg.link_minutes_alive}
                   onChange={e => set('link_minutes_alive', Number(e.target.value))} className={inputCls} />
          </Campo>
          <Campo label="Máximo de acessos">
            <input type="number" min={1} max={10000} value={cfg.link_max_hits}
                   onChange={e => set('link_max_hits', Number(e.target.value))} className={inputCls} />
          </Campo>
          <Campo label="Avisar por e-mail a cada acesso">
            <input value={cfg.notify_emails ?? ''} onChange={e => set('notify_emails', e.target.value)}
                   placeholder="separe por vírgula (opcional)" className={inputCls} />
          </Campo>
        </div>
      </div>

      {/* Webhook */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Webhook className="h-4 w-4 text-slate-400" />Aviso automático de imagem pronta
        </h4>
        <p className="text-xs text-slate-500">
          A Ambra chama esta URL quando a primeira imagem do estudo chega
          (<code className="text-[11px]">STUDY_FIRST_IMAGE</code>) e o link é criado sozinho. A URL
          contém um segredo nosso — não divulgue.
        </p>

        {cfg.webhook_url ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <code className="text-[11px] text-slate-600 truncate flex-1">{cfg.webhook_url}</code>
            <button type="button" onClick={() => copiar(cfg.webhook_url!)}
                    className="text-slate-400 hover:text-teal-600 flex-shrink-0">
              {copiado ? <Check className="h-4 w-4 text-teal-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Salve a configuração para gerar a URL do webhook.</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={registrar} disabled={registrando || !cfg.webhook_url}
                  className="text-xs font-semibold text-teal-700 border border-teal-200 rounded-lg px-3 py-2 flex items-center gap-1.5 hover:bg-teal-50 disabled:opacity-50">
            {registrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
            {cfg.webhook_id ? 'Webhook já registrado' : 'Registrar webhook na Ambra'}
          </button>
          {cfg.webhook_id && (
            <span className="text-[11px] text-slate-400">id {cfg.webhook_id}</span>
          )}
        </div>
        {!cfg.webhook_id && (
          <p className="text-[11px] text-slate-400">
            Se a Ambra recusar por permissão, envie a URL acima ao suporte deles e peça o cadastro do
            evento <code>STUDY_FIRST_IMAGE</code>.
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={salvar} disabled={saving}
                className="text-sm font-semibold text-white bg-teal-600 rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-teal-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
        </button>
        <button type="button" onClick={testar} disabled={testando || !cfg.enabled}
                className="text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50">
          {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}Testar conexão
        </button>
      </div>

      {/* Eventos órfãos */}
      {orfaos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4" />Imagens que chegaram sem estudo correspondente
          </h4>
          <p className="text-xs text-amber-800 mb-3">
            A Ambra avisou que a imagem chegou, mas o accession não casou com nenhum estudo daqui —
            normalmente accession digitado errado no aparelho. Abra o estudo certo e use
            <strong> Vincular na Ambra</strong> informando o accession abaixo.
          </p>
          <div className="space-y-1.5">
            {orfaos.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 text-xs bg-white/70 rounded-lg px-3 py-2">
                <code className="font-semibold text-slate-700">{ev.accession_number ?? '— sem accession —'}</code>
                <span className="text-slate-400">{ev.event}</span>
                <span className="ml-auto text-slate-400">
                  {new Date(ev.received_at).toLocaleString('pt-BR')}
                </span>
                {ev.error && <span className="text-red-600 truncate max-w-[200px]">{ev.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
