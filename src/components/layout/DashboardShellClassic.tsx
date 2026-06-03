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
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import type { PlanName, BusinessType, UserRole } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DashboardShellProps {
  // Header
  userName:             string | null
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
  // Providers
  uiPreferences:        Record<string, unknown> | null
  aiTranscriptionMode:  string
  internacaoCompleta:   boolean
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

// ─── Layout Clássico — shell idêntico ao layout original ─────────────────────

export default function DashboardShellClassic({
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
