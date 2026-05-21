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
            radial-gradient(circle at 30% 20%, rgba(20,184,166,0.35) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(45,212,191,0.25) 0%, transparent 50%),
            linear-gradient(135deg, #0f172a 0%, #134e4a 100%)
          `,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="splash-logo-wrap mx-auto mb-6">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="h-28 w-28 md:h-32 md:w-32">
              <defs>
                <linearGradient id="splash-g1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"  stopColor="#5eead4"/>
                  <stop offset="100%" stopColor="#14b8a6"/>
                </linearGradient>
                <linearGradient id="splash-g2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"  stopColor="#a7f3d0"/>
                  <stop offset="100%" stopColor="#5eead4"/>
                </linearGradient>
              </defs>
              <g transform="translate(58 56) scale(0.5) translate(-50 -50)" opacity="0.6">
                <ellipse cx="27" cy="32" rx="10" ry="13" fill="url(#splash-g2)" transform="rotate(-18 27 32)"/>
                <ellipse cx="44" cy="23" rx="10" ry="13" fill="url(#splash-g2)" transform="rotate(-6 44 23)"/>
                <ellipse cx="61" cy="23" rx="10" ry="13" fill="url(#splash-g2)" transform="rotate(6 61 23)"/>
                <ellipse cx="78" cy="32" rx="10" ry="13" fill="url(#splash-g2)" transform="rotate(18 78 32)"/>
                <ellipse cx="52" cy="67" rx="26" ry="22" fill="url(#splash-g2)"/>
              </g>
              <g transform="translate(38 44) scale(0.85) translate(-50 -50)">
                <ellipse cx="27" cy="32" rx="10" ry="13" fill="url(#splash-g1)" transform="rotate(-18 27 32)"/>
                <ellipse cx="44" cy="23" rx="10" ry="13" fill="url(#splash-g1)" transform="rotate(-6 44 23)"/>
                <ellipse cx="61" cy="23" rx="10" ry="13" fill="url(#splash-g1)" transform="rotate(6 61 23)"/>
                <ellipse cx="78" cy="32" rx="10" ry="13" fill="url(#splash-g1)" transform="rotate(18 78 32)"/>
                <ellipse cx="52" cy="67" rx="26" ry="22" fill="url(#splash-g1)"/>
                <ellipse cx="45" cy="58" rx="14" ry="9" fill="#a7f3d0" opacity="0.4"/>
              </g>
            </svg>
          </div>
          <div className="splash-title text-2xl md:text-3xl font-bold tracking-wide"
               style={{
                 background: 'linear-gradient(90deg, #5eead4, #ffffff)',
                 WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
               }}>
            SysVetMax
          </div>
          <div className="splash-tag mt-1.5 text-[11px] md:text-xs uppercase tracking-[0.18em] text-teal-300">
            Cuidando do seu pet
          </div>
          <div className="splash-progress mt-7 mx-auto" />
        </div>
      </div>

      <style jsx>{`
        .splash-logo-wrap {
          animation: splash-pop 0.7s cubic-bezier(.34,1.56,.64,1) both,
                     splash-float 3.5s ease-in-out 0.7s infinite;
          filter: drop-shadow(0 12px 28px rgba(20,184,166,0.45));
        }
        .splash-title  { opacity: 0; transform: translateY(8px); animation: splash-rise 0.6s ease-out 0.35s forwards; }
        .splash-tag    { opacity: 0; transform: translateY(8px); animation: splash-rise 0.6s ease-out 0.55s forwards; }
        .splash-progress {
          width: 140px; height: 3px; border-radius: 3px;
          background: rgba(94,234,212,0.18);
          overflow: hidden; position: relative;
        }
        .splash-progress::after {
          content: ''; position: absolute; left: -40%; top: 0; height: 100%; width: 40%;
          background: linear-gradient(90deg, transparent, #5eead4, transparent);
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
