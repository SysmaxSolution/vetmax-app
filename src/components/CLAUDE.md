# Componentes — regras do modulo

Detalhamento das regras 5 (UI/UX) e 6 (Design System) do `CLAUDE.md` da raiz.
`DESIGN_SYSTEM.md` na raiz e a fonte normativa; o que segue sao as decisoes que
nao se descobrem lendo o codigo.

## Design System

- Tokens vem de `globals.css`. Nao introduza valor de cor literal no componente.
- **Acao primaria = teal.** Sempre. A cor do modulo serve apenas para navegacao
  e identificacao de contexto, nunca para o botao de acao.
- Loading usa os componentes `Skeleton` / `Spinner` compartilhados. Skeleton e o
  padrao; spinner apenas onde nao ha forma previsivel para esqueletizar.
- Motion entre 120 e 240 ms, sempre com variante `prefers-reduced-motion`.

## Padrao Zero-Click

Atalho de teclado e preenchimento por voz sao prioridade, nao enfeite. Todo
fluxo operacional de alto volume (recepcao, triagem, caixa) deve ser completavel
sem mouse. Ao adicionar campo em formulario de fluxo, defina a ordem de tab.

## Terminologia na interface

Pet/Animal (nunca "Paciente"), Tutor (nunca "Dono"), Medico Veterinario ou MV
(nunca so "Medico"), Auxiliar Veterinario. Isto e exigencia de nomenclatura
tecnica do CFMV, nao preferencia de estilo.

## Armadilhas deste repositorio

**Modal dentro de `<Link>`** — um modal renderizado na arvore de um `<Link>`
captura o clique e navega. Monte **sempre** via `createPortal(document.body)`.

**Realtime sem debounce** — assinatura do Supabase sem coalescencia dispara
re-render em cascata. Use `useRealtimeSync`, que coalesce em 800 ms.

**Skew de deploy** — o `DeploySkewGuard` do layout detecta build antigo falando
com action nova. Nao remova; componente que dispara action precisa de
`try/finally` para nao travar em carregamento.
