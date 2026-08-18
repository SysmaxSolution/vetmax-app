// ─── Navegação do dashboard — fonte única de verdade ─────────────────────────
// Lista de módulos + regras de visibilidade/lock usadas pelo shell (Sidebar,
// Topbar e drawer mobile). Módulo puro (sem 'use server'/'use client') para
// poder ser importado de server e client components.

import {
  Home, Stethoscope, TestTubes, Users, BarChart3, PawPrint,
  BedDouble, Package, Scissors, Banknote, FolderKanban, MessageCircle,
  MessageSquare, ShoppingCart, ClipboardList, DollarSign, FileBarChart2,
  FileText, Syringe,
} from 'lucide-react'
import type { UserRole } from '@/types'
import type { UpgradeFeatureKey } from '@/components/upgrade/UpgradeModal'

/**
 * Módulos que, em vez de simplesmente sumirem do menu para clínicas Free,
 * aparecem como item "promovido" — cinza com Lock e "PRO", e o clique
 * abre o UpgradeModal. Mantém-se o gatilho de upsell visível no menu
 * para features estratégicas, sem poluir com todos os módulos pagos.
 *
 * Por design — qualquer moduleKey AUSENTE desse mapa segue a regra antiga
 * (some do menu se não estiver em activeModules).
 */
export const PROMOTED_LOCKED_FEATURES: Record<string, UpgradeFeatureKey> = {
  hospitalization:      'hospitalization',
  surgery:              'surgery',
  triage:               'triage',
  exams:                'exams',
  financial:            'financial',
  pharmacy:             'pharmacy',
  purchases:            'purchases',
  sales:                'sales',
  whatsapp_intelligent: 'whatsapp_intelligent',
  internal_chat:        'internal_chat',
}

export interface NavLink {
  label:      string
  href:       string
  icon:       React.ComponentType<{ className?: string }>
  /** Documentação do default original — NÃO filtra mais (decisão PO 2026-05-22). */
  roles:      UserRole[]
  moduleKey?: string
  id?:        string
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Recepção',     href: '/dashboard/reception',       icon: Home,          roles: ['receptionist','admin','vet','assistant'], moduleKey: 'reception'       },
  { label: 'Pacientes',    href: '/dashboard/patients',        icon: PawPrint,      roles: ['receptionist','admin','vet','assistant'], moduleKey: 'patients'        },
  { label: 'Caixa',        href: '/dashboard/cashier',         icon: Banknote,      roles: ['admin','accountant' as UserRole],         moduleKey: 'cashier',        id: 'nav-cashier' },
  { label: 'Triagem',      href: '/dashboard/triage',          icon: Users,         roles: ['assistant','admin'],                      moduleKey: 'triage'          },
  { label: 'Consultório',  href: '/dashboard/vet',             icon: Stethoscope,   roles: ['vet','admin'],                            moduleKey: 'consultation'    },
  { label: 'Exames',       href: '/dashboard/exams',           icon: TestTubes,     roles: ['assistant','vet','admin'],                moduleKey: 'exams'           },
  { label: 'Internação',   href: '/dashboard/hospitalization', icon: BedDouble,     roles: ['vet','admin','assistant'],                moduleKey: 'hospitalization' },
  { label: 'Centro Cirúrgico', href: '/dashboard/surgery',     icon: Syringe,       roles: ['vet','admin','assistant'],                moduleKey: 'surgery'         },
  { label: 'Banho e Tosa', href: '/dashboard/grooming',        icon: Scissors,      roles: ['receptionist','admin','assistant'],       moduleKey: 'grooming'        },
  { label: 'Cadastros',    href: '/dashboard/registry',        icon: FolderKanban,  roles: ['admin','accountant' as UserRole,'receptionist'], moduleKey: 'registry' },
  { label: 'Compras',      href: '/dashboard/purchases',       icon: ClipboardList, roles: ['admin'],                                  moduleKey: 'purchases'       },
  { label: 'Estoque',      href: '/dashboard/pharmacy',        icon: Package,       roles: ['admin'],                                  moduleKey: 'pharmacy'        },
  { label: 'Vendas',       href: '/dashboard/sales',           icon: ShoppingCart,  roles: ['receptionist','admin','assistant'],       moduleKey: 'sales'           },
  { label: 'Financeiro',   href: '/dashboard/financial',       icon: DollarSign,    roles: ['admin'],                                  moduleKey: 'financial'       },
  { label: 'Faturamento',  href: '/dashboard/billing',         icon: FileText,      roles: ['admin','receptionist','vet','assistant'], moduleKey: 'billing'         },
  { label: 'Relatórios',   href: '/dashboard/reports',         icon: FileBarChart2, roles: ['admin'],                                  moduleKey: 'reports'         },
  { label: 'Gestão',       href: '/dashboard/management',      icon: BarChart3,     roles: ['admin']                                                                },
  { label: 'WhatsApp',     href: '/dashboard/whatsapp',        icon: MessageCircle, roles: ['receptionist','admin','vet','assistant'], moduleKey: 'whatsapp_intelligent' },
  { label: 'Chat Interno', href: '/dashboard/internal-chat',   icon: MessageSquare, roles: ['receptionist','admin','vet','assistant'], moduleKey: 'internal_chat' },
]

