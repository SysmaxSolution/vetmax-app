# Sprint Plan — Visita Almavet (Lais) — 2026-06-20

> Fonte: 30 anotações de campo do Diretor durante acompanhamento do dia operacional da Lais (Almavet), prospect → 1ª cliente. Projeto: **vetmax-app**.
> Status: **PLANEJAMENTO — aguardando ordem de início.** Modo ByPass quando aprovado.

## Resumo executivo

- **15 correções (bugs)** e **14 melhorias/features** extraídas e desduplicadas.
- Clusters críticos: **gravação por voz do consultório** (3 bugs que se reforçam), **persistência de cadastro** (2 bugs), **unicidade do pet no fluxo** (1 bug URGENTE), **governança de gatilhos WhatsApp** (envio indevido / LGPD).
- Rota proposta: **4 sprints**, P0 → P2. Sprint 1 é "apagar incêndio" (perda de dado + core quebrado + envio indevido).

---

## Classificação por severidade

### P0 — Quebrado / perda de dado / envio indevido (Sprint 1)
| # | Tópico | Módulo | Hora |
|---|--------|--------|------|
| B1 | **URGENTE:** mesmo pet inserível várias vezes na mesma rotina e em vários módulos ao mesmo tempo. Travar para 1 pet = 1 fluxo ativo; avisar "pet está em X módulo com X profissional". | Core/Fluxo | 08:52 |
| B2 | Alterações no cadastro pet/tutor não salvam (ex: endereço) — dados somem ao reabrir. | Cadastro | 10:43 |
| B3 | Flag "Notificação WhatsApp" no cadastro do tutor não persiste (desmarca ao reabrir). | Cadastro/WPP | 10:46 |
| B4 | Gatilhos WhatsApp são exibidos/enviados para TODOS os tutores; deveriam respeitar só os com flag de notificação ativa. | WhatsApp/LGPD | 10:46 |
| B5 | Bot não responde no horário definido. | WhatsApp/bot | 09:00 |
| B6 | Gravação de voz no consultório para sozinha após determinado tempo. | Consultório/voz | 10:00 |
| B7 | Consulta fecha sozinha no meio da gravação e volta para a fila do consultório. | Consultório/voz | 10:03 |
| B8 | Gravação de voz para e não retorna mesmo clicando "Gravar"/falando "Assistente" — só recarregando a página. | Consultório/voz | 10:04 |

### P1 — Operação diária comprometida (Sprint 2)
| # | Tópico | Módulo | Hora |
|---|--------|--------|------|
| B9 | Mapa de Execução: clicar em um medicamento lista TODOS em vez do clicado; não mostra qual aplicar agora nem o horário. | Internação | 08:48 |
| B10 | Alerta de medicações na tela de Internação persiste mesmo após a alta do paciente. | Internação | 08:49 |
| B11 | PDV exibe pets arquivados (deveria ocultar). | Caixa/PDV | 08:58 |
| B12 | Campo de pesquisa do Orçamento lista tudo e não fecha ao clicar fora, cobrindo a tela e travando inclusão manual. | Faturamento | 11:35 |
| B13 | Valores de serviço/produto incluídos manualmente ficam com "0" fixo — não dá para apagar e digitar o valor. | Faturamento | 11:42 |
| B14 | Gravação de voz abre o gatilho do WhatsApp no consultório; deveria abrir só ao finalizar (transferência/alta). | Consultório/WPP | 10:01 |
| B15 | Mensagem de gatilho ao fim da consulta não condiz com o atendimento (ex: pet de vacina recebe texto de pós-operatório). | WhatsApp/IA | 08:24 |

### P2 — Melhorias / features
Ver épicos F–L abaixo.

---

## Épicos (agrupamento por causa-raiz / domínio)

### Épico A — Estabilização do Consultório por Voz (P0) — Sprint 1
Cobre **B6, B7, B8, B14**. Provável causa-raiz comum: sessão de gravação/realtime caindo (timeout, perda de socket, re-render que desmonta o componente) → some a consulta. Investigar: limite de duração do MediaRecorder/stream, keep-alive, reconexão automática, e desacoplar o disparo do gatilho WhatsApp do evento de gravação (mover para o evento de finalização/alta).
- Aceite: gravação roda 20+ min sem parar; reconecta sozinha; consulta não fecha; gatilho só aparece ao finalizar/transferir/dar alta.

