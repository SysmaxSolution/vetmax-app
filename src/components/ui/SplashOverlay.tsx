'use client'

import { useEffect, useState } from 'react'

// ──────────────────────────────────────────────────────────────────────────────
// SplashOverlay — animação de entrada exibida UMA vez por sessão do navegador
// (ou cada vez que o app nativo Capacitor abre).
//
// Mostra a marca SysVetMax com as 2 patinhas, gradiente teal, e desaparece
// suavemente após 1.8s. Inspirado em Nubank/Mercado Pago.
//
// Mecanismo: chave em sessionStorage controla "primeira vez nesta sessão".
// Em apps Capacitor, sessionStorage também é limpa entre execuções → splash
// sempre aparece ao abrir o app.
// ──────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'vetmax:splash-shown'
const DURATION_MS = 1800

export function SplashOverlay() {
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden')

  useEffect(() => {
    // Se já apareceu nesta sessão, não mostra de novo (evita splash em cada
    // troca de rota client-side dentro do dashboard).
    if (typeof window === 'undefined') return
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch { /* sessionStorage não disponível, segue */ }

    setPhase('visible')
    const tFade = setTimeout(() => setPhase('fading'), DURATION_MS - 350)
    const tDone = setTimeout(() => setPhase('hidden'), DURATION_MS)
    return () => { clearTimeout(tFade); clearTimeout(tDone) }
  }, [])

  if (phase === 'hidden') return null

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{
        opacity: phase === 'fading' ? 0 : 1,
        transition: 'opacity 350ms ease-out',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 30% 20%, rgba(74,222,128,0.30) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(37,99,235,0.28) 0%, transparent 50%),
            linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)
          `,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="splash-logo-wrap mx-auto mb-6">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="h-28 w-28 md:h-32 md:w-32">
              <defs>
                <linearGradient id="splash-paw" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stopColor="#86EFAC"/>
                  <stop offset="100%" stopColor="#22C55E"/>
                </linearGradient>
                <linearGradient id="splash-ecg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#60A5FA"/>
                  <stop offset="100%" stopColor="#2563EB"/>
                </linearGradient>
              </defs>
              <g>
                <ellipse cx="27" cy="32" rx="10" ry="13" fill="url(#splash-paw)" transform="rotate(-18 27 32)"/>
                <ellipse cx="44" cy="23" rx="10" ry="13" fill="url(#splash-paw)" transform="rotate(-6 44 23)"/>
                <ellipse cx="61" cy="23" rx="10" ry="13" fill="url(#splash-paw)" transform="rotate(6 61 23)"/>
                <ellipse cx="78" cy="32" rx="10" ry="13" fill="url(#splash-paw)" transform="rotate(18 78 32)"/>
                <ellipse cx="52" cy="67" rx="28" ry="23" fill="url(#splash-paw)"/>
              </g>
              <path d="M 4 60 L 26 60 L 30 56 L 34 62 L 38 60 L 41 56 L 45 28 L 50 82 L 55 48 L 60 62 L 64 60 L 80 60 L 84 50 L 92 50"
                    stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.95"/>
              <path d="M 4 60 L 26 60 L 30 56 L 34 62 L 38 60 L 41 56 L 45 28 L 50 82 L 55 48 L 60 62 L 64 60 L 80 60 L 84 50 L 92 50"
                    stroke="url(#splash-ecg)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M 88 54 L 94 48 L 88 42 M 94 48 L 84 48"
                    stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.95"/>
              <path d="M 88 54 L 94 48 L 88 42 M 94 48 L 84 48"
                    stroke="url(#splash-ecg)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="splash-title text-2xl md:text-3xl font-bold tracking-wide"
               style={{
                 background: 'linear-gradient(90deg, #86efac, #ffffff)',
                 WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
               }}>
            SysVetMax
          </div>
          <div className="splash-tag mt-1.5 text-[11px] md:text-xs uppercase tracking-[0.18em] text-emerald-300">
            Cuidando do seu pet
          </div>
          <div className="splash-progress mt-7 mx-auto" />
        </div>
      </div>

      <style jsx>{`
        .splash-logo-wrap {
          animation: splash-pop 0.7s cubic-bezier(.34,1.56,.64,1) both,
                     splash-float 3.5s ease-in-out 0.7s infinite;
          filter: drop-shadow(0 12px 28px rgba(34,197,94,0.45));
        }
        .splash-title  { opacity: 0; transform: translateY(8px); animation: splash-rise 0.6s ease-out 0.35s forwards; }
        .splash-tag    { opacity: 0; transform: translateY(8px); animation: splash-rise 0.6s ease-out 0.55s forwards; }
        .splash-progress {
          width: 140px; height: 3px; border-radius: 3px;
          background: rgba(134,239,172,0.20);
          overflow: hidden; position: relative;
        }
        .splash-progress::after {
          content: ''; position: absolute; left: -40%; top: 0; height: 100%; width: 40%;
          background: linear-gradient(90deg, transparent, #86efac, transparent);
          animation: splash-slide 1.4s ease-in-out infinite;
        }
        @keyframes splash-pop {
          0%   { transform: scale(0.3); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes splash-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-6px); }
        }
        @keyframes splash-rise {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-slide {
          to { left: 100%; }
        }
      `}</style>
    </div>
  )
}
