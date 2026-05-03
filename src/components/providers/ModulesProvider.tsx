'use client'

import { createContext, useContext } from 'react'

const ModulesContext = createContext<string[]>([])

export function ModulesProvider({
  modules,
  children,
}: {
  modules: string[]
  children: React.ReactNode
}) {
  return (
    <ModulesContext.Provider value={modules}>
      {children}
    </ModulesContext.Provider>
  )
}

/** Returns the full list of active module keys for the current clinic. */
export function useModules() {
  return useContext(ModulesContext)
}

/** Returns true if the given module key is active. */
export function useModule(key: string) {
  return useContext(ModulesContext).includes(key)
}
