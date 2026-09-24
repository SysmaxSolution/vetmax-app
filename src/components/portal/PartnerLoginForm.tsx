'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogIn, Stethoscope } from 'lucide-react'
import { loginPartnerWithCode } from '@/lib/actions/partner-portal'

const serif = { fontFamily: 'var(--pt-heading-font)' }

export default function PartnerLoginForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await loginPartnerWithCode(code)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[var(--pt-border)] p-8">
      <div className="w-12 h-12 rounded-full bg-[var(--pt-primary-dark)] flex items-center justify-center mx-auto mb-4">
        <Stethoscope className="h-6 w-6 text-[var(--pt-accent)]" />
      </div>
      <h1 className="text-2xl text-[var(--pt-text)] text-center" style={serif}>Portal do Veterinário</h1>
      <p className="text-sm text-[var(--pt-muted)] mt-1.5 text-center">Veja os resultados dos pets que você encaminhou. Entre com o código de acesso da sua clínica.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--pt-muted)] mb-1">Código de acesso</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex.: ABCDE-234567"
                 autoCapitalize="characters" autoComplete="off"
                 className="w-full rounded-lg border border-[var(--pt-border)] px-3 py-2.5 text-sm tracking-widest font-medium outline-none focus:border-[var(--pt-primary)] focus:ring-2 focus:ring-[var(--pt-primary)]/15" />
        </div>
        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy}
                className="w-full rounded-full bg-[var(--pt-primary-dark)] text-white py-3 text-sm font-semibold hover:bg-[var(--pt-primary-mid)] disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Entrar
        </button>
      </form>

      <p className="mt-5 pt-5 border-t border-[var(--pt-border-soft)] text-xs text-[var(--pt-muted-soft)] text-center">
        Não tem o código? Peça ao centro de diagnóstico que recebe seus encaminhamentos.
      </p>
    </div>
  )
}
