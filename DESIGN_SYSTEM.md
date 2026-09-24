# Design System 2026 v7 — "Clínico Moderno"

Fonte da verdade visual do SYSVETMAX. Vale para TODAS as telas. Qualquer agente
(de qualquer modelo) que tocar UI deve seguir este guia. Tokens em
`src/app/globals.css` (`@theme`); tipografia em `src/app/layout.tsx`.

## Princípios
1. **Uma ação primária**: teal (petrol). `bg-teal-600 hover:bg-teal-700` para o
   botão principal da tela. Blue NÃO é cor de marca — é a cor do módulo Recepção.
2. **Cor de módulo é wayfinding, não decoração**: as cores de `module-theme.ts`
   aparecem só em navegação (tab ativa, indicador de módulo, eyebrow do título).
   Botões, links e estados usam teal + semânticas.
3. **Neutros = slate sempre** (`gray-*` está remapeado para slate nos tokens,
   mas escreva `slate` em código novo).
4. **Dinheiro, IDs e horários em mono**: `font-mono tabular-nums` (Spline Sans
   Mono) em valores de caixa, financeiro, cronologia e códigos.
5. **Densidade com respiro**: telas operacionais (recepção, caixa) são densas;
   ganhe clareza com hierarquia tipográfica e espaçamento, não com tamanho.

## Tipografia
- UI/display: **Hanken Grotesk** (`font-sans`, aplicada no `<body>`).
- Dados: **Spline Sans Mono** (`font-mono`).
- Títulos de página: `text-xl font-bold tracking-tight text-slate-900` com
  eyebrow opcional do módulo (`text-xs font-semibold uppercase tracking-wider`
  na cor do módulo).
- Corpo: `text-sm text-slate-600`. Secundário: `text-slate-500`.

## Superfícies
- Card padrão: `rounded-xl border border-slate-200 bg-white shadow-sm`.
- Card de destaque/modal: `rounded-2xl` + `shadow-lg`/`shadow-xl`.
- Fundo de página: `bg-slate-50`.
- As sombras são em camadas com tom slate (tokens já redefinidos — use
  `shadow-sm/md/lg/xl` normalmente).

## Botões
- Primário: `rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white
  shadow-sm hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500
  focus-visible:ring-offset-2 disabled:opacity-60`.
- Secundário: `rounded-lg border border-slate-200 bg-white text-slate-700
  hover:bg-slate-50`.
- Perigo: `bg-red-600 hover:bg-red-700`.
- Radius de botão/input é SEMPRE `rounded-lg` (10px). `rounded-xl` é de card.

## Loading (obrigatório em toda tela)
- **Skeleton com a silhueta do conteúdo** para carregamento de página/seção:
  `Skeleton` / `SkeletonText` / `SkeletonCard` / `SkeletonRow` de
  `@/components/ui/Skeleton`. Preferir `loading.tsx` por rota.
- **Spinner** (`@/components/ui/Spinner`) só para ações pontuais (botão
  salvando, refresh inline). Nunca copiar spinner inline novo.
- Listas grandes: lazy (paginação/virtualização) + `loading="lazy"` em imagens.

## Motion (disciplina Emil Kowalski — ferramenta de produtividade)
- Durações: 120ms (frequente), 180ms (padrão), 240ms (overlays). Nada acima de
  300ms fora de empty states/onboarding.
- Utilities prontas: `animate-enter`, `animate-enter-fast`, `animate-fade`,
  `animate-scale-in`; easing `ease-swift`.
- Ações disparadas por teclado: sem animação.
- Só `transform`/`opacity` (compositor). Nunca animar width/height/top.
- `prefers-reduced-motion` já é respeitado pelas utilities do sistema — motion
  custom novo precisa do mesmo tratamento.
- Skeleton shimmer: classe `.ds-skeleton` (via componente), não reinventar.

## Semânticas de estado
- Sucesso `emerald`, erro/perigo `red`, alerta `amber`, info `sky`,
  PRO/upsell `indigo`. Padrão de badge: `bg-{cor}-100 text-{cor}-700`.

## O que NÃO fazer
- Não criar CSS com `!important` mirando classes utilitárias (padrão
  ModernStyles é legado, em extinção).
- Não usar `gray-*`, `zinc-*`, `neutral-*` em código novo.
- Não introduzir novas famílias de fonte ou novos tons de primário.
- Não animar propriedades de layout nem passar de 300ms em fluxo operacional.
