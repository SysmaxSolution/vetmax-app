'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  GraduationCap, Play, CheckCircle2, X, Flag, Loader2, Trophy, Lock, Sparkles,
} from 'lucide-react'
import {
  getVideoSignedUrl, saveVideoProgress, getVideoQuiz, submitQuizAnswer, submitTrainingReport,
} from '@/lib/actions/training'
import {
  TRAINING_MODULES, TRAINING_CHEERS, TRAINING_QUIZ_CORRECT, TRAINING_QUIZ_WRONG,
} from '@/lib/training-modules'

type Vid = { id: string; moduleKey: string; code: string; title: string; description: string; duration: number; watchPercent: number; completed: boolean }
type UserT = { name: string; email: string; role: string }
type QuizQ = { id: string; question: string; options: string[] }

const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]

export default function TrainingAcademy({ user, videos }: { user: UserT; videos: Vid[] }) {
  const [prog, setProg] = useState<Record<string, { pct: number; done: boolean }>>(
    () => Object.fromEntries(videos.map(v => [v.id, { pct: v.watchPercent, done: v.completed }])),
  )
  const [filter, setFilter] = useState<string>('all')
  const [active, setActive] = useState<Vid | null>(null)
  const [reportFor, setReportFor] = useState<Vid | 'general' | null>(null)

  const modules = useMemo(() => {
    const present = TRAINING_MODULES.filter(m => videos.some(v => v.moduleKey === m.key))
    return present.map(m => {
      const vids = videos.filter(v => v.moduleKey === m.key).sort((a, b) => (+a.code.replace(/\D/g, '')) - (+b.code.replace(/\D/g, '')))
      const done = vids.filter(v => prog[v.id]?.done).length
      return { ...m, vids, done, total: vids.length, percent: vids.length ? Math.round((done / vids.length) * 100) : 0 }
    })
  }, [videos, prog])

  const totalDone = useMemo(() => Object.values(prog).filter(p => p.done).length, [prog])
  const overall = videos.length ? Math.round((totalDone / videos.length) * 100) : 0

  const onProgress = useCallback((id: string, pct: number, done: boolean) => {
    setProg(p => ({ ...p, [id]: { pct: Math.max(pct, p[id]?.pct ?? 0), done: done || p[id]?.done || false } }))
  }, [])

  const shownModules = filter === 'all' ? modules : modules.filter(m => m.key === filter)

  return (
    <div className="space-y-6">
      {/* Cabeçalho + progresso geral */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6 shadow-sm flex flex-col sm:flex-row items-center gap-6">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center"><GraduationCap className="w-7 h-7" /></div>
          <div>
            <h1 className="text-xl font-bold">Academia SYSVETMAX</h1>
            <p className="text-teal-100 text-sm">Olá, {user.name.split(' ')[0]}! {overall === 100 ? 'Você concluiu todo o treinamento. 🏆' : 'Aprenda o sistema no seu ritmo, aula por aula.'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Ring value={overall} size={64} stroke={7} light />
          <div className="text-sm">
            <div className="font-bold text-lg">{totalDone} <span className="font-normal text-teal-100">de {videos.length} aulas</span></div>
            <div className="text-teal-100">concluídas</div>
          </div>
        </div>
      </div>

      {/* Filtro por módulo */}
      <div className="flex gap-2 flex-wrap">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Todos <span className="opacity-60">{videos.length}</span></Chip>
        {modules.map(m => (
          <Chip key={m.key} active={filter === m.key} onClick={() => setFilter(m.key)}>
            {m.icon} {m.name} <span className="opacity-60">{m.done}/{m.total}</span>
          </Chip>
        ))}
      </div>

      {/* Seções por módulo */}
      {shownModules.map(m => (
        <section key={m.key} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center text-lg">{m.icon}</div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{m.name}</h2>
            <div className="flex-1 max-w-[240px] h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${m.percent}%` }} />
            </div>
            <span className="text-xs font-semibold text-slate-500">{m.percent}%</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {m.vids.map(v => {
              const p = prog[v.id] || { pct: 0, done: false }
              return (
                <button key={v.id} onClick={() => setActive(v)}
                  className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition group">
                  <div className="aspect-video bg-gradient-to-br from-teal-600/90 to-teal-800 flex items-center justify-center relative">
                    <div className="w-14 h-14 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center transition">
                      <Play className="w-7 h-7 text-white ml-1" fill="white" />
                    </div>
                    {p.done && <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1"><CheckCircle2 className="w-4 h-4" /></div>}
                    {!p.done && p.pct > 0 && <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/20"><div className="h-full bg-teal-300" style={{ width: `${p.pct}%` }} /></div>}
                    <span className="absolute top-2 left-2 text-[10px] font-bold text-white/90 bg-black/25 px-1.5 py-0.5 rounded">{v.code.toUpperCase()}</span>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{v.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{v.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {active && (
        <PlayerModal
          key={active.id}
          video={active}
          user={user}
          onClose={() => setActive(null)}
          onProgress={onProgress}
          onReport={() => setReportFor(active)}
        />
      )}
      {reportFor && (
        <ReportModal
          video={reportFor === 'general' ? null : reportFor}
          onClose={() => setReportFor(null)}
        />
      )}

      {/* Botão flutuante: pedir vídeo */}
      {!active && !reportFor && (
        <button onClick={() => setReportFor('general')}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-slate-800 text-white text-sm font-semibold shadow-lg hover:bg-slate-700">
          <Flag className="w-4 h-4" /> Pedir vídeo / Reportar
        </button>
      )}
    </div>
  )
}

// ── Player com marca d'água + rastreio + quiz ────────────────────────────────
function PlayerModal({ video, user, onClose, onProgress, onReport }: {
  video: Vid; user: UserT; onClose: () => void; onProgress: (id: string, pct: number, done: boolean) => void; onReport: () => void
}) {
  const vref = useRef<HTMLVideoElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(video.completed)
  const [cheer, setCheer] = useState<string | null>(null)
  const [wm, setWm] = useState({ top: 12, left: 12 })
  const lastSave = useRef(0)
  const [quiz, setQuiz] = useState<QuizQ[] | null>(null)

  const loadUrl = useCallback(async () => {
    setErr(null)
    const r = await getVideoSignedUrl(video.id)
    if ('error' in r) { setErr(r.error); return }
    setUrl(r.url)
  }, [video.id])

  useEffect(() => { loadUrl() }, [loadUrl])

  // marca d'água se move a cada 5s (dificulta recorte)
  useEffect(() => {
    const t = setInterval(() => setWm({ top: 8 + Math.random() * 78, left: 6 + Math.random() * 66 }), 5000)
    return () => clearInterval(t)
  }, [])

  const handleTime = () => {
    const v = vref.current; if (!v || !v.duration) return
    const pct = Math.round((v.currentTime / v.duration) * 100)
    onProgress(video.id, pct, false)
    const now = Date.now()
    if (now - lastSave.current > 10000) { lastSave.current = now; saveVideoProgress(video.id, v.currentTime, pct) }
  }
  const handleEnded = async () => {
    const v = vref.current
    onProgress(video.id, 100, true); setDone(true); setCheer(pick(TRAINING_CHEERS))
    await saveVideoProgress(video.id, v?.duration ?? 0, 100)
    const q = await getVideoQuiz(video.id)
    if (!('error' in q) && q.questions.length) setQuiz(q.questions)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold text-teal-600">{video.code.toUpperCase()}</span>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm flex-1 truncate">{video.title}</h2>
          <button onClick={onReport} title="Reportar / pedir vídeo" className="text-slate-400 hover:text-amber-600 p-1"><Flag className="w-5 h-5" /></button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="relative bg-black" style={{ aspectRatio: '16/10' }} onContextMenu={e => e.preventDefault()}>
          {url ? (
            <video ref={vref} src={url} controls autoPlay playsInline
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              onTimeUpdate={handleTime} onEnded={handleEnded}
              onError={() => loadUrl()}
              className="w-full h-full" />
          ) : err ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
              <Lock className="w-8 h-8 opacity-70" /><p className="text-sm">{err}</p>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>
          )}
          {/* marca d'água — identifica o usuário, inibe redistribuição */}
          <div className="pointer-events-none absolute text-white/25 text-[11px] font-semibold select-none transition-all duration-1000"
            style={{ top: `${wm.top}%`, left: `${wm.left}%`, textShadow: '0 1px 2px rgba(0,0,0,.4)' }}>
            {user.email || user.name} · SYSVETMAX
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{video.description}</p>

          {cheer && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-4 py-3 text-sm font-medium">
              <Trophy className="w-5 h-5 flex-shrink-0" /> {cheer}
            </div>
          )}

          {done && quiz === null && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Aula concluída. Esta aula ainda não tem quiz de reforço.</p>
          )}
          {quiz && quiz.length > 0 && <Quiz videoId={video.id} questions={quiz} />}

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Conteúdo protegido — identificado por marca d'água.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Quiz de reforço ──────────────────────────────────────────────────────────
function Quiz({ videoId, questions }: { videoId: string; questions: QuizQ[] }) {
  const [idx, setIdx] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [result, setResult] = useState<{ correct: boolean; correctIndex: number; explanation: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const q = questions[idx]
  const finished = idx >= questions.length

  async function answer(i: number) {
    if (result || busy) return
    setChosen(i); setBusy(true)
    const r = await submitQuizAnswer(videoId, q.id, i)
    setBusy(false)
    if (!('error' in r)) setResult(r)
  }
  function next() { setIdx(i => i + 1); setChosen(null); setResult(null) }

  if (finished) {
    return (
      <div className="rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 px-4 py-3 text-sm text-teal-700 dark:text-teal-300 font-medium flex items-center gap-2">
        <Trophy className="w-5 h-5" /> Quiz concluído! Você reforçou o que aprendeu nesta aula. 🎉
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-teal-600 uppercase tracking-wide">Quiz de reforço</span>
        <span className="text-xs text-slate-400">{idx + 1} / {questions.length}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{q.question}</p>
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isChosen = chosen === i
          let cls = 'border-slate-200 dark:border-slate-700 hover:border-teal-400'
          if (result) {
            if (i === result.correctIndex) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
            else if (isChosen) cls = 'border-red-400 bg-red-50 dark:bg-red-500/10'
            else cls = 'border-slate-200 dark:border-slate-700 opacity-60'
          }
          return (
            <button key={i} disabled={!!result || busy} onClick={() => answer(i)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition ${cls}`}>
              {opt}
            </button>
          )
        })}
      </div>
      {result && (
        <div className={`text-sm px-3 py-2 rounded-lg font-medium ${result.correct ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
          {result.correct ? pick(TRAINING_QUIZ_CORRECT) : TRAINING_QUIZ_WRONG}
          {result.explanation && <div className="text-slate-500 dark:text-slate-400 mt-1 font-normal">{result.explanation}</div>}
          <button onClick={next} className="mt-2 text-teal-600 font-semibold text-sm hover:underline">
            {idx + 1 < questions.length ? 'Próxima pergunta →' : 'Concluir quiz →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Report / pedido de vídeo ─────────────────────────────────────────────────
function ReportModal({ video, onClose }: { video: Vid | null; onClose: () => void }) {
  const [type, setType] = useState<'request' | 'bug'>(video ? 'bug' : 'request')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  async function submit() {
    if (!msg.trim() || busy) return
    setBusy(true)
    const r = await submitTrainingReport(type, msg, video?.id, video?.moduleKey)
    setBusy(false)
    if (!('error' in r)) setOk(true)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Flag className="w-5 h-5 text-amber-500" /> Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        {ok ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-300">Recebemos seu report! Obrigado por ajudar a melhorar o treinamento. 💚</p>
            <button onClick={onClose} className="mt-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold">Fechar</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setType('request')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium ${type === 'request' ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300' : 'border-slate-200 dark:border-slate-700'}`}>Pedir um vídeo</button>
              <button onClick={() => setType('bug')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium ${type === 'bug' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700'}`}>Relatar problema</button>
            </div>
            <p className="text-xs text-slate-500">{video ? <>Sobre a aula <b>{video.code.toUpperCase()} — {video.title}</b>.</> : type === 'request' ? 'Qual rotina você gostaria de ver em vídeo?' : 'Descreva o problema encontrado.'}</p>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} autoFocus
              placeholder={type === 'request' ? 'Ex.: um vídeo sobre como fazer o fechamento de caixa por operador…' : 'Ex.: a narração fala da tela X, mas o vídeo mostra a tela Y…'}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-teal-500" />
            <button onClick={submit} disabled={busy || !msg.trim()} className="w-full py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enviar report
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Utilitários visuais ──────────────────────────────────────────────────────
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap border transition ${active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-teal-400 hover:text-teal-600'}`}>{children}</button>
  )
}
function Ring({ value, size = 56, stroke = 6, light = false }: { value: number; size?: number; stroke?: number; light?: boolean }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (value / 100) * c
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={light ? 'stroke-white/25' : 'stroke-slate-200'} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className={light ? 'stroke-white' : 'stroke-teal-500'} strokeDasharray={c} strokeDashoffset={off} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={`rotate-90 origin-center text-[13px] font-bold ${light ? 'fill-white' : 'fill-slate-700'}`}>{value}%</text>
    </svg>
  )
}
