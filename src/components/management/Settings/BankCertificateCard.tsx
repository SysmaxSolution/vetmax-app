'use client'

// Certificado e-CNPJ A1 da clínica — upload e diagnóstico.
//
// O resultado do envio fica DENTRO do cartão, não num toast: a recusa mais
// comum (certificado com criptografia antiga) traz instrução de como resolver,
// e instrução que some em 4 segundos não serve para nada.

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, Upload, Trash2, Loader2, AlertTriangle, PlugZap, CheckCircle2, XCircle } from 'lucide-react'
import {
  listarCertificados, enviarCertificado, removerCertificado, testarIntegracaoBancaria,
  type CertificadoInfo,
} from '@/lib/actions/bank-certificates'

type Aviso = { tipo: 'ok' | 'erro'; titulo: string; texto: string } | null

export default function BankCertificateCard({
  bankCode = '756',
  bankLabel = 'Sicoob',
  bankAccountId = null,
  onToast,
}: {
  bankCode?: string
  bankLabel?: string
  bankAccountId?: string | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const [atual, setAtual]  = useState<CertificadoInfo | null>(null)
  const [loading, setLoad] = useState(true)
  const [busy, setBusy]    = useState(false)
  const [arquivo, setArq]  = useState<File | null>(null)
  const [senha, setSenha]  = useState('')
  const [aviso, setAviso]  = useState<Aviso>(null)

  const carregar = useCallback(async () => {
    const lista = await listarCertificados()
    setAtual(lista.find(c => c.bank_code === bankCode) ?? null)
    setLoad(false)
  }, [bankCode])
  useEffect(() => { void carregar() }, [carregar])

  /** Trocar arquivo ou senha limpa o resultado anterior — senão o usuário lê
   *  uma mensagem que já não vale para o que está na tela. */
  function mudou<T>(set: (v: T) => void) {
    return (v: T) => { setAviso(null); set(v) }
  }

  async function enviar() {
    if (!arquivo) { setAviso({ tipo: 'erro', titulo: 'Escolha o arquivo', texto: 'Selecione o .pfx ou .p12 do certificado.' }); return }
    setBusy(true); setAviso(null)
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])

    const res = await enviarCertificado({
      bank_code: bankCode, file_name: arquivo.name,
      pfx_base64: btoa(bin), passphrase: senha,
    })
    setBusy(false)

    if ('error' in res) {
      setAviso({ tipo: 'erro', titulo: 'O certificado não foi aceito', texto: res.error })
      return
    }
    // O sistema leu o titular e a validade do próprio arquivo — confirmar na
    // tela evita subir o certificado da empresa errada sem perceber.
    const quem = [res.subject_cn, res.not_after ? `vence em ${new Date(res.not_after).toLocaleDateString('pt-BR')}` : null]
      .filter(Boolean).join(' · ')
    setAviso({ tipo: 'ok', titulo: 'Certificado guardado', texto: `${quem}. Agora use "Testar conexão com o banco" para confirmar ponta a ponta.` })
    onToast('success', 'Certificado guardado com segurança.')
    setArq(null); setSenha('')
    void carregar()
  }

  async function remover() {
    if (!confirm(`Remover o certificado do ${bankLabel}?\n\nA busca automática de extrato para de funcionar até enviar outro.`)) return
    setBusy(true); setAviso(null)
    const res = await removerCertificado(bankCode)
    setBusy(false)
    if ('error' in res) return setAviso({ tipo: 'erro', titulo: 'Não foi possível remover', texto: res.error })
    setAtual(null)
    onToast('success', 'Certificado removido.')
  }

  async function testar() {
    if (!bankAccountId) return
    setBusy(true); setAviso(null)
    const r = await testarIntegracaoBancaria(bankAccountId)
    setBusy(false)
    setAviso(r.ok
      ? { tipo: 'ok', titulo: 'Conexão com o banco OK', texto: r.detalhe }
      : { tipo: 'erro', titulo: `Parou em: ${r.etapa}`, texto: r.detalhe })
  }

  if (loading) {
    return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando certificado…
    </div>
  }

  const inp = 'mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500'
  const rot = 'text-[10px] font-semibold uppercase text-slate-500'
  const vencendo = atual?.dias !== null && atual?.dias !== undefined && atual.dias <= 30

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-sky-600" />
        <span className="flex-1 text-xs font-bold text-slate-700">Certificado e-CNPJ A1 — {bankLabel}</span>
        {atual
          ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">enviado</span>
          : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">pendente</span>}
      </div>

      <div className="space-y-3 p-4">
        {atual && (
          <div className={`rounded-lg border p-2.5 ${vencendo ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
            <div className="flex flex-wrap items-center gap-2">
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
            {vencendo && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {(atual.dias as number) < 0
                  ? 'Certificado VENCIDO — a busca de extrato não funciona.'
                  : `Vence em ${atual.dias} dia(s). Providencie a renovação.`}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block"><span className={rot}>Arquivo .pfx / .p12</span>
            <input type="file" accept=".pfx,.p12" onChange={e => mudou(setArq)(e.target.files?.[0] ?? null)}
              className="mt-0.5 w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" /></label>
          <label className="block"><span className={rot}>Senha do certificado</span>
            <input type="password" value={senha} onChange={e => mudou(setSenha)(e.target.value)}
              autoComplete="new-password" className={inp} /></label>
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

        {/* Resultado do envio/teste — fica aqui, e não some. */}
        {aviso && (
          <div className={`flex gap-2 rounded-lg border p-3 ${
            aviso.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
            {aviso.tipo === 'ok'
              ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
              : <XCircle className="h-4 w-4 flex-shrink-0 text-rose-600" />}
            <div className="min-w-0 text-xs leading-relaxed">
              <strong className="block">{aviso.titulo}</strong>
              <span className="block">{aviso.texto}</span>
            </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-400">
          O arquivo é guardado cifrado e nunca volta para o navegador.
        </p>
      </div>
    </div>
  )
}