// ─── Regras de visibilidade/lock ─────────────────────────────────────────────

export interface NavContext {
  userRole:        UserRole
  activeModules:   string[] | null
  planName:        string
  allowedRoutes:   string[]
  isSysmax:        boolean
  centroCirurgico: boolean
  pdvUnified:      boolean
}

/**
 * Decisão de design (2026-05-22, requisito do PO): a exibição do menu
 * depende EXCLUSIVAMENTE de user_module_access (configurado em Gestão >
 * Usuários > Direitos de Acesso). Sem fallback de role — se o admin não
 * bloqueou explicitamente um módulo ativo da clínica para esse usuário, ele
 * vê. O array `roles` é mantido na declaração como documentação do default
 * original, mas não filtra mais.
 */
export function getVisibleNavLinks(ctx: NavContext): NavLink[] {
  return NAV_LINKS.filter(link => {
    // Gestão é exclusiva de admin (controle de plataforma — não faz sentido
    // delegar via user_module_access). Mantemos apenas esse caso especial.
    if (link.href === '/dashboard/management' && ctx.userRole !== 'admin') return false
    // Centro Cirúrgico é gated pela feature flag flow_config.centro_cirurgico,
    // não por active_modules — só aparece quando a clínica o ativou.
    if (link.href === '/dashboard/surgery') return ctx.centroCirurgico
    // Épico B (04/06, Q4): PDV unificado ao Caixa — módulo some do menu;
    // a venda avulsa vive em Caixa > Recebimentos.
    if (link.href === '/dashboard/sales' && ctx.pdvUnified) return false
    if (link.moduleKey && ctx.activeModules) {
      // PROMOTED_LOCKED só "promove" itens fora do active_modules no plano FREE
      // (gatilho de upsell). Clientes Pro/Enterprise/SysMax seguem a regra
      // clássica: só vêem módulos efetivamente ativados em active_modules.
      if (ctx.planName === 'free' && !ctx.isSysmax && PROMOTED_LOCKED_FEATURES[link.moduleKey]) return true
      return ctx.activeModules.includes(link.moduleKey)
    }
    return true
  })
}

/**
 * Retorna a feature key de upgrade quando o item é "promoted-locked",
 * ou null quando o clique deve navegar normalmente.
 * Um item é "promoted-locked" quando: (a) moduleKey ∈ PROMOTED_LOCKED_FEATURES
 * E (b) o módulo NÃO está em activeModules (Free real).
 */
export function getPromotedLockKey(link: NavLink, ctx: NavContext): UpgradeFeatureKey | null {
  if (!link.moduleKey) return null
  // Lock visual + UpgradeModal NUNCA aparece para planos pagos ou SysMax.
  if (ctx.planName !== 'free' || ctx.isSysmax) return null
  const key = PROMOTED_LOCKED_FEATURES[link.moduleKey]
  if (!key) return null
  if (ctx.activeModules?.includes(link.moduleKey)) return null
  return key
}

/** PLG Default-Deny: rota bloqueada = plano Free + rota fora da lista branca. */
export function isRouteLocked(href: string, ctx: NavContext): boolean {
  if (ctx.planName !== 'free' || ctx.isSysmax) return false
  return !ctx.allowedRoutes.some(r =>
    href === r || (r !== '/dashboard' && href.startsWith(r))
  )
}

export interface NavBadgeCounts {
  lowStockCount:        number
  whatsappHandoffCount: number
  chatUnreadCount:      number
}

/** Badges de contagem por item (estoque baixo, WhatsApp, chat não lido). */
export function getNavBadgeCount(href: string, counts: NavBadgeCounts): number {
  switch (href) {
    case '/dashboard/pharmacy':      return counts.lowStockCount
    case '/dashboard/whatsapp':      return counts.whatsappHandoffCount
    case '/dashboard/internal-chat': return counts.chatUnreadCount
    default:                         return 0
  }
}
