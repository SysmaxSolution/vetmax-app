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
   MODERN LAYOUT — Design System v6 "Soft UI + Identificação Visual por Cores"
   Escopo: [data-layout="modern"] — Classic intocado.
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Custom Properties ─────────────────────────────────────────── */
[data-layout="modern"] {
  --m-bg:          #F0F2F5;
  --m-surface:     #FFFFFF;
  --m-border:      rgba(15, 23, 42, 0.055);
  --m-border-soft: rgba(15, 23, 42, 0.03);
  --m-shadow-xs:   0 1px 3px rgba(15, 23, 42, 0.04);
  --m-shadow-sm:   0 2px 8px rgba(15, 23, 42, 0.055),
                   0 1px 2px rgba(15, 23, 42, 0.03),
                   0 0 0 1px rgba(15, 23, 42, 0.038);
  --m-shadow-md:   0 4px 18px rgba(15, 23, 42, 0.08),
                   0 2px 4px  rgba(15, 23, 42, 0.04),
                   0 0 0 1px  rgba(15, 23, 42, 0.04);
  --m-radius-xs:   8px;
  --m-radius-sm:   12px;
  --m-radius-md:   14px;
  --m-radius-lg:   18px;
  background-color: var(--m-bg) !important;
}

/* ═══════════════════════════════════════════════════════════════════
   1. FULL-WIDTH GLOBAL
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] [class*="max-w-"],
[data-layout="modern"] .container {
  max-width: 100% !important;
}

/* Restaura modais/dialogs com largura pequena */
[data-layout="modern"] [class~="max-w-xs"]  { max-width: 20rem !important; }
[data-layout="modern"] [class~="max-w-sm"]  { max-width: 24rem !important; }
[data-layout="modern"] [class~="max-w-md"]  { max-width: 28rem !important; }
[data-layout="modern"] [class~="max-w-lg"]  { max-width: 32rem !important; }
[data-layout="modern"] [class~="max-w-xl"]  { max-width: 36rem !important; }
[data-layout="modern"] [class~="max-w-2xl"] { max-width: 42rem !important; }
[data-layout="modern"] [class~="max-w-3xl"] { max-width: 48rem !important; }

/* ═══════════════════════════════════════════════════════════════════
   2. HEADER — glass suave
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] .sticky.top-0 {
  border-bottom: none !important;
  background-color: rgba(255, 255, 255, 0.90) !important;
  backdrop-filter: blur(14px) saturate(1.5) !important;
  -webkit-backdrop-filter: blur(14px) saturate(1.5) !important;
  box-shadow: 0 1px 0 var(--m-border), 0 4px 24px rgba(15, 23, 42, 0.045) !important;
}

/* Remove barra indicadora de 3px — seletor de descendente (não filho direto) */
[data-layout="modern"] .sticky.top-0 [class~="h-\\[3px\\]"] {
  display: none !important;
}

/* Brand row */
[data-layout="modern"] [class~="py-3"][class~="flex"][class~="items-center"][class~="justify-between"] {
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}

/* ═══════════════════════════════════════════════════════════════════
   3. NAVEGAÇÃO — BASE
   Seletores usam [class~="py-2.5"] para evitar colisão com ManagementNav (py-2)
   e com o slide-over mobile (rounded-xl, não rounded-lg).
   ═══════════════════════════════════════════════════════════════════ */

/* Barra de abas */
[data-layout="modern"] [class~="flex-wrap"][class~="items-center"][class~="gap-1"]:not([class~="gap-1.5"]) {
  gap: 2px !important;
  padding-top: 4px !important;
  padding-bottom: 5px !important;
}

/* Todos os tab links — estado neutro */
[data-layout="modern"] [class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"] {
  padding: 7px 12px !important;
  border-radius: var(--m-radius-xs) !important;
  font-size: 13.5px !important;
  font-weight: 500 !important;
  letter-spacing: 0.007em !important;
  color: #52616e !important;
  background: transparent !important;
  box-shadow: none !important;
  transition: background-color 0.20s ease, color 0.20s ease, box-shadow 0.20s ease, transform 0.12s ease !important;
}