### Épico B — Integridade de Dados de Cadastro (P0) — Sprint 1
Cobre **B2, B3**. Provável causa-raiz comum: server action de update de tutor/pet não persiste todos os campos (mapeamento de payload, optimistic UI que mascara erro, ou campo `whatsapp_notifications` fora do update). Auditar a action de save de tutor/pet e o form.
- Aceite: endereço e demais campos persistem; flag de notificação persiste; reabrir o cadastro mostra o salvo.

### Épico C — Unicidade do Pet no Fluxo / Lock de Atendimento (P0) — Sprint 1
Cobre **B1**. Implementar trava de "atendimento ativo único" por pet: enquanto houver fluxo aberto (recepção→triagem→consultório→exames→internação→cirurgia→caixa), bloquear nova inserção e exibir **onde** o pet está e **com qual profissional**. Requer um conceito central de "encounter/atendimento ativo" e checagem em todos os pontos de check-in.
- Aceite: tentar inserir pet já em fluxo mostra aviso com módulo+profissional e impede duplicação.
- ⚠️ Mais arquitetural — pode exigir migration (tabela/coluna de estado de atendimento ativo).

### Épico D — Governança de Gatilhos WhatsApp (P0/P1) — Sprint 1+2
Cobre **B4, B5, B15** (P0) + features **M3, M8** (config). 
- B4/B5 P0: respeitar flag do tutor; respeitar horário do bot.
- Feature: **Gestão > Configurações > WhatsApp > Gatilhos** com (a) horário de funcionamento do bot **por dia** (igual o da clínica) e (b) seleção de **quais módulos** disparam gatilho (ex: internação sim, consultório não).
- B15: o texto gerado pela IA precisa refletir o tipo de atendimento (vacina ≠ pós-op). Templatizar por `visit_reason`/tipo e passar contexto correto ao prompt.
- Atenção: cruza com bug histórico de `working_hours` (wrap-around/UTC) já mapeado na memória.

### Épico E — Internação / Mapa de Execução (P1) — Sprint 2
Cobre **B9, B10** + feature **M6** (minimizar medicações na lista do pet). Corrigir filtro do medicamento clicado, exibir "aplicar agora + horário", limpar alertas pós-alta, e UX de minimizar.

### Épico F — Caixa / PDV / Orçamento / Preços (P1/P2) — Sprint 2
Cobre **B11, B12, B13** + features **M11** (editar preço com permissão) e **M12** (PDV agrupado no fluxo contínuo).
- **M11:** permitir alterar preço de itens/serviços em recepção, consultório, exames, internação, centro cirúrgico e faturamento, com **direito de acesso** (permissão por usuário) controlando quem pode. ⚠️ Cruza com a arquitetura de preços imutáveis (snapshots em `consultation_services`) — definir se a alteração é override pontual (registrado/auditado) sem quebrar o snapshot.

### Épico G — Agenda Interativa (P2) — Sprint 4
Features **M1** (clicar no horário/dia e marcar direto), **M4** (definir duração/minutagem por atendimento), **M5** (editar eventos agendados).

### Épico H — Fluxo "ACOMPANHAMENTO" (P2) — Sprint 3
Feature **M2.** Novo fluxo express (molde da microchipagem): check-in → consultório resumido (prontuário por voz + sinais vitais) → finalizar com 2 opções: **Alta** (não cai no caixa, registra no feed do pet) ou **Consulta** (abre consulta padrão já pré-preenchida com o que foi feito no acompanhamento). Reaproveita o padrão `microchip_express_flow` da memória.

