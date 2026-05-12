'use client'

import { useEffect, useRef } from 'react'
import { X, CheckCircle2, XCircle, Activity, RefreshCw, GitBranch } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FixPlan = {
  id: string
  title: string
  priority: 'P0' | 'P1' | 'P2'
  status: string
  affected_modules: string[]
  error_summary: string | null
  description_md: string | null
  branch_name: string | null
  pr_url: string | null
  created_at: string
  approved_at: string | null
}

interface FixPlanSlideOverProps {
  plan:      FixPlan | null
  actionId:  string | null
  onClose:   () => void
  onApprove: (planId: string) => void
  onReject:  (planId: string) => void
}

const P_BADGE: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 border border-red-300 font-bold',
  P1: 'bg-orange-100 text-orange-700 border border-orange-200 font-semibold',
  P2: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
}

// ─── Slide-over ───────────────────────────────────────────────────────────────

export default function FixPlanSlideOver({ plan, actionId, onClose, onApprove, onReject }: FixPlanSlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Fecha ao pressionar Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isOpen  = plan !== null
  const isBusy  = actionId === plan?.id
  const isPending = plan?.status === 'pending_approval'

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl
          flex flex-col transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {plan && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${P_BADGE[plan.priority] ?? ''}`}>
                    {plan.priority}
                  </span>
                  {plan.affected_modules.map(m => (
                    <span key={m} className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">{m}</span>
                  ))}
                </div>
                <h2 className="text-base font-semibold text-slate-900 leading-snug">{plan.title}</h2>
                {plan.error_summary && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{plan.error_summary}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action bar */}
            {isPending && (
              <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 shrink-0">
                <Activity className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="flex-1 text-xs text-amber-700">
                  <span className="font-semibold">Aguardando decisão:</span> ao aprovar, este plano entra na fila da Mozart Routine para correção autônoma (Sprint G-07-E). Um PR será aberto e nunca será mergeado diretamente na <code className="font-mono bg-amber-100 px-1 rounded">main</code>.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => onReject(plan.id)}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Rejeitar
                  </button>
                  <button
                    onClick={() => onApprove(plan.id)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {isBusy
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <CheckCircle2 className="w-3.5 h-3.5" />
                    }
                    Aprovar Plano
                  </button>
                </div>
              </div>
            )}

            {/* PR info */}
            {plan.pr_url && (
              <div className="flex items-center gap-2 px-6 py-2.5 bg-indigo-50 border-b border-indigo-100 shrink-0">
                <GitBranch className="w-4 h-4 text-indigo-600 shrink-0" />
                <p className="text-xs text-indigo-700 flex-1">
                  Correção aplicada em <code className="font-mono bg-indigo-100 px-1 rounded">{plan.branch_name}</code>
                </p>
                <a href={plan.pr_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-600 font-semibold hover:underline shrink-0">
                  Ver PR →
                </a>
              </div>
            )}

            {/* Markdown body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {plan.description_md
                ? <MarkdownRenderer md={plan.description_md} />
                : <p className="text-sm text-slate-400 italic">Descrição técnica não disponível.</p>
              }
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────
// Parser leve sem dependências externas. Suporta os padrões gerados pelo Claude:
// h1/h2/h3, listas, blocos de código, código inline, negrito, itálico, tabelas, ---

function parseInline(text: string): React.ReactNode {
  // Divide em tokens: **bold**, *italic*, `code`, restante
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))

    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-slate-900">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic text-slate-700">{match[3]}</em>)
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="font-mono text-xs bg-slate-100 text-rose-700 px-1.5 py-0.5 rounded border border-slate-200">
          {match[4]}
        </code>
      )
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function MarkdownRenderer({ md }: { md: string }) {
  const lines   = md.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trimEnd()

    // ── Code block ──────────────────────────────────────────────────────────
    if (line.startsWith('```')) {
      const lang    = line.slice(3).trim() || 'text'
      const codeArr: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeArr.push(lines[i])
        i++
      }
      nodes.push(
        <div key={`cb-${i}`} className="my-3 rounded-xl overflow-hidden border border-slate-200">
          <div className="flex items-center justify-between bg-slate-800 px-4 py-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase">{lang}</span>
          </div>
          <pre className="bg-slate-900 text-slate-100 text-xs font-mono px-4 py-3 overflow-x-auto leading-relaxed">
            <code>{codeArr.join('\n')}</code>
          </pre>
        </div>
      )
      i++
      continue
    }

    // ── Heading 1 ────────────────────────────────────────────────────────────
    if (/^# /.test(line)) {
      nodes.push(
        <h1 key={i} className="text-lg font-bold text-slate-900 mt-5 mb-2 first:mt-0">
          {parseInline(line.slice(2))}
        </h1>
      )
      i++; continue
    }

    // ── Heading 2 ────────────────────────────────────────────────────────────
    if (/^## /.test(line)) {
      nodes.push(
        <h2 key={i} className="text-sm font-bold text-slate-800 mt-5 mb-2 pb-1 border-b border-slate-100">
          {parseInline(line.slice(3))}
        </h2>
      )
      i++; continue
    }

    // ── Heading 3 ────────────────────────────────────────────────────────────
    if (/^### /.test(line)) {
      nodes.push(
        <h3 key={i} className="text-sm font-semibold text-slate-700 mt-3 mb-1">
          {parseInline(line.slice(4))}
        </h3>
      )
      i++; continue
    }

    // ── Horizontal rule ───────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={i} className="my-4 border-slate-200" />)
      i++; continue
    }

    // ── Table ────────────────────────────────────────────────────────────────
    if (line.startsWith('|')) {
      const tableRows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableRows.push(lines[i])
        i++
      }
      // Filtra linha de separação |---|---|
      const dataRows = tableRows.filter(r => !r.match(/^\|[-| :]+\|$/))
      nodes.push(
        <div key={`tbl-${i}`} className="my-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <tbody>
              {dataRows.map((row, ri) => {
                const cells = row.split('|').slice(1, -1)
                return (
                  <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-semibold' : 'border-t border-slate-100 hover:bg-slate-50'}>
                    {cells.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-slate-700 align-top">
                        {parseInline(cell.trim())}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // ── Unordered list ────────────────────────────────────────────────────────
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1 pl-4">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-slate-700 flex gap-2">
              <span className="text-slate-400 shrink-0 mt-0.5">•</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // ── Ordered list ──────────────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      let num = 1
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++; num++
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1.5 pl-4">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-slate-700 flex gap-2.5">
              <span className="shrink-0 font-mono text-xs bg-slate-800 text-white rounded w-5 h-5 flex items-center justify-center mt-0.5">{idx + 1}</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // ── Blank line ────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      i++; continue
    }

    // ── Paragraph ────────────────────────────────────────────────────────────
    nodes.push(
      <p key={i} className="text-sm text-slate-700 leading-relaxed my-1.5">
        {parseInline(line)}
      </p>
    )
    i++
  }

  return <div className="prose-like">{nodes}</div>
}
