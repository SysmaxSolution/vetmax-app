'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogIn, Stethoscope } from 'lucide-react'
import { loginPartnerWithCode } from '@/lib/actions/partner-portal'

const serif = { fontFamily: 'var(--font-fraunces-p), serif' }

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
    <div className="bg-white rounded-2xl shadow-sm border border-[#EDE9E0] p-8">
      <div className="w-12 h-12 rounded-full bg-[#0E3B2E] flex items-center justify-center mx-auto mb-4">
        <Stethoscope className="h-6 w-6 text-[#C9A96A]" />
      </div>
      <h1 className="text-2xl text-[#16221C] text-center" style={serif}>Portal do Veterinário</h1>
      <p className="text-sm text-[#6A7A72] mt-1.5 text-center">Veja os resultados dos pets que você encaminhou. Entre com o código de acesso da sua clínica.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-[#6A7A72] mb-1">Código de acesso</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex.: ABCDE-234567"
                 autoCapitalize="characters" autoComplete="off"
                 className="w-full rounded-lg border border-[#E5E0D5] px-3 py-2.5 text-sm tracking-widest font-medium outline-none focus:border-[#17624A] focus:ring-2 focus:ring-[#17624A]/15" />
        </div>
        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy}
                className="w-full rounded-full bg-[#0E3B2E] text-white py-3 text-sm font-semibold hover:bg-[#134A38] disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Entrar
        </button>
      </form>

      <p className="mt-5 pt-5 border-t border-[#F0ECE3] text-xs text-[#9AA69F] text-center">
        Não tem o código? Peça ao centro de diagnóstico que recebe seus encaminhamentos.
      </p>
    </div>
  )
}
