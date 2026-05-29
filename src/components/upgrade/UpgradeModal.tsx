'use client'

/**
 * UpgradeModal — modal de upsell in-app (Freemium 2026-05-26).
 *
 * Renderiza-se quando algum <UpgradeTrigger> dispara um featureKey via o
 * hook useUpgradeModal(). Copy é puxada do catálogo UPGRADE_FEATURES
 * abaixo, mantendo o componente reusável e a copy centralizada.
 *
 * CTAs:
 *  - Botão primário: abre WhatsApp comercial pré-formatado mencionando
 *    a feature solicitada (telemetria fácil pela mensagem).
 *  - Botão secundário: e-mail comercial idem.
 *  - Quando feature tem tourUrl: link "Ver demo de 30s" abre em nova
 *    aba (vídeo curto ou tour visual — PO preenche a URL no catálogo
 *    quando o material estiver pronto).
 */

import { X, ArrowUpRight, MessageCircle, Mail, PlayCircle, Sparkles, type LucideIcon } from 'lucide-react'
import { BedDouble, MessageSquareText, FileBarChart2, Lock, Cpu } from 'lucide-react'

// ─── Catálogo de features pagas ──────────────────────────────────────────────

export type UpgradeFeatureKey =
  | 'hospitalization'
  | 'whatsapp_intelligent'
  | 'reports_export'
  | 'continuous_flow'
  | 'pro_module'   // genérica — usada quando o gatilho vem do ModulesTab por
                   // qualquer módulo PRO. Quem chama passa override.title/pitch
                   // para substituir a copy default.

export interface UpgradeOverride {
  title?:   string
  pitch?:   string
  /** Sobrescreve a URL de demo da feature. Útil quando o gatilho é
   *  pro_module e cada módulo tem seu próprio vídeo (ex.: ModulesTab).
   *  Passe null para forçar ocultar o link mesmo que o catálogo tenha. */
  tourUrl?: string | null
}

interface FeatureMeta {
  icon:        LucideIcon
  title:       string
  /** Plano mínimo que libera o recurso — usado no headline do modal. */
  targetPlan:  string
  /** Pitch curto (1 linha) para o subtítulo. */
  pitch:       string
  /** Bullets de valor — exibidos como lista no corpo. */
  benefits:    string[]
  /** URL de vídeo demo / tour visual. Quando null OU undefined, o link
   *  "Ver demo de 30 segundos" não é renderizado. Preencher com a URL
   *  pública (Loom, Vimeo, Mux, CDN) assim que o material estiver
   *  pronto para que o link apareça automaticamente em produção. */
  tourUrl:     string | null
}

const UPGRADE_FEATURES: Record<UpgradeFeatureKey, FeatureMeta> = {
  hospitalization: {
    icon:       BedDouble,
    title:      'Internação',
    targetPlan: 'Plano Pro',
    pitch:      'Gerencie pacientes internados, controle de baias, plantão e medicação prescrita em um só lugar.',
    benefits: [
      'Painel de baias com status visual (livre, ocupada, isolamento)',
      'Prescrição com horários e checklist do plantão',
      'Histórico clínico contínuo dentro da internação',
      'Alta com checkout integrado ao Caixa',
    ],
    tourUrl: null,
  },
  whatsapp_intelligent: {
    icon:       MessageSquareText,
    title:      'WhatsApp Bot Inteligente',
    targetPlan: 'Plano Pro',
    pitch:      'Atendimento 24/7 com IA: agendamentos, confirmações e dúvidas frequentes respondidos automaticamente.',
    benefits: [
      'Confirmação automática de agendamentos no dia anterior',
      'Triagem inteligente — encaminha urgências para a recepção',
      'Mensagens segmentadas por raça, idade e histórico',
      'Handoff manual com 1 clique quando o tutor pede atendente',
    ],
    tourUrl: null,
  },
  reports_export: {
    icon:       FileBarChart2,
    title:      'Relatórios Avançados em PDF',
    targetPlan: 'Plano Pro',
    pitch:      'Exporte relatórios financeiros, operacionais e gerenciais em PDF, com sua logomarca e prontos para apresentação.',
    benefits: [
      'DRE consolidada com comparativo mês a mês',
      'Curva ABC de serviços e medicamentos',
      'Comissões por profissional com filtros',
      'Agenda diária / semanal para impressão na recepção',
    ],
    tourUrl: null,
  },
  continuous_flow: {
    icon:       Cpu,
    title:      'Fluxo Contínuo no Consultório',
    targetPlan: 'Plano Pro',
    pitch:      'Una Triagem, Consultório e Exames em uma única tela e deixe o MV ditar tudo num só áudio — a IA preenche cada módulo automaticamente.',
    benefits: [
      'Triagem incorporada ao Consultório (sinais vitais no mesmo fluxo)',
      'Exames com ditado de laudo dentro da consulta',
      'IA Unificada: 1 áudio preenche prontuário + laudo + sinais vitais',
      'Reduz cliques e tempo médio de atendimento em ~30%',
    ],
    tourUrl: null,
  },
  pro_module: {
    icon:       Lock,
    title:      'Módulo PRO',
    targetPlan: 'Plano Pro',
    pitch:      'Este módulo está disponível no Plano Pro. Fale com a Sysmax Solutions para fazer upgrade e desbloquear funcionalidades avançadas para sua clínica.',
    benefits: [
      'Funcionalidades avançadas específicas do módulo',
      'Integração total com o restante do sistema',
      'Suporte prioritário da equipe Sysmax',
      'Sem limite de usuários no plano Pro',
    ],
    tourUrl: null,
  },
}

