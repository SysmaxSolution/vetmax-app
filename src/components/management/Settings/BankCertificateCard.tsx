'use client'

// Certificado e-CNPJ A1 da clínica — o que faltava na tela de Integrações
// Financeiras. Sem ele o Sicoob recusa produção no próprio handshake TLS, e o
// aviso "configuração no onboarding" não levava a lugar nenhum.
//
// O arquivo é lido no navegador, enviado em base64 e guardado cifrado. Nunca
// volta: a tela mostra só nome, CNPJ e vencimento.

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, Upload, Trash2, Loader2, AlertTriangle, PlugZap, CheckCircle2 } from 'lucide-react'
import {
  listarCertificados, enviarCertificado, removerCertificado, testarIntegracaoBancaria,
  type CertificadoInfo,
} from '@/lib/actions/bank-certificates'

export default function BankCertificateCard({
  bankCode = '756',
  bankLabel = 'Sicoob',
  bankAccountId = null,
  onToast,
}: {
  bankCode?: string
  bankLabel?: string
  /** Conta usada no "Testar conexão". Sem ela o botão não aparece. */
  bankAccountId?: string | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const [atual, setAtual]   = useState<CertificadoInfo | null>(null)
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState(false)
  const [arquivo, setArq]   = useState<File | null>(null)
  const [senha, setSenha]   = useState('')
  const [venc, setVenc]     = useState('')
  const [cnpj, setCnpj]     = useState('')
  const [teste, setTeste]   = useState<{ ok: boolean; etapa: string; detalhe: string } | null>(null)

  const carregar = useCallback(async () => {
    const lista = await listarCertificados()
    setAtual(lista.find(c => c.bank_code === bankCode) ?? null)
    setLoad(false)
  }, [bankCode])
  useEffect(() => { void carregar() }, [carregar])

  async function enviar() {
    if (!arquivo) return onToast('error', 'Escolha o arquivo .pfx.')
    setBusy(true)
    const buf = await arquivo.arrayBuffer()
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const res = await enviarCertificado({
      bank_code: bankCode, file_name: arquivo.name,
      pfx_base64: btoa(bin), passphrase: senha,
      cnpj: cnpj || undefined, not_after: venc || undefined,
    })
    setBusy(false)
    if ('error' in res) return onToast('error', res.error)
    onToast('success', 'Certificado guardado com segurança.')
    setArq(null); setSenha(''); setVenc(''); setCnpj('')
    void carregar()
  }

  async function remover() {
    if (!confirm(`Remover o certificado do ${bankLabel}?\n\nA busca automática de extrato para de funcionar até enviar outro.`)) return
    setBusy(true)
    const res = await removerCertificado(bankCode)
    setBusy(false)
    if ('error' in res) return onToast('error', res.error)
    onToast('success', 'Certificado removido.'); setAtual(null)
  }

  async function testar() {
    if (!bankAccountId) return
    setBusy(true); setTeste(null)
    setTeste(await testarIntegracaoBancaria(bankAccountId))
    setBusy(false)
  }

  if (loading) {
    return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando certificado…
    </div>
  }

  const inp = 'mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500'
  const rot = 'text-[10px] font-semibold uppercase text-slate-500'

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <ShieldCheck className="h-4 w-4 text-sky-600" />
        <span className="text-xs font-bold text-slate-700">Certificado e-CNPJ A1 — {bankLabel}</span>
      </div>

      <div className="space-y-3 p-4">
        {atual ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 text-xs">
                <span className="block font-semibold text-slate-800">{atual.file_name ?? 'certificado.pfx'}</span>
                <span className="block text-[11px] text-slate-500">
                  {atual.cnpj ? `CNPJ ${atual.cnpj} · ` : ''}
                  {atual.not_after
                    ? `vence em ${new Date(atual.not_after).toLocaleDateString('pt-BR')}`
                    : 'vencimento não informado'}
                </span>
              </span>
              <button onClick={remover} disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-3 w-3" /> Remover
              </button>
            </div>
            {atual.dias !== null && atual.dias <= 30 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {atual.dias < 0
                  ? 'Certificado VENCIDO — a busca de extrato não funciona.'
                  : `Vence em ${atual.dias} dia(s). Providencie a renovação.`}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            Nenhum certificado enviado. Em <strong>produção</strong> o banco exige o e-CNPJ A1 da
            empresa no próprio handshake — sem ele a busca de extrato é recusada antes de chegar
            na autenticação.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block"><span className={rot}>Arquivo .pfx / .p12</span>
            <input type="file" accept=".pfx,.p12" onChange={e => setArq(e.target.files?.[0] ?? null)}
              className="mt-0.5 w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" /></label>
          <label className="block"><span className={rot}>Senha do certificado</span>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              autoComplete="new-password" className={inp} /></label>
          <label className="block"><span className={rot}>CNPJ do titular (opcional)</span>
            <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" className={inp} /></label>
          <label className="block"><span className={rot}>Vence em (opcional)</span>
            <input type="date" value={venc} onChange={e => setVenc(e.target.value)} className={inp} /></label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={enviar} disabled={busy || !arquivo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {atual ? 'Substituir certificado' : 'Enviar certificado'}
          </button>

          {bankAccountId && (
            <button onClick={testar} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <PlugZap className="h-3.5 w-3.5" /> Testar conexão com o banco
            </button>
          )}
        </div>

        {teste && (
          <div className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
            teste.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            <strong>{teste.ok ? 'Conexão OK' : `Parou em: ${teste.etapa}`}</strong> — {teste.detalhe}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-400">
          O arquivo é guardado cifrado e nunca volta para o navegador. A senha fica separada do
          arquivo. Quem envia precisa ser administrador da clínica.
        </p>
      </div>
    </div>
  )
}
