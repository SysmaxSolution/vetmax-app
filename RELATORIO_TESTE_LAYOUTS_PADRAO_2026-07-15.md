# Relatório — Teste dos Layouts Padrão (Bicho Mania) · 2026-07-15

**Objetivo:** validar os 9 layouts padrão de documentos (motor Canvas Nativo) antes da apresentação de sábado, com 3 consultas fictícias preenchidas como um MV real preencheria, comparando o resultado impresso com os modelos de referência (Res. CFMV nº 1.321/2020, Port. SVS/MS nº 344/98 Anexo XVII, Res. CFMV nº 1.000/2012).

**Método:** 3 consultas fictícias criadas na Bicho Mania (otite/dermatite · check-up p/ viagem · politrauma por atropelamento), com triagem, anamnese, diagnóstico, prescrições (incl. controlado Tramadol) e exames. Cada um dos 9 layouts foi gerado para as 3 consultas (27 documentos), impresso via rota real `/dashboard/laudos/{id}/print` e auditado visualmente contra o gabarito normativo. Capturas em `C:\SysMax\.tmp\layout-screens\`. **Todos os dados fictícios foram removidos ao final (verificação pós-limpeza = 0 resíduos). Nada da Almavet foi alterado** — apenas consultado para comparação.

---

## 1. Veredito por layout (após correções)

| # | Layout | Veredito | Observações |
|---|--------|----------|-------------|
| 1 | Receituário | ✅ Aprovado | Agrupamento por via ("Uso Oral"/"Uso Tópico"), leader dots, forma farmacêutica. Agora **exclui controlados** (Port. 344/98) e validade corrigida p/ 10 dias |
| 2 | Receita de Controle Especial | ✅ Aprovado | Blocos Emitente/Vias/Comprador/Fornecedor conforme Anexo XVII. Agora imprime **somente controlados**, com destaque azul "★ CONTROLADO" |
| 3 | Atestado de Saúde Animal | ✅ Aprovado | ID completa (microchip, pelagem), imunizações e validade preenchidas. Conteúdo Art. 5º ok |
| 4 | Atestado de Óbito | ✅ Aprovado | Data/hora, local, causa mortis, orientação de destinação do cadáver, nota de 2 vias — Art. 8º completo |
| 5 | Solicitação de Exames | ✅ Aprovado | Suspeita clínica + lista numerada com OBS por exame. Códigos agora viram rótulos ("Raio-X", "Hemograma Completo") |
| 6 | TCLE — Cirurgia e Anestesia | ✅ Aprovado | Assinatura dupla tutor+MV, riscos e autorização de emergência. Melhoria P2: campo "tipo de anestesia" (Anexo VIII) |
| 7 | TCLE — Internação | ✅ Aprovado | Cláusulas de custo, visita e retirada sem alta. Anexo VII ok |
| 8 | TCLE — Eutanásia | ✅ Aprovado | Cita Res. 1.000/2012, irreversibilidade, destinação do corpo. Anexo IX ok |
| 9 | Termo de Retirada sem Alta Médica | ✅ Aprovado | Único com campos de 2 testemunhas (Art. 11 §1º — exigência exclusiva deste termo). Anexo X ok |

**Conclusão geral:** com as correções abaixo aplicadas, o conjunto está **digno de apresentação em hospital** — identificação completa do animal/tutor, assinatura eletrônica do MV renderizada, tipografia limpa, conformidade com o conteúdo mínimo CFMV. As pendências restantes são de **cadastro da clínica** (item 3) e melhorias P2 (item 4).

---

## 2. Bugs encontrados e CORRIGIDOS (código — ⚠️ ainda não commitado)

O teste revelou 5 bugs reais do app + 1 de infraestrutura. Sem essas correções, a demo de sábado imprimiria documentos com campos em branco. **Arquivos alterados (working tree, aguardando commit/PR + deploy):**

1. **P0 — Campos preenchíveis saíam EM BRANCO no documento impresso.** `LaudoPrintable` não repassava `fillableValues` ao `CanvasStage` — tudo que o MV digita no modal (causa mortis, procedimento autorizado, suspeita clínica…) aparecia no preview mas **não na impressão/PDF**.
   `src/components/canva/LaudoPrintable.tsx` (+1 linha: `fillableValues={content.fillable_fields}`)
2. **P0 legal — Receita de Controle Especial imprimia TODOS os medicamentos** (não controlados juntos) e o Receituário simples imprimia o controlado. Implementado `filter` no elemento Repeater (`{field:'is_controlled', equals:true[, negate]}`), aplicado em ponto único (`readRepeaterItems`) usado pelo renderer **e** pela paginação.
   `src/lib/canva/elements.ts` · `src/components/canva/editor/ElementRenderers.tsx` · `src/components/canva/LaudoPrintable.tsx` · templates atualizados via `scripts/seed-default-canva-templates.mjs --clinic <bicho-mania>`
3. **P1 — Corrupção de texto clínico:** a sanitização de "separadores órfãos" comia palavra de unidade no fim da linha — "Jejum alimentar de 8 **horas**" imprimia "Jejum alimentar de 8". Regex agora só remove unidade órfã sem dígito antes.
   `src/components/canva/editor/ElementRenderers.tsx`
4. **P1 — "OBS:" órfão em todo item de receita** sem orientação (`hideIfEmpty` testava a string final, que sempre contém o prefixo estático). Agora testa se algum `{{campo}}` resolveu valor.
   `src/components/canva/editor/ElementRenderers.tsx`
5. **P1 — Solicitação de Exames imprimia código cru** (`raio_x`, `hemograma`) em vez do rótulo. Mapa `EXAM_TYPE_LABELS` no `resolve-context.ts` (texto livre "outro" passa direto).
   `src/lib/canva/resolve-context.ts`
6. **P0 infra — bucket `user-signatures` NÃO EXISTIA no Supabase** — o upload de assinatura eletrônica do MV (Gestão > Usuários) estava quebrado para todas as clínicas desde sempre. **Bucket criado em produção** (public, 2MB, png/jpeg/webp) — já resolvido, sem deploy necessário.

Ajustes normativos no seed dos layouts (aplicados só na Bicho Mania por ora):
- Receituário: validade corrigida de 30 → **10 dias** (orientação CFMV; RDC Anvisa 471/2021 p/ antimicrobianos). Na RCE os 30 dias permanecem (correto — Port. 344/98).

**⚠️ Ações necessárias antes de sábado:**
1. Commitar as correções (branch `fix/` + PR, ou incluir no pacote atual) e **deployar** — sem o deploy, o filtro de controlados e os fillables não funcionam em produção.
2. Após o deploy, rodar `node scripts/seed-default-canva-templates.mjs` (sem `--clinic`) para propagar o filtro de controlados às demais clínicas Free.

---

## 3. Gaps de CADASTRO da Bicho Mania (não são bugs de layout)

O cabeçalho institucional dos 9 documentos renderiza só o que existe no cadastro. Hoje a Bicho Mania está **sem CNPJ, endereço, telefone e cidade/UF** — o cabeçalho sai só com logo + nome, e a linha "Cidade/UF, data" sai só com a data. A Res. 1.321/2020 (Art. 3º, IV) **exige** endereço e telefone do estabelecimento no documento.

| Dado faltante | Efeito no documento |
|---|---|
| CNPJ, endereço, telefone, cidade/UF da clínica | Cabeçalho incompleto; "Cidade/UF" vazio na linha de data (não conforme Art. 3º) |
| Nenhum MV da clínica com CRMV cadastrado (Beatriz = admin sem CRMV) | Documento sem CRMV se emitido por ela |
| Assinaturas eletrônicas não subidas (feature estava quebrada — item 2.6) | Espaço de assinatura em branco |

**Recomendação:** preencher o cadastro da clínica usada na demo de sábado (Configurações) e subir a assinatura do MV apresentador — 10 minutos que mudam a cara do documento.

---

## 4. Melhorias P2 (não bloqueiam sábado)

1. **RCE:** Port. 344/98 Art. 52 §1º pede quantidade **em algarismos + por extenso**. O modelo de dados de prescrição não tem "quantidade total" (ex.: "15 (quinze) comprimidos") — exigiria campo novo em `prescriptions`.
2. **TCLE Cirurgia/Anestesia:** Anexo VIII pede campo "tipo de procedimento anestésico indicado"; adicionar fillable.
3. **TCLEs:** Anexos preveem "Observações de interesse" do MV e do tutor; adicionar fillable opcional.
4. **Atestado de Saúde:** o sufixo "dias" do placeholder some quando preenchido — trocar rótulo para "Validade deste atestado (dias):".
5. **Receituário de antimicrobiano de uso humano:** RDC 471/2021 exige 2 vias com retenção — avaliar aviso/segunda via automática quando a prescrição contiver antibiótico.
6. **Data por extenso:** "São Paulo/SP, 15 de julho de 2026" ficaria mais formal que "15/07/2026" na linha de cidade/data.

---

## 5. Comparação com a Almavet (somente leitura — nada alterado)

A Almavet tem 18 templates próprios usando as mesmas tags dinâmicas (nenhum campo que os padrões não usem). Os 9 padrão cobrem o núcleo CFMV; a Almavet cobre casos operacionais extras que valem entrar no pacote padrão no futuro: **Encaminhamento**, **Orientações pós-operatórias**, Termo de Sedação (separado), Tricotomia, Uso de Imagem, Doação de Sangue, Não Aceitação de Internação, Não Aceite de Conduta, Liberação de Corpo, Autorização de Exames (TCLE Anexo III).

---

## 6. Evidências

- 28 capturas A4 reais (794×1123): `C:\SysMax\.tmp\layout-screens\`
- Scripts do teste (seed/captura/limpeza): `C:\SysMax\.tmp\seed-layout-test.mjs`, `capture-layouts.mjs`, `cleanup-layout-test.mjs`
- Typecheck: sem erros novos (erros pré-existentes só em healthmax-app/Marketing/testes antigos). Testes unitários do motor canva: 45/45 PASS.
