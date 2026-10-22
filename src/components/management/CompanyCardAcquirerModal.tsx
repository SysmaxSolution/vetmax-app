'use client'

// GESTÃO › EMPRESAS — configuração da operadora de cartão de uma empresa faturante.
//
// A credencial é DO ESTABELECIMENTO, não nossa: a própria documentação da
// EvoluServices recomenda que o parceiro crie uma tela para o cliente colar a
// chave. Por isso esta tela existe, e por isso ela explica ONDE achar cada dado
// no portal deles — quem preenche é a gestão da clínica, não um técnico.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, CreditCard, Loader2, Check, AlertTriangle, Copy, Eye, EyeOff, Plug, ExternalLink,
} from 'lucide-react'
import {
  salvarConfigAdquirente, testarConexaoAdquirente, listarTerminaisDaEmpresa,
} from '@/lib/actions/card-acquirer'
import type { ConfigAdquirente, TerminalDisponivel } from '@/types/card-acquirer'

interface Props {
  config:  ConfigAdquirente
  onClose: () => void
  onSaved: () => void
}

export default function CompanyCardAcquirerModal({ config, onClose, onSaved }: Props) {
  const [acquirer, setAcquirer]       = useState(config.acquirer)
  const [ativo, setAtivo]             = useState(config.enabled)
  const [ambiente, setAmbiente]       = useState(config.environment)
  const [merchantId, setMerchantId]   = useState(config.merchant_id ?? '')
  const [usuario, setUsuario]         = useState(config.api_username ?? '')
  const [chave, setChave]             = useState('')
  const [verChave, setVerChave]       = useState(false)
  const [terminalPadrao, setTerminal] = useState(config.default_terminal_id ?? '')

  const [salvando, setSalvando]   = useState(false)
  const [testando, setTestando]   = useState(false)
  const [erro, setErro]           = useState<string | null>(null)
  const [aviso, setAviso]         = useState<string | null>(null)
  const [ok, setOk]               = useState<string | null>(null)
  const [webhookUrl, setWebhook]  = useState(config.webhook_url)
  const [terminais, setTerminais] = useState<TerminalDisponivel[]>([])
  const [copiado, setCopiado]     = useState(false)

  const carregarTerminais = useCallback(async () => {
    if (!config.enabled) return
    const r = await listarTerminaisDaEmpresa(config.company_id)
    if (Array.isArray(r)) setTerminais(r)
  }, [config.company_id, config.enabled])

  useEffect(() => { void carregarTerminais() }, [carregarTerminais])

  async function salvar() {
    setSalvando(true); setErro(null); setOk(null)
    const r = await salvarConfigAdquirente({
      companyId: config.company_id,
      acquirer, enabled: ativo, environment: ambiente,
      merchantId: merchantId.trim() || null,
      apiUsername: usuario.trim() || null,
      apiKey: chave.trim() || null,          // em branco = manter a atual
      defaultTerminalId: terminalPadrao.trim() || null,
    })
    setSalvando(false)
    if ('error' in r) { setErro(r.error); return }
    setWebhook(r.webhook_url)
    setChave('')
    setOk('Configuração salva.')
    onSaved()
  }

  async function testar() {
    setTestando(true); setErro(null); setOk(null); setAviso(null)
    const r = await testarConexaoAdquirente(config.company_id)
    setTestando(false)
    if ('error' in r) { setErro(r.error); return }
    setOk(`Conexão OK — ${r.terminais} maquininha(s) e ${r.beneficiarios} beneficiário(s) de repasse.`)
    if (r.aviso) setAviso(r.aviso)
    void carregarTerminais()
  }

  const copiarWebhook = async () => {
    if (!webhookUrl) return
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* área de transferência bloqueada: o usuário copia à mão */ }
  }

  const corpo = (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl my-8">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
              <CreditCard className="h-4.5 w-4.5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Operadora de cartão</h2>
              <p className="text-xs text-slate-500">
                {config.company_name}{config.company_cnpj ? ` · ${config.company_cnpj}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </header>

        <div className="px-6 py-5 space-y-5">
          {erro && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />{erro}
            </div>
          )}
          {ok && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />{ok}
            </div>
          )}
          {aviso && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />{aviso}
            </div>
          )}

          {/* Cada empresa tem a SUA adquirente — é a regra por CNPJ da Animais */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Operadora desta empresa</label>
              <select value={acquirer} onChange={e => setAcquirer(e.target.value as ConfigAdquirente['acquirer'])}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20">
                <option value="evoluservices">FinPet / EvoluServices</option>
                <option value="sipag">Sipag</option>
                <option value="outro">Outra</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Cada empresa pode usar uma operadora diferente. No caixa, a máquina é escolhida pela empresa do item.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ambiente</label>
              <select value={ambiente} onChange={e => setAmbiente(e.target.value as ConfigAdquirente['environment'])}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20">
                <option value="sandbox">Testes (sandbox)</option>
                <option value="production">Produção</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Produção só depois da homologação com a operadora.
              </p>
            </div>
          </div>

          {acquirer === 'evoluservices' && (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Estes três dados vêm da operadora. A chave do estabelecimento fica no portal, em{' '}
                  <a href="https://www.evoluservices.com/merchant/partner-integrations" target="_blank"
                     rel="noopener noreferrer" className="text-teal-700 hover:underline inline-flex items-center gap-0.5">
                    Integrações com parceiros <ExternalLink className="h-3 w-3" />
                  </a>
                  ; o usuário e a senha de API chegam por e-mail.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Chave do estabelecimento</label>
                  <input value={merchantId} onChange={e => setMerchantId(e.target.value)}
                    placeholder="ex.: ffc902f6-c596-4b7f-8a5e-2a72f59eea1b"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Usuário da API</label>
                    <input value={usuario} onChange={e => setUsuario(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Chave de integração {config.tem_api_key && <span className="text-emerald-600">· já cadastrada</span>}
                    </label>
                    <div className="relative">
                      <input type={verChave ? 'text' : 'password'} value={chave} onChange={e => setChave(e.target.value)}
                        placeholder={config.tem_api_key ? 'deixe em branco para manter' : 'cole a chave aqui'}
                        className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20" />
                      <button type="button" onClick={() => setVerChave(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {verChave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  A chave é guardada criptografada e nunca é exibida de volta.
                </p>
              </div>

              {/* URL de retorno: tem de ser cadastrada no portal deles */}
              {webhookUrl && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-600 mb-1.5">URL de retorno (callback)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-[11px] font-mono text-slate-600">
                      {webhookUrl}
                    </code>
                    <button onClick={copiarWebhook}
                      className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50">
                      {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiado ? 'copiado' : 'copiar'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                    Envie esta URL ao time de Integração da operadora para que eles cadastrem o callback.
                    É por ela que as vendas voltam ao sistema — <strong>inclusive as passadas direto na
                    maquininha</strong>, sem passar pelo caixa.
                  </p>
                </div>
              )}

              {/* Maquininhas */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-600">Maquininhas</p>
                  <button onClick={testar} disabled={testando}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {testando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                    Testar conexão
                  </button>
                </div>
                {terminais.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    Nenhuma maquininha registrada. Se for de cabo, o computador dela precisa estar ligado
                    com o programa da operadora aberto.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {terminais.map(t => (
                      <label key={t.terminalId}
                        className="flex items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-2 cursor-pointer hover:bg-slate-50">
                        <input type="radio" name="terminal" checked={terminalPadrao === t.terminalId}
                          onChange={() => setTerminal(t.terminalId)} className="mt-0.5 text-teal-600 focus:ring-teal-500/30" />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-mono text-slate-800">{t.terminalId}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                              t.pode_cobrar ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                              {t.rotulo}
                            </span>
                            {t.computerName && <span className="text-[11px] text-slate-400">{t.computerName}</span>}
                          </span>
                          <span className="block text-[11px] text-slate-500">{t.explicacao}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30" />
            <span className="text-sm text-slate-700">
              Cobrar cartão por esta operadora
              <span className="block text-[11px] text-slate-400">
                Desligado, nada muda: o caixa segue registrando o cartão como hoje, sem falar com a operadora.
              </span>
            </span>
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Fechar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salvar
          </button>
        </footer>
      </div>
    </div>
  )

  // Portal no body: modal dentro de ancestral com transform fica preso fora da
  // viewport — armadilha já conhecida no projeto.
  return typeof document === 'undefined' ? corpo : createPortal(corpo, document.body)
}
