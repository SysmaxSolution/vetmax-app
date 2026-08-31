/**
 * DashboardShell — shell ÚNICO do dashboard (Design System 2026 v7).
 *
 * Decisão do Diretor (Issue #23): existe UM layout só — sidebar petrol fixa
 * à esquerda + topbar glass com o contexto da página. Substitui os antigos
 * DashboardShellClassic/DashboardShellModern (+ModernStyles).
 *
 * Server component de composição: preserva a ordem/aninhamento de providers
 * dos shells antigos e delega o chrome interativo (Sidebar + Topbar + estado
 * de colapso/drawer) ao ShellChrome (client). Diferença intencional de escopo:
 * o chrome agora fica DENTRO da cadeia de providers — no shell antigo o
 * header ficava fora do UpgradeProvider e o clique nos itens promovidos
 * "PRO" caía no fallback no-op do useUpgradeModal (nunca abria o modal).
 */

import { Suspense } from 'react'
import ShellChrome from '@/components/layout/ShellChrome'
import { WhatsAppGateProvider } from '@/components/providers/WhatsAppGateProvider'
import { ModulesProvider } from '@/components/providers/ModulesProvider'
import { ClinicConfigProvider } from '@/components/providers/ClinicConfigProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { MentorGlobalWrapper } from '@/components/mentor/MentorGlobalWrapper'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard'
import { UpgradeProvider } from '@/components/upgrade/UpgradeProvider'
import ChatNotificationsHost from '@/components/layout/ChatNotificationsHost'
import { NotificationProvider } from '@/context/NotificationContext'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import type { PlanName, BusinessType, UserRole } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DashboardShellProps {
  // Chrome (Sidebar + Topbar)
  userName:             string
  clinicName:           string
  clinicId:             string
  userRole:             UserRole
  logoUrl:              string | null
  activeModules:        string[] | null
  lowStockCount:        number
  whatsappHandoffCount: number
  chatUnreadCount:      number
  userClinics?:         UserClinicInfo[]
  isSysmax:             boolean
  clinicStatus:         string
  isSurgeryMode:        boolean
  planName:             PlanName
  allowedRoutes:        string[]
  centroCirurgico:      boolean
  /** Épico B (04/06, Q4): PDV unificado ao Caixa — esconde o item PDV do menu. */
  pdvUnified?:          boolean
  /** SaaS Fase 1 — rollout restrito: exibe link "Meu Plano" na topbar (admin). */
  subscriptionUiEnabled?: boolean
  // Providers
  uiPreferences:        Record<string, unknown> | null
  aiTranscriptionMode:  string
  internacaoCompleta:   boolean
  animaisFoundation?:   boolean
  whatsAppEnabled:      boolean
  // Onboarding
  hasLogo:              boolean
  hasPets:              boolean
  businessType:         BusinessType
  // User
  userId:               string
  // Content
  children:             React.ReactNode
}

// ─── Shell único ─────────────────────────────────────────────────────────────

export default function DashboardShell({
  userName, clinicName, clinicId, userRole, logoUrl, activeModules,
  lowStockCount, whatsappHandoffCount, chatUnreadCount, userClinics,
  isSysmax, clinicStatus, isSurgeryMode, planName, allowedRoutes, centroCirurgico,
  pdvUnified = false, subscriptionUiEnabled = false,
  uiPreferences, aiTranscriptionMode, internacaoCompleta, animaisFoundation = false, whatsAppEnabled,
  hasLogo, hasPets, businessType, userId, children,
}: DashboardShellProps) {
  return (
    <NotificationProvider clinicId={clinicId}>
      <ThemeProvider initialPreferences={uiPreferences as any}>
        <ClinicConfigProvider
          aiTranscriptionMode={aiTranscriptionMode as any}
          internacaoCompleta={internacaoCompleta}
          centroCirurgico={centroCirurgico}
          animaisFoundation={animaisFoundation}
        >
          <ModulesProvider modules={activeModules ?? []}>
            <WhatsAppGateProvider enabled={whatsAppEnabled}>
              <UpgradeProvider planName={planName} activeModules={activeModules ?? []} subscriptionUiEnabled={subscriptionUiEnabled}>
                <ShellChrome
                  userName={userName}
                  clinicName={clinicName}
                  clinicId={clinicId}
                  userRole={userRole}
                  logoUrl={logoUrl}
                  activeModules={activeModules}
                  lowStockCount={lowStockCount}
                  whatsappHandoffCount={whatsappHandoffCount}
                  chatUnreadCount={chatUnreadCount}
                  userClinics={userClinics}
                  isSysmax={isSysmax}
                  clinicStatus={clinicStatus}
                  isSurgeryMode={isSurgeryMode}
                  planName={planName}
                  allowedRoutes={allowedRoutes}
                  centroCirurgico={centroCirurgico}
                  pdvUnified={pdvUnified}
                  subscriptionUiEnabled={subscriptionUiEnabled}
                >
                  {children}
                </ShellChrome>
              </UpgradeProvider>
            </WhatsAppGateProvider>
          </ModulesProvider>
        </ClinicConfigProvider>
      </ThemeProvider>
      {!isSysmax && (
        <OnboardingWizard
          initialHasLogo={hasLogo}
          initialHasPets={hasPets}
          clinicId={clinicId}
          userRole={userRole}
          businessType={businessType}
        />
      )}
      <MentorGlobalWrapper />
      <ChatNotificationsHost clinicId={clinicId} userId={userId} />
      <Suspense fallback={null}>{null}</Suspense>
    </NotificationProvider>
  )
}