### Épico I — Vacinação Completa + Aba "Programações" (P1/P2) — Sprint 3 (maior)
Features **M7** (vacinação rica) + **M9** (aba Programações na recepção) + parte de bot.
- **M7:** na vacinação do consultório exibir nome da vacina (busca pré-preenchida), tipo, dose atual, dose total, fabricante, lote, validade; agendar próxima dose/reforço com presets (21/28/30/45 dias, 6 meses, 1 ano…) que auto-preenchem a data.
- **M9:** Recepção ganha 3ª aba **"Programações"** com: total de vacinas atrasadas (drill-down: pets, tutores, vacinas, data programada), total de vacinas programadas futuras, e **Agendamentos via bot** — tutor pede agendamento no WhatsApp, bot pergunta dia/horário de preferência, registra em *Programações > Agendamentos* para validação do recepcionista/MV (confirmar ou contrapropor), e o bot devolve a confirmação/contraproposta ao tutor. ⚠️ Feature grande: bot + recepção + agenda + estado de negociação.

### Épico J — Sinais Vitais Ampliados (P2) — Sprint 3
Feature **M3.** Adicionar campos em triagem e consultório: **PAS (Pressão Arterial Sistólica)** e **glicemia (mg/dL)**; auditar outros sinais vitais faltantes. ⚠️ Lembrar regra de Integridade Clínica (triagem exige `weight_kg` e `temperature_rectal`) — apenas adicionar, sem quebrar obrigatórios.

### Épico K — Compras/Estoque Inteligente (P2) — Sprint 4
Feature **M13.** No fluxo de entrada, o "vincular" deve consultar o estoque para sugerir qual item corresponde à entrada e quais devem ser cadastrados; administrar **unidades de medida** corretamente (caixa de comprimidos dá baixa em comprimidos, não na caixa).

### Épico L — Histórico Editável do Consultório (P2) — Sprint 4
Feature **M10.** Exibir histórico do consultório dos últimos ~7 dias até agora para permitir editar atendimentos.

---

## Rota de Sprint proposta

| Sprint | Tema | Itens | Critério de pronto |
|--------|------|-------|--------------------|
| **1 — Apagar incêndio** | Estabilidade + integridade + envio correto | A (B6,B7,B8,B14), B (B2,B3), C (B1), D parcial (B4,B5,B15 + horário/dia do bot) | Sem perda de dado; voz estável; pet único no fluxo; gatilho só para optados, no horário, com texto correto |
| **2 — Operação diária** | Internação + Caixa | E (B9,B10,M6), F (B11,B12,B13,M11,M12), D resto (módulos do gatilho M8) | Mapa de Execução correto; PDV/orçamento usáveis; edição de preço com permissão |
| **3 — Fluxos clínicos** | Vacinação, sinais vitais, acompanhamento | I (M7,M9), J (M3), H (M2) | Vacinação rica + Programações + bot agendamento; PAS/glicemia; fluxo Acompanhamento |
| **4 — Produtividade** | Agenda, compras, histórico | G (M1,M4,M5), K (M13), L (M10) | Agenda clicável/editável; entrada inteligente; histórico editável |

> Observação: Épico C (lock do pet) e Épico I (bot de agendamento) são os de maior risco/esforço — podem virar mini-projetos. Avaliar fatiar.

---

## Mapa anotação → item (rastreabilidade)
- 08:03 → M1 (agenda clicável) · 08:23 → M2 (Acompanhamento) · 08:24 → B15 (texto gatilho) · 08:28 → M8 (módulos do gatilho) · 08:33 → M3 (sinais vitais) · 08:34a → M4 (duração) · 08:34b → M5 (editar evento) · 08:44 → D (horário bot por dia) · 08:48 → B9 · 08:49 → B10 · 08:50 → M6 (minimizar) · 08:52 → B1 (URGENTE) · 08:58 → B11 + M12 (PDV) · 09:00 → B5 (bot) · 09:15 → M7 (vacinação) · 09:24 → M9 (Programações + bot agendamento) · 09:38 → M10 (histórico) · 10:00 → B6 · 10:01 → B14 · 10:03 → B7 · 10:04 → B8 · 10:43 → B2 · 10:46a → B4 · 10:46b → B3 · 10:58 → M11 (preço+permissão) · 11:35 → B12 · 11:42 → B13 · 11:51 → M13 (compras/estoque).
