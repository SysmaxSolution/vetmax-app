// Footer discreto exibido em todas as páginas (dashboard + login + públicas).
// Posicionado de forma que respeita o safe-area-inset-bottom em dispositivos
// nativos (Capacitor) e não cobre conteúdo em telas curtas.

export function SysmaxFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`w-full pb-safe text-center text-[11px] text-slate-400 select-none ${className}`}
      aria-label="Crédito do desenvolvedor"
    >
      <span className="inline-block py-2 px-3 opacity-70 hover:opacity-100 transition-opacity">
        Criado por <span className="font-semibold text-slate-500">Sysmax Solutions</span>
      </span>
    </footer>
  )
}