export function getFeatureMeta(key: UpgradeFeatureKey): FeatureMeta {
  return UPGRADE_FEATURES[key]
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface Props {
  featureKey: UpgradeFeatureKey
  override?:  UpgradeOverride
  onClose:    () => void
}

const SALES_WHATSAPP = '5516997023340'  // WhatsApp comercial Sysmax Solutions
const SALES_EMAIL    = 'comercial@sysmaxsolutions.com'

export default function UpgradeModal({ featureKey, override, onClose }: Props) {
  const base = UPGRADE_FEATURES[featureKey]
  // tourUrl: override pode passar null explícito para FORÇAR ocultar — por
  // isso usamos `'tourUrl' in (override ?? {})` em vez de `??`. Sem o key
  // explícito, herda do catálogo. O render checa truthy (cobre null+undef).
  const tourUrl = (override && 'tourUrl' in override) ? override.tourUrl : base.tourUrl
  const meta = {
    ...base,
    title: override?.title ?? base.title,
    pitch: override?.pitch ?? base.pitch,
    tourUrl,
  }
  const Icon = meta.icon

  const whatsappMsg = encodeURIComponent(
    `Olá! Tenho interesse em habilitar o recurso "${meta.title}" no SysVetMax (${meta.targetPlan}). Pode me passar os detalhes?`,
  )
  const emailSubject = encodeURIComponent(`Interesse no recurso: ${meta.title}`)
  const emailBody = encodeURIComponent(
    `Olá,\n\nGostaria de conhecer melhor o recurso "${meta.title}" do SysVetMax (${meta.targetPlan}).\n\nObrigado!`,
  )

  return (
    <>
      <div
        className="fixed inset-0 z-[9950] bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[9951] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Habilitar ${meta.title}`}
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-amber-300" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                      Recurso premium · {meta.targetPlan}
                    </p>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-0.5">
                    Habilite {meta.title}
                  </h2>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="flex-shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">{meta.pitch}</p>

            <ul className="space-y-2">
              {meta.benefits.map(b => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* Renderiza só quando tourUrl é uma string não-vazia. null,
                undefined e '' são todos falsy → link fica oculto. PO
                preenche a URL no catálogo (ou via override) quando o
                Loom/Vimeo correspondente estiver pronto. */}
            {meta.tourUrl ? (
              <a
                href={meta.tourUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
              >
                <PlayCircle className="h-4 w-4" />
                Ver demo de 30 segundos
                <ArrowUpRight className="h-3 w-3 ml-auto" />
              </a>
            ) : null}
          </div>

          {/* Footer CTAs */}
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 space-y-2">
            <a
              href={`https://wa.me/${SALES_WHATSAPP}?text=${whatsappMsg}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white transition-colors shadow-md shadow-emerald-100"
            >
              <MessageCircle className="h-4 w-4" />
              Falar com o Comercial no WhatsApp
            </a>
            <a
              href={`mailto:${SALES_EMAIL}?subject=${emailSubject}&body=${emailBody}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Enviar e-mail
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-center py-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Talvez depois
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
