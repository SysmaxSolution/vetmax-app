import Link from 'next/link'
import { MessageCircle, Bot, User, ArrowRight, Megaphone, TrendingUp } from 'lucide-react'
import type { WhatsappDirectorStats } from '@/lib/actions/whatsapp-director'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeLabel(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)    return 'agora'
  if (mins < 60)   return `${mins}min atrás`
  if (mins < 1440) return `${Math.floor(mins / 60)}h atrás`
  return `${Math.floor(mins / 1440)}d atrás`
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  bot:    { label: 'Bot',    color: 'bg-blue-100 text-blue-700'   },
  human:  { label: 'Humano', color: 'bg-amber-100 text-amber-700' },
  closed: { label: 'Fechado',color: 'bg-slate-100 text-slate-500' },
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({
  label, value, color,
}: {
  label: string; value: string | number; color: 'blue' | 'amber' | 'emerald' | 'violet'
}) {
  const palette = {
    blue:    'bg-blue-50 border-blue-100 text-blue-700',
    amber:   'bg-amber-50 border-amber-100 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    violet:  'bg-violet-50 border-violet-100 text-violet-700',
  }[color]

  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border px-4 py-3 ${palette}`}>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium mt-0.5 text-center leading-tight">{label}</span>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function WhatsappDirectorPanel({ stats }: { stats: WhatsappDirectorStats }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">WhatsApp Inteligente</h3>
            <p className="text-xs text-slate-400">Monitoramento em tempo real</p>
          </div>
        </div>
        <Link
          href="/dashboard/whatsapp"
          className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
        >
          Ver atendimento
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="p-5 space-y-5">
        {/* KPI chips */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip
            label="Conversas abertas"
            value={stats.total_open}
            color="blue"
          />
          <StatChip
            label={stats.awaiting_human > 0 ? '⚠ Aguardando humano' : 'Aguardando humano'}
            value={stats.awaiting_human}
            color={stats.awaiting_human > 0 ? 'amber' : 'blue'}
          />
          <StatChip
            label="Campanhas (7 dias)"
            value={stats.campaigns_week}
            color="emerald"
          />
          <StatChip
            label="Taxa de resposta"
            value={`${stats.response_rate}%`}
            color="violet"
          />
        </div>

        {/* Conversas ativas */}
        {stats.recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
            <Bot className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">Nenhuma conversa aberta no momento</p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Conversas ativas
            </p>
            <div className="space-y-1">
              {stats.recent.map(conv => {
                const cfg = STATUS_CFG[conv.status] ?? STATUS_CFG.bot
                return (
                  <Link
                    key={conv.id}
                    href="/dashboard/whatsapp"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    {/* Avatar */}
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      conv.status === 'human' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {(conv.tutor_name ?? conv.tutor_phone).charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {conv.tutor_name ?? conv.tutor_phone}
                        </p>
                        {conv.status === 'human' && (
                          <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500">
                            <User className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                        {conv.status === 'bot' && (
                          <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
                            <Bot className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                      </div>
                      {conv.tutor_name && (
                        <p className="text-[11px] text-slate-400">{conv.tutor_phone}</p>
                      )}
                    </div>

                    {/* Status + time */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {timeLabel(conv.last_message_at)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>

            {stats.total_open > stats.recent.length && (
              <Link
                href="/dashboard/whatsapp"
                className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Ver todas as {stats.total_open} conversas
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        )}

        {/* Tip quando há handoffs pendentes */}
        {stats.awaiting_human > 0 && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <User className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {stats.awaiting_human} conversa{stats.awaiting_human !== 1 ? 's' : ''} aguardando atendimento humano
              </p>
              <Link
                href="/dashboard/whatsapp"
                className="text-xs text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
              >
                Ir para o atendimento →
              </Link>
            </div>
          </div>
        )}

        {/* Campaigns hint */}
        {stats.campaigns_week > 0 && (
          <div className="flex items-center justify-between px-3 py-2.5 bg-violet-50 border border-violet-100 rounded-xl">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-violet-600" />
              <p className="text-xs font-medium text-violet-800">
                <span className="font-bold">{stats.campaigns_week}</span> mensagens de campanha nos últimos 7 dias
              </p>
            </div>
            {stats.response_rate > 0 && (
              <div className="flex items-center gap-1 text-xs font-semibold text-violet-700">
                <TrendingUp className="h-3 w-3" />
                {stats.response_rate}%
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