/* ─── Hover genérico fallback (baixa especificidade — per-module sobrescreve) ── */
[data-layout="modern"] [class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover {
  background-color: rgba(15, 23, 42, 0.05) !important;
  color: #1e293b !important;
}

/* ─── Pill ativo genérico fallback ───────────────────────────────── */
[data-layout="modern"] [class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"] {
  background-color: rgba(99, 102, 241, 0.09) !important;
  color: #4338ca !important;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.18) !important;
  font-weight: 600 !important;
}

/* ═══════════════════════════════════════════════════════════════════
   4. HOVER POR MÓDULO — Identificação Visual de Cor
   Cores alinhadas 1:1 com MODULE_THEME em /lib/module-theme.ts
   Fundo: escala -100 com alpha 0.65 | Texto: escala -700/-800
   Especificidade [0,8,1] > genérico [0,7,0] ✓
   ═══════════════════════════════════════════════════════════════════ */

/* Recepção — Azul (blue-100 / blue-700) */
[data-layout="modern"] a[href*="/dashboard/reception"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(219,234,254,.65) !important; color: #1d4ed8 !important; }

/* Pacientes — Ciano (cyan-100 / cyan-700) */
[data-layout="modern"] a[href*="/dashboard/patients"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(207,250,254,.65) !important; color: #0e7490 !important; }

/* Triagem — Âmbar (amber-100 / amber-700) */
[data-layout="modern"] a[href*="/dashboard/triage"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(254,243,199,.65) !important; color: #b45309 !important; }

/* Consultório — Indigo (indigo-100 / indigo-700) */
[data-layout="modern"] a[href*="/dashboard/vet"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(224,231,255,.65) !important; color: #4338ca !important; }

/* Exames — Violeta (violet-100 / violet-700) */
[data-layout="modern"] a[href*="/dashboard/exams"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(237,233,254,.65) !important; color: #6d28d9 !important; }

/* Internação — Rosa/Pink (pink-100 / pink-700) */
[data-layout="modern"] a[href*="/dashboard/hospitalization"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(252,231,243,.65) !important; color: #be185d !important; }

/* Centro Cirúrgico — Vermelho (red-100 / red-700) */
[data-layout="modern"] a[href*="/dashboard/surgery"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(254,226,226,.65) !important; color: #b91c1c !important; }

/* Banho e Tosa — Rose (rose-100 / rose-700) */
[data-layout="modern"] a[href*="/dashboard/grooming"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(255,228,230,.65) !important; color: #be123c !important; }

/* Estoque/Farmácia — Laranja (orange-100 / orange-700) */
[data-layout="modern"] a[href*="/dashboard/pharmacy"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(255,237,213,.65) !important; color: #c2410c !important; }

/* Vendas — Esmeralda (emerald-100 / emerald-700) */
[data-layout="modern"] a[href*="/dashboard/sales"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(209,250,229,.65) !important; color: #047857 !important; }

/* Caixa — Verde (green-100 / green-700) */
[data-layout="modern"] a[href*="/dashboard/cashier"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(220,252,231,.65) !important; color: #15803d !important; }

/* Cadastros — Slate (slate-200 / slate-700) */
[data-layout="modern"] a[href*="/dashboard/registry"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(226,232,240,.80) !important; color: #334155 !important; }

/* Compras — Roxo (purple-100 / purple-700) */
[data-layout="modern"] a[href*="/dashboard/purchases"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(243,232,255,.65) !important; color: #7e22ce !important; }

/* Financeiro — Teal (teal-100 / teal-700) */
[data-layout="modern"] a[href*="/dashboard/financial"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(204,251,241,.65) !important; color: #0f766e !important; }

/* Relatórios — Violeta (violet-100 / violet-700) */
[data-layout="modern"] a[href*="/dashboard/reports"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(237,233,254,.65) !important; color: #6d28d9 !important; }

/* Gestão — Slate escuro (slate-300 / slate-800) */
[data-layout="modern"] a[href*="/dashboard/management"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(203,213,225,.80) !important; color: #1e293b !important; }

/* WhatsApp — Verde (green-100 / green-600) */
[data-layout="modern"] a[href*="/dashboard/whatsapp"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(220,252,231,.65) !important; color: #16a34a !important; }

/* Chat Interno — Roxo (purple-100 / purple-700) */
[data-layout="modern"] a[href*="/dashboard/internal-chat"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="font-medium"]:hover
{ background-color: rgba(243,232,255,.65) !important; color: #7e22ce !important; }

/* ═══════════════════════════════════════════════════════════════════
   5. PILL ATIVO POR MÓDULO — cor sólida suave permanente
   Detectado via shadow-sm (presente apenas no tab ativo).
   Cores alinhadas 1:1 com MODULE_THEME — sem barra de 3px, apenas pill.
   Especificidade [0,7,1] > genérico [0,6,0] ✓
   ═══════════════════════════════════════════════════════════════════ */

/* Recepção */
[data-layout="modern"] a[href*="/dashboard/reception"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(219,234,254,.90) !important; color: #1e40af !important; box-shadow: 0 0 0 1px rgba(37,99,235,.22) !important; font-weight: 600 !important; }

/* Pacientes */
[data-layout="modern"] a[href*="/dashboard/patients"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(207,250,254,.90) !important; color: #155e75 !important; box-shadow: 0 0 0 1px rgba(14,116,144,.22) !important; font-weight: 600 !important; }

/* Triagem */
[data-layout="modern"] a[href*="/dashboard/triage"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(254,243,199,.90) !important; color: #92400e !important; box-shadow: 0 0 0 1px rgba(180,83,9,.22) !important; font-weight: 600 !important; }

/* Consultório */
[data-layout="modern"] a[href*="/dashboard/vet"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(224,231,255,.90) !important; color: #3730a3 !important; box-shadow: 0 0 0 1px rgba(67,56,202,.22) !important; font-weight: 600 !important; }

/* Exames */
[data-layout="modern"] a[href*="/dashboard/exams"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(237,233,254,.90) !important; color: #5b21b6 !important; box-shadow: 0 0 0 1px rgba(109,40,217,.22) !important; font-weight: 600 !important; }

/* Internação — Rosa/Pink */
[data-layout="modern"] a[href*="/dashboard/hospitalization"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(252,231,243,.90) !important; color: #9d174d !important; box-shadow: 0 0 0 1px rgba(190,24,93,.22) !important; font-weight: 600 !important; }

/* Cirurgia */
[data-layout="modern"] a[href*="/dashboard/surgery"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(254,226,226,.90) !important; color: #991b1b !important; box-shadow: 0 0 0 1px rgba(185,28,28,.22) !important; font-weight: 600 !important; }

/* Banho e Tosa */
[data-layout="modern"] a[href*="/dashboard/grooming"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(255,228,230,.90) !important; color: #9f1239 !important; box-shadow: 0 0 0 1px rgba(190,18,60,.22) !important; font-weight: 600 !important; }

/* Estoque/Farmácia */
[data-layout="modern"] a[href*="/dashboard/pharmacy"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(255,237,213,.90) !important; color: #9a3412 !important; box-shadow: 0 0 0 1px rgba(194,65,12,.22) !important; font-weight: 600 !important; }

/* Vendas */
[data-layout="modern"] a[href*="/dashboard/sales"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(209,250,229,.90) !important; color: #065f46 !important; box-shadow: 0 0 0 1px rgba(4,120,87,.22) !important; font-weight: 600 !important; }

/* Caixa */
[data-layout="modern"] a[href*="/dashboard/cashier"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(220,252,231,.90) !important; color: #166534 !important; box-shadow: 0 0 0 1px rgba(21,128,61,.22) !important; font-weight: 600 !important; }

/* Cadastros */
[data-layout="modern"] a[href*="/dashboard/registry"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(226,232,240,.95) !important; color: #1e293b !important; box-shadow: 0 0 0 1px rgba(51,65,85,.18) !important; font-weight: 600 !important; }

/* Compras */
[data-layout="modern"] a[href*="/dashboard/purchases"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(243,232,255,.90) !important; color: #6b21a8 !important; box-shadow: 0 0 0 1px rgba(126,34,206,.22) !important; font-weight: 600 !important; }

/* Financeiro */
[data-layout="modern"] a[href*="/dashboard/financial"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(204,251,241,.90) !important; color: #115e59 !important; box-shadow: 0 0 0 1px rgba(15,118,110,.22) !important; font-weight: 600 !important; }

/* Relatórios */
[data-layout="modern"] a[href*="/dashboard/reports"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(237,233,254,.90) !important; color: #5b21b6 !important; box-shadow: 0 0 0 1px rgba(109,40,217,.22) !important; font-weight: 600 !important; }

/* Gestão */
[data-layout="modern"] a[href*="/dashboard/management"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(203,213,225,.95) !important; color: #0f172a !important; box-shadow: 0 0 0 1px rgba(30,41,59,.18) !important; font-weight: 600 !important; }

/* WhatsApp */
[data-layout="modern"] a[href*="/dashboard/whatsapp"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(220,252,231,.90) !important; color: #15803d !important; box-shadow: 0 0 0 1px rgba(22,163,74,.22) !important; font-weight: 600 !important; }

/* Chat Interno */
[data-layout="modern"] a[href*="/dashboard/internal-chat"][class~="px-3"][class~="py-2.5"][class~="rounded-lg"][class~="text-sm"][class~="shadow-sm"]
{ background-color: rgba(243,232,255,.90) !important; color: #6b21a8 !important; box-shadow: 0 0 0 1px rgba(126,34,206,.22) !important; font-weight: 600 !important; }

/* ═══════════════════════════════════════════════════════════════════
   6. MICROINTERAÇÕES — escala tátil
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] button,
[data-layout="modern"] a {
  transition: background-color 0.20s ease, color 0.20s ease,
              box-shadow 0.20s ease, transform 0.12s ease !important;
}

[data-layout="modern"] button:active,
[data-layout="modern"] a:active { transform: scale(0.99) !important; }

[data-layout="modern"] input:active,
[data-layout="modern"] select:active,
[data-layout="modern"] textarea:active { transform: none !important; }

/* ═══════════════════════════════════════════════════════════════════
   7. CARDS — sombra composta, sem bordas visíveis
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] [class~="bg-white"][class~="rounded-xl"],
[data-layout="modern"] [class~="bg-white"][class~="rounded-2xl"]
{ box-shadow: var(--m-shadow-sm) !important; border: none !important; }

[data-layout="modern"] [class~="shadow-sm"] { box-shadow: var(--m-shadow-sm) !important; }

[data-layout="modern"] [class~="rounded-xl"]  { border-radius: var(--m-radius-md) !important; }
[data-layout="modern"] [class~="rounded-2xl"] { border-radius: var(--m-radius-lg) !important; }

[data-layout="modern"] [class~="rounded-xl"][class~="border-slate-200"],
[data-layout="modern"] [class~="rounded-xl"][class~="border"][class~="border-slate-200"]
{ border-color: transparent !important; box-shadow: var(--m-shadow-sm) !important; }

[data-layout="modern"] [class~="rounded-2xl"][class~="border-slate-200"],
[data-layout="modern"] [class~="rounded-2xl"][class~="border"][class~="border-slate-200"]
{ border-color: transparent !important; box-shadow: var(--m-shadow-sm) !important; }

/* ═══════════════════════════════════════════════════════════════════
   8. INPUTS — foco translúcido
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] input[class~="rounded-lg"],
[data-layout="modern"] textarea[class~="rounded-lg"],
[data-layout="modern"] select[class~="rounded-lg"] {
  border-radius: var(--m-radius-sm) !important;
  border-color: rgba(15, 23, 42, 0.09) !important;
  background-color: #F8F9FB !important;
  transition: border-color 0.20s ease, box-shadow 0.20s ease !important;
}

[data-layout="modern"] input[class~="rounded-lg"]:focus,
[data-layout="modern"] textarea[class~="rounded-lg"]:focus,
[data-layout="modern"] select[class~="rounded-lg"]:focus {
  border-color: rgba(99, 102, 241, 0.38) !important;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04) !important;
  background-color: #FFFFFF !important;
  outline: none !important;
}

[data-layout="modern"] input[class~="rounded-xl"],
[data-layout="modern"] textarea[class~="rounded-xl"],
[data-layout="modern"] select[class~="rounded-xl"] { border-radius: var(--m-radius-sm) !important; }

/* ═══════════════════════════════════════════════════════════════════
   9. TABELAS & LISTAS
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] [class~="divide-y"] > * { transition: background-color 0.15s ease !important; }

[data-layout="modern"] tr:hover,
[data-layout="modern"] [class~="hover:bg-slate-50"]:hover
{ background-color: rgba(99, 102, 241, 0.028) !important; }

[data-layout="modern"] [class~="border-b"][class~="border-slate-100"],
[data-layout="modern"] [class~="border-b"][class~="border-slate-200"],
[data-layout="modern"] [class~="divide-slate-100"] > * + * { border-color: var(--m-border) !important; }

/* ═══════════════════════════════════════════════════════════════════
   10. BADGES DE STATUS — pastéis ergonômicos
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] [class~="bg-green-100"][class~="text-green-700"],
[data-layout="modern"] [class~="bg-green-100"][class~="text-green-800"]   { background-color: #d1fae5 !important; color: #065f46 !important; font-weight: 500 !important; }
[data-layout="modern"] [class~="bg-red-100"][class~="text-red-700"],
[data-layout="modern"] [class~="bg-red-100"][class~="text-red-800"]       { background-color: #fee2e2 !important; color: #991b1b !important; font-weight: 500 !important; }
[data-layout="modern"] [class~="bg-amber-100"][class~="text-amber-700"],
[data-layout="modern"] [class~="bg-yellow-100"][class~="text-yellow-700"] { background-color: #fef3c7 !important; color: #92400e !important; font-weight: 500 !important; }
[data-layout="modern"] [class~="bg-blue-100"][class~="text-blue-700"],
[data-layout="modern"] [class~="bg-blue-100"][class~="text-blue-800"]     { background-color: #dbeafe !important; color: #1e40af !important; font-weight: 500 !important; }
[data-layout="modern"] [class~="bg-indigo-100"][class~="text-indigo-700"],
[data-layout="modern"] [class~="bg-purple-100"][class~="text-purple-700"] { background-color: #e0e7ff !important; color: #3730a3 !important; font-weight: 500 !important; }

/* ═══════════════════════════════════════════════════════════════════
   11. TIPOGRAFIA
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] h1[class~="text-2xl"] { font-size: 1.55rem !important;  letter-spacing: -0.02em !important;  font-weight: 700 !important; }
[data-layout="modern"] h1[class~="text-xl"]  { font-size: 1.2rem !important;   letter-spacing: -0.015em !important; font-weight: 700 !important; }
[data-layout="modern"] h2[class~="text-base"][class~="font-semibold"],
[data-layout="modern"] h2[class~="text-lg"][class~="font-semibold"]        { font-weight: 600 !important; letter-spacing: -0.01em !important; }

/* ═══════════════════════════════════════════════════════════════════
   12. BOTÕES
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] button[class~="rounded-lg"], [data-layout="modern"] a[class~="rounded-lg"]  { border-radius: var(--m-radius-sm) !important; }
[data-layout="modern"] button[class~="rounded-xl"], [data-layout="modern"] a[class~="rounded-xl"]  { border-radius: var(--m-radius-md) !important; }
[data-layout="modern"] button[class~="rounded-2xl"],[data-layout="modern"] a[class~="rounded-2xl"] { border-radius: var(--m-radius-lg) !important; }

[data-layout="modern"] button[class~="px-4"][class~="py-2"], [data-layout="modern"] a[class~="px-4"][class~="py-2"] { padding: 9px 18px !important; }
[data-layout="modern"] button[class~="px-3"][class~="py-2"], [data-layout="modern"] a[class~="px-3"][class~="py-2"] { padding: 8px 14px !important; }

/* ═══════════════════════════════════════════════════════════════════
   13. FOOTER & SCROLLBAR
   ═══════════════════════════════════════════════════════════════════ */

[data-layout="modern"] footer {
  background-color: rgba(240, 242, 245, 0.85) !important;
  border-top: 1px solid var(--m-border) !important;
}

[data-layout="modern"] *::-webkit-scrollbar            { width: 5px; height: 5px; }
[data-layout="modern"] *::-webkit-scrollbar-track       { background: transparent; }
[data-layout="modern"] *::-webkit-scrollbar-thumb       { background: rgba(15, 23, 42, 0.13); border-radius: 4px; }
[data-layout="modern"] *::-webkit-scrollbar-thumb:hover { background: rgba(15, 23, 42, 0.22); }

/* ═══════════════════════════════════════════════════════════════════
   14. MOBILE
   ═══════════════════════════════════════════════════════════════════ */

@media (max-width: 640px) {
  [data-layout="modern"] [class~="w-\\[280px\\]"] { width: 300px !important; }
  [data-layout="modern"] button,
  [data-layout="modern"] a[class~="rounded-lg"]   { min-height: 38px; }
}

`}</style>
  )
}
