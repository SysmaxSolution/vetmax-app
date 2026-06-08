'use client'

/**
 * Gate de cadastro do tutor para NFS-e — Faturamento Fase 2.
 *
 * Renderiza um aviso (não-bloqueante) quando a clínica EMITE NFS-e e o cadastro
 * do tutor está incompleto para a nota (CPF/CNPJ, endereço completo). Fica
 * dormente enquanto a clínica não emite nota (clinicEmitsNfse=false até a
 * Fase 3) — nesse caso não renderiza nada.
 *
 * `onValidity` informa o pai se o cadastro está apto, permitindo (na Fase 3)
 * desabilitar a emissão de nota — sem travar o recebimento em si.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { clinicEmitsNfse, validateTutorForNfse } from '@/lib/actions/billing-documents'

interface Props {
  tutorId: string | null | undefined
  onValidity?: (valid: boolean) => void
}

export default function NfseTutorGate({ tutorId, onValidity }: Props) {
  const [emits, setEmits] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const e = await clinicEmitsNfse()
      if (cancelled) return
      setEmits(e.emits)
      if (!e.emits || !tutorId) { setChecked(true); onValidity?.(true); return }
      const v = await validateTutorForNfse(tutorId)
      if (cancelled) return
      if ('error' in v) { setChecked(true); onValidity?.(true); return }
      setMissing(v.missing)
      setChecked(true)
      onValidity?.(v.valid)
    }
    run()
    return () => { cancelled = true }
  }, [tutorId])

  if (!checked || !emits || missing.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800">Cadastro incompleto para NFS-e</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Para emitir a nota deste atendimento, complete no cadastro do tutor: {missing.join(', ')}.
            O recebimento pode prosseguir normalmente.
          </p>
        </div>
      </div>
    </div>
  )
}
