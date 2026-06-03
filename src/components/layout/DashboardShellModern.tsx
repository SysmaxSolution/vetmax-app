/**
 * Layout Moderno — réplica inicial do layout Clássico.
 *
 * Este componente é uma cópia fiel do DashboardShellClassic e serve como
 * ponto de partida para evoluções visuais do layout sem risco de regressão
 * no layout atual. Altere apenas este arquivo ao desenvolver o layout Moderno.
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
import type { DashboardShellProps } from './DashboardShellClassic'

// ─── Layout Moderno ───────────────────────────────────────────────────────────

export default function DashboardShellModern({
  userName, clinicName, clinicId, userRole, logoUrl, activeModules,
  lowStockCount, whatsappHandoffCount, chatUnreadCount, userClinics,
  isSysmax, clinicStatus, isSurgeryMode, planName, allowedRoutes, centroCirurgico,
  uiPreferences, aiTranscriptionMode, internacaoCompleta, whatsAppEnabled,
  hasLogo, hasPets, businessType, userId, children,
}: DashboardShellProps) {
  return (
    <section className="min-h-screen bg-slate-50">
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
      />
      <ThemeProvider initialPreferences={uiPreferences as any}>
        <ClinicConfigProvider
          aiTranscriptionMode={aiTranscriptionMode as any}
          internacaoCompleta={internacaoCompleta}
          centroCirurgico={centroCirurgico}
        >
          <ModulesProvider modules={activeModules ?? []}>
            <WhatsAppGateProvider enabled={whatsAppEnabled}>
              <UpgradeProvider planName={planName} activeModules={activeModules ?? []}>
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
