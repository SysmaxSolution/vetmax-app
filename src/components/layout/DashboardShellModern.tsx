/**
 * Layout Moderno — shell com design system próprio.
 *
 * Toda a diferenciação visual fica em:
 *   1. data-layout="modern"  → atributo raiz para escopo de CSS
 *   2. ModernStyles           → estilos injetados, escopo isolado
 *
 * O DashboardHeader e providers são OS MESMOS do Classic —
 * a diferença é puramente visual via CSS. Nunca altere o Classic.
 */
import { Suspense } from 'react'
import DashboardHeader from '@/components/layout/DashboardHeader'
import { WhatsAppGateProvider } from '@/components/providers/WhatsAppGateProvider'
import { ModulesProvider } from '@/components/providers/ModulesProvider'
import { ClinicConfigProvider } from '@/components/providers/ClinicConfigProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { MentorGlobalWrapper } from '@/components/mentor/MentorGlobalWrapper'
import { SysmaxFooter } from '@/components/ui/SysmaxFooter'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard'
import { UpgradeProvider } from '@/components/upgrade/UpgradeProvider'
import ChatNotificationsHost from '@/components/layout/ChatNotificationsHost'
import ModernStyles from '@/components/layout/ModernStyles'
import type { DashboardShellProps } from './DashboardShellClassic'

// ─── Layout Moderno ───────────────────────────────────────────────────────────

export default function DashboardShellModern({
  userName, clinicName, clinicId, userRole, logoUrl, activeModules,
  lowStockCount, whatsappHandoffCount, chatUnreadCount, userClinics,
  isSysmax, clinicStatus, isSurgeryMode, planName, allowedRoutes, centroCirurgico,
  pdvUnified = false, subscriptionUiEnabled = false,
  uiPreferences, aiTranscriptionMode, internacaoCompleta, whatsAppEnabled,
  hasLogo, hasPets, businessType, userId, children,
}: DashboardShellProps) {
  return (
    // data-layout="modern" é a âncora de todos os estilos do ModernStyles.
    // Remover este atributo desativa o design system Modern imediatamente.
    <section data-layout="modern" className="min-h-screen bg-slate-50">

      {/* Injeta o design system Modern — não afeta o Classic */}
      <ModernStyles />

      <DashboardHeader
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
      />

      <ThemeProvider initialPreferences={uiPreferences as any}>
        <ClinicConfigProvider
          aiTranscriptionMode={aiTranscriptionMode as any}
          internacaoCompleta={internacaoCompleta}
          centroCirurgico={centroCirurgico}
        >
          <ModulesProvider modules={activeModules ?? []}>
            <WhatsAppGateProvider enabled={whatsAppEnabled}>
              <UpgradeProvider planName={planName} activeModules={activeModules ?? []} subscriptionUiEnabled={subscriptionUiEnabled}>
                {children}
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
      <SysmaxFooter />
    </section>
  )
}
