'use client'

/**
 * Estilos exclusivos do Layout Moderno.
 * Injetados via <style> tag escopada com [data-layout="modern"].
 * O Layout Clássico NÃO é afetado por nenhuma regra aqui.
 */
export default function ModernStyles() {
  return (
    <style>{`

/* ═══════════════════════════════════════════════════════════════════
   MODERN LAYOUT — Design System
   Todas as regras usam [data-layout="modern"] como prefixo.
   Especificidade > Tailwind (attr + class > single class).
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Custom Properties ─────────────────────────────────────────── */
[data-layout="modern"] {
  --m-bg:          #EEF2F7;
  --m-surface:     #FFFFFF;
  --m-border:      rgba(15, 23, 42, 0.07);
  --m-border-soft: rgba(15, 23, 42, 0.04);
  --m-shadow-xs:   0 1px 2px rgba(15, 23, 42, 0.05);
  --m-shadow-sm:   0 2px 8px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04);
  --m-shadow-md:   0 4px 16px rgba(15, 23, 42, 0.09), 0 2px 4px rgba(15, 23, 42, 0.05);
  --m-radius-xs:   8px;
  --m-radius-sm:   10px;
  --m-radius-md:   14px;
  --m-radius-lg:   18px;
  --m-font-base:   14.5px;
  background-color: var(--m-bg) !important;
}

/* ─── Header — elevado, com sombra sutil ─────────────────────────── */
[data-layout="modern"] .sticky.top-0 {
  border-bottom: none !important;
  box-shadow: 0 1px 0 var(--m-border), 0 4px 20px rgba(15, 23, 42, 0.06) !important;
}

/* ─── Widen — max-w-4xl → layout fluido para telas grandes ──────── */
/* Afeta header + áreas de conteúdo. Seguro: forms/dialogs usam max-w-sm/md/lg. */
[data-layout="modern"] [class~="max-w-4xl"] {
  max-width: min(1440px, calc(100vw - 48px)) !important;
}

/* Para telas menores que 768px, mantém comportamento responsivo */
@media (max-width: 767px) {
  [data-layout="modern"] [class~="max-w-4xl"] {
    max-width: calc(100vw - 24px) !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
}

/* ─── Nav tabs row — mais respiro entre os itens ────────────────── */
[data-layout="modern"] [class~="flex-wrap"][class~="items-center"][class~="gap-1"]:not([class~="gap-1.5"]) {
  gap: 5px !important;
  padding-top: 6px !important;
  padding-bottom: 7px !important;
}

/* ─── Tab links — área de clique maior, visual mais limpo ────────── */
[data-layout="modern"] [class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"] {
  padding: 9px 15px !important;
  border-radius: var(--m-radius-sm) !important;
  font-size: 13.5px !important;
  letter-spacing: 0.005em;
  transition: background-color 0.15s, color 0.15s, box-shadow 0.15s !important;
}

/* Tab ativo — borda bottom discreta no Modern */
[data-layout="modern"] [class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"] {
  box-shadow: 0 1px 4px rgba(15,23,42,0.15), 0 1px 0 rgba(255,255,255,0.8) inset !important;
}

/* ─── Hover nos tabs — fundo mais pronunciado ────────────────────── */
[data-layout="modern"] [class*="hover:bg-"][class~="px-3"][class~="py-2.5"]:hover {
  background-color: rgba(15, 23, 42, 0.05) !important;
}

/* ─── Brand row — mais padding vertical ──────────────────────────── */
[data-layout="modern"] [class~="py-3"][class~="flex"][class~="items-center"][class~="justify-between"] {
  padding-top: 14px !important;
  padding-bottom: 14px !important;
}

/* ─── Cards — sombra + bordas mais arredondadas ──────────────────── */
[data-layout="modern"] [class~="bg-white"][class~="rounded-xl"],
[data-layout="modern"] [class~="bg-white"][class~="rounded-2xl"] {
  box-shadow: var(--m-shadow-sm) !important;
}

[data-layout="modern"] [class~="rounded-xl"][class~="border-slate-200"],
[data-layout="modern"] [class~="rounded-xl"][class~="border"][class~="border-slate-200"] {
  border-radius: var(--m-radius-md) !important;
  border-color: var(--m-border) !important;
}

[data-layout="modern"] [class~="rounded-2xl"][class~="border-slate-200"],
[data-layout="modern"] [class~="rounded-2xl"][class~="border"][class~="border-slate-200"] {
  border-radius: var(--m-radius-lg) !important;
  border-color: var(--m-border) !important;
}

/* Sombra nos cards que usam shadow-sm do Tailwind */
[data-layout="modern"] [class~="shadow-sm"] {
  box-shadow: var(--m-shadow-sm) !important;
}

/* ─── Divisores internos — mais suaves ───────────────────────────── */
[data-layout="modern"] [class~="border-b"][class~="border-slate-100"],
[data-layout="modern"] [class~="border-b"][class~="border-slate-200"] {
  border-color: var(--m-border) !important;
}

[data-layout="modern"] [class~="divide-slate-100"] > * + * {
  border-color: var(--m-border) !important;
}

/* ─── Tipografia — títulos de página ─────────────────────────────── */
[data-layout="modern"] h1[class~="text-2xl"] {
  font-size: 1.625rem !important;
  letter-spacing: -0.02em;
  font-weight: 700 !important;
}

[data-layout="modern"] h1[class~="text-xl"] {
  font-size: 1.25rem !important;
  letter-spacing: -0.015em;
  font-weight: 700 !important;
}

[data-layout="modern"] h2[class~="text-base"][class~="font-semibold"],
[data-layout="modern"] h2[class~="text-lg"][class~="font-semibold"] {
  font-weight: 600 !important;
  letter-spacing: -0.01em;
}

/* ─── Botões — raios e padding padronizados ──────────────────────── */
[data-layout="modern"] button[class~="rounded-lg"],
[data-layout="modern"] a[class~="rounded-lg"] {
  border-radius: var(--m-radius-sm) !important;
}

[data-layout="modern"] button[class~="rounded-xl"],
[data-layout="modern"] a[class~="rounded-xl"] {
  border-radius: 12px !important;
}

[data-layout="modern"] button[class~="rounded-2xl"],
[data-layout="modern"] a[class~="rounded-2xl"] {
  border-radius: 14px !important;
}

/* Padding mínimo de botões de ação */
[data-layout="modern"] button[class~="px-4"][class~="py-2"],
[data-layout="modern"] a[class~="px-4"][class~="py-2"] {
  padding: 9px 18px !important;
}

[data-layout="modern"] button[class~="px-3"][class~="py-2"],
[data-layout="modern"] a[class~="px-3"][class~="py-2"] {
  padding: 8px 14px !important;
}

/* ─── Inputs e selects ───────────────────────────────────────────── */
[data-layout="modern"] input[class~="rounded-lg"],
[data-layout="modern"] textarea[class~="rounded-lg"],
[data-layout="modern"] select[class~="rounded-lg"] {
  border-radius: var(--m-radius-sm) !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  transition: border-color 0.15s, box-shadow 0.15s !important;
}

[data-layout="modern"] input[class~="rounded-lg"]:focus,
[data-layout="modern"] textarea[class~="rounded-lg"]:focus {
  border-color: rgba(99, 102, 241, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
}

[data-layout="modern"] input[class~="rounded-xl"],
[data-layout="modern"] textarea[class~="rounded-xl"],
[data-layout="modern"] select[class~="rounded-xl"] {
  border-radius: 12px !important;
}

/* ─── Badges e pills ─────────────────────────────────────────────── */
[data-layout="modern"] [class~="rounded-full"][class~="text-xs"][class~="font-medium"],
[data-layout="modern"] [class~="rounded-full"][class~="text-xs"][class~="font-semibold"] {
  letter-spacing: 0.01em;
}

/* ─── Tabelas / listas divididas ─────────────────────────────────── */
[data-layout="modern"] [class~="divide-y"] > * {
  transition: background-color 0.12s !important;
}

/* ─── Footer — fundo adaptado ao tema Modern ─────────────────────── */
[data-layout="modern"] footer {
  background-color: rgba(238, 242, 247, 0.8) !important;
  border-top: 1px solid var(--m-border) !important;
}

/* ─── Scrollbar — estilo discreto (Webkit) ───────────────────────── */
[data-layout="modern"] *::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
[data-layout="modern"] *::-webkit-scrollbar-track {
  background: transparent;
}
[data-layout="modern"] *::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.18);
  border-radius: 3px;
}
[data-layout="modern"] *::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.28);
}

/* ─── Mobile menu slide-over — ligeiramente mais largo ──────────── */
@media (max-width: 640px) {
  [data-layout="modern"] [class~="w-[280px]"] {
    width: 300px !important;
  }
}

`}</style>
  )
}
