'use client'

/**
 * UpgradeProvider — orquestra o UpgradeModal globalmente.
 *
 * Padrão singleton via Context:
 *  - <UpgradeProvider planName="free" activeModules={[...]}>{children}</UpgradeProvider>
 *  - Em qualquer descendente: const { open } = useUpgradeModal(); open('hospitalization')
 *  - Componente <UpgradeTrigger feature="..."> embrulha um botão; em
 *    plano Free intercepta o click e abre o modal; em planos pagos OU
 *    quando o módulo já está em activeModules, deixa o click passar
 *    normalmente (wrapper invisível — sem impacto no layout).
 *
 * Por design o componente NUNCA pré-renderiza o modal — só monta quando
 * abre, evitando custo zero para todos os usuários que não tropeçam em
 * gatilhos pagos.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import UpgradeModal, { type UpgradeFeatureKey } from './UpgradeModal'

interface UpgradeContextValue {
  planName:      string
  activeModules: string[]
  open:          (feature: UpgradeFeatureKey) => void
  /**
   * Retorna true quando a feature está liberada pelo plano atual
   * (módulo presente em activeModules). Usado pelos triggers para
   * decidir se interceptam o click ou não.
   */
  isUnlocked:    (feature: UpgradeFeatureKey) => boolean
}

const UpgradeContext = createContext<UpgradeContextValue | null>(null)

// ─── Mapeamento feature → módulo do active_modules ───────────────────────────
// As 3 features iniciais espelham módulos do tenant. Quando criarmos
// features que NÃO são módulos (ex.: "Limite de 100 pets"), basta adicionar
// uma chave aqui com fallback para planName.
const FEATURE_TO_MODULE: Record<UpgradeFeatureKey, string> = {
  hospitalization:      'hospitalization',
  whatsapp_intelligent: 'whatsapp_intelligent',
  reports_export:       'reports',
}

interface ProviderProps {
  planName?:      string
  activeModules?: string[]
  children:       ReactNode
}

export function UpgradeProvider({
  planName      = 'free',
  activeModules = [],
  children,
}: ProviderProps) {
  const [openFeature, setOpenFeature] = useState<UpgradeFeatureKey | null>(null)

  const isUnlocked = useCallback((feature: UpgradeFeatureKey) => {
    const mod = FEATURE_TO_MODULE[feature]
    return activeModules.includes(mod)
  }, [activeModules])

  const open = useCallback((feature: UpgradeFeatureKey) => {
    setOpenFeature(feature)
  }, [])

  const close = useCallback(() => setOpenFeature(null), [])

  const ctx = useMemo<UpgradeContextValue>(() => ({
    planName,
    activeModules,
    open,
    isUnlocked,
  }), [planName, activeModules, open, isUnlocked])

  return (
    <UpgradeContext.Provider value={ctx}>
      {children}
      {openFeature && <UpgradeModal featureKey={openFeature} onClose={close} />}
    </UpgradeContext.Provider>
  )
}

export function useUpgradeModal(): UpgradeContextValue {
  const ctx = useContext(UpgradeContext)
  if (!ctx) {
    // Fora do provider: degradação graciosa. Em vez de quebrar a UI,
    // devolve no-ops. Acontece em testes isolados ou rotas fora do
    // dashboard layout. Não loga warning — é comportamento esperado.
    return {
      planName:      'unknown',
      activeModules: [],
      open:          () => {},
      isUnlocked:    () => true,   // assume liberado: deixa o click passar
    }
  }
  return ctx
}

// ─── <UpgradeTrigger> — wrapper de click interceptor ─────────────────────────

interface TriggerProps {
  feature:   UpgradeFeatureKey
  /**
   * Quando true (default), o trigger SÓ intercepta cliques se a feature
   * não estiver liberada. Em planos pagos / módulo já ativo, o wrapper
   * é totalmente transparente (apenas devolve children, sem div extra).
   */
  children:  ReactNode
  /** Aplicado ao wrapper apenas quando o trigger está ativo (intercepta). */
  className?: string
}

export function UpgradeTrigger({ feature, children, className }: TriggerProps) {
  const { open, isUnlocked } = useUpgradeModal()

  // Plano já liberado: zero overhead. Devolve children direto, sem div extra.
  if (isUnlocked(feature)) return <>{children}</>

  // Bloqueado: embrulha em span com onCapture que para qualquer click no
  // subtree. onClickCapture roda na fase de captura, antes do handler
  // original do botão filho — então mesmo se o filho tinha onClick={...},
  // ele não dispara. Não usamos <button> wrapper porque o filho pode já
  // ser um <button>/<a> e button-dentro-de-button é HTML inválido.
  return (
    <span
      onClickCapture={e => {
        e.preventDefault()
        e.stopPropagation()
        open(feature)
      }}
      className={className}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open(feature)
        }
      }}
    >
      {children}
    </span>
  )
}
