'use client'

import { createContext, useContext } from 'react'

const WhatsAppGateContext = createContext<boolean>(false)

export function WhatsAppGateProvider({
  enabled,
  children,
}: {
  enabled:  boolean
  children: React.ReactNode
}) {
  return (
    <WhatsAppGateContext.Provider value={enabled}>
      {children}
    </WhatsAppGateContext.Provider>
  )
}

/** Retorna true se a clínica tem WhatsApp configurado e ativo. */
export function useWhatsAppGate(): boolean {
  return useContext(WhatsAppGateContext)
}
