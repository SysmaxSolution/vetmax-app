'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogIn, MessageCircle } from 'lucide-react'
import { loginTutorWithCode } from '@/lib/actions/tutor-portal'

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

const serif = { fontFamily: 'var(--pt-heading-font)' }

export default function PortalLoginForm() {
  const router = useRouter()
  const [cpf, setCpf] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await loginTutorWithCode(cpf, code)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[var(--pt-border)] p-8">
      <h1 className="text-2xl text-[var(--pt-text)] text-center" style={serif}>Área do Tutor</h1>
      <p className="text-sm text-[var(--pt-muted)] mt-1.5 text-center">Entre com seu CPF e o código fornecido pela clínica.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--pt-muted)] mb-1">CPF</label>
          <input value={cpf} onChange={e => setCpf(maskCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00"
                 className="w-full rounded-lg border border-[var(--pt-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--pt-primary)] focus:ring-2 focus:ring-[var(--pt-primary)]/15" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--pt-muted)] mb-1">Código de acesso</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex.: ABCD2345"
                 autoCapitalize="characters" autoComplete="off"
                 className="w-full rounded-lg border border-[var(--pt-border)] px-3 py-2.5 text-sm tracking-widest font-medium outline-none focus:border-[var(--pt-primary)] focus:ring-2 focus:ring-[var(--pt-primary)]/15" />
        </div>
        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy}
                className="w-full rounded-full bg-[var(--pt-primary-dark)] text-white py-3 text-sm font-semibold hover:bg-[var(--pt-primary-mid)] disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Entrar
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-[var(--pt-border-soft)] text-center">
        <p className="text-xs text-[var(--pt-muted-soft)] flex items-center justify-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Primeiro acesso ou esqueceu o código? Use o link que a clínica envia no WhatsApp.
        </p>
      </div>
    </div>
  )
}
