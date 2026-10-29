# Sprint Faseada — Clínica Animais (Develey e Dias)

*Início: 30/08/2026 · Contrato 1 assinado 28/08 (4 meses de dev, R$580/mês) · Fonte de verdade do desenvolvimento.*
*Regra de condução (Diretor, retificada 30/08): o desenho/discussão é POR FASE. Fase desenhada e aprovada → executar TODAS as peças até finalizar a fase, sem interromper a cada alteração; reportar progresso em checkpoints. Ao concluir a fase, discutir/desenhar a próxima. Investimento externo fica em etapa separada (ativação sob demanda).*

**Legenda:** ✅ já existe no sistema · 🔨 desenvolver · 🔗 integração (doc mapeada) · 💰 depende de investimento externo · 👤 depende de ação do cliente · ⏳ pendente · ▶️ em andamento · ✔️ concluído

---

## FASE 0 — Fundação *(sem custo externo)* — ✔️ CONCLUÍDA (todos os itens no dev; só falta amarrar emissão real do nº na criação da OS — item 0.9)
- [x] 0.1 ✔️ Ordem de Serviço [DADOS 0423 | check-in commit ef42efbe] — nº de OS gerado no check-in via next_document_number (gateado); a OS (consultation) já dispara exames/laudo/cobrança no fluxo existente
- [x] 0.2 ✔️ Cadastro único de tutor/pet válido nos 3 CNPJs + empresa faturante [commit d4f43c31] — arquitetura "empresa faturante dentro de 1 tenant": cadastro único natural (1 clinic_id) + **cadastro de Empresas Faturantes** (Gestão>Config>Empresas) + seleção da empresa no check-in (grava billing_company_id)
- [x] 0.3 ✔️ Agenda integrada + fila por setor [B1 commit 53345baa + B2 commit 197f6b2c] — Dr. responsável no check-in (grava vet_id) + config 'Exigir responsável' (Gestão>Config>Geral) + toggle "Painel por setor" na recepção (Kanban mostra o Dr por card) + fila do vet filtra "Minha fila (sem responsável + meus) / Todos" com badge do responsável. Retrocompatível p/ as demais clínicas
- [x] 0.4 ✔️ Tags de entrada na OS: TUTOR DIRETO (B2C) × ENCAMINHADO POR PARCEIRO (B2B) [commit ef42efbe] — no check-in, com select da clínica parceira (0.8); badge B2B na fila
- [x] 0.5 ✔️ (parcial) Estados do paciente na OS — máquina de estados já existe no `status` e o **Painel por setor** (Kanban) mostra onde cada pet está + Dr responsável + urgência. ⏳ **Painel de TV (tela cheia sala de espera) + chamada de nome/sala = ADIADO pelo PO (Próximos Saltos)**
- [x] 0.6 ✔️ Priorização por urgência (triagem com cor) [captura commit ef42efbe + reordenação commit a601ebff] — verde/amarelo/vermelho no check-in; **emergência FURA a fila** (recepção, fila do vet e cada coluna do painel ordenam 🔴→🟡→🟢, empate por horário); badges nos cards. Retrocompatível
- [x] 0.7 ✔️ Captura automática de faturamento [commit d4f43c31] — todo serviço/medicação lançado em qualquer setor já entra na conta da OS (consultation_services, anti-perda) E agora carrega a **empresa faturante** (company_id herdado do billing_company_id da OS). Quebra por empresa no recebimento = Fase 1
- [x] 0.8 ✔️ **Cadastro de Clínicas Parceiras** [DADOS ✔️ partner_clinics (0423) | UI ✔️ commit 2a9ef5d3] (aba em Cadastros, gateada por flow_config.animais_foundation) — CRUD B2B: CNPJ/CRMV/contato/endereço + tabela de preço vinculada + comissão/coparticipação OPCIONAL (ativável). Cálculo do repasse = Fase 1.5
- [x] 0.9 ✔️ **Mecanismo de numeração configurável** [DADOS ✔️ migration 0421 | UI ✔️ commit e991e089] — dados: document_number_sequences + função atômica next_document_number (testado 204456→204457→204458). UI: **Gestão > Configurações > Numeração** — número inicial/próximo + prefixo + zero-fill por tipo de documento (OS/RPS/NFS-e/orçamento/recibo) e por empresa faturante (ou Geral); preview ao vivo. Mantém a numeração atual (usuário informa o próximo nº). Falta amarrar a emissão real ao criar a OS (bloco 0.1)
- [x] (base) ✔️ **Empresas faturantes (multi-CNPJ)** — tabela `companies` (migration 0421 no dev), 3 CNPJs sob 1 tenant, testado (contador por tipo de documento e por empresa faturante) — nº de OS, nº de RPS, nº de NFS-e e futuros; número inicial + série parametrizáveis. Reusado na Fase 1 (NFS-e)
- [x] 0.10 ✔️ **Precificação** [DADOS ✔️ migrations 0422+0424 | UI ✔️ commits 2a9ef5d3 + 64848a07 + 7bf93900] — (a) **Gestão > Configurações > Preços** (movido de Cadastros): gestão das **5 TABELAS DE PREÇO**; (b) no cadastro de produto/serviço (Estoque): **2ª ABA "Preços"** (separada da aba principal) com composição **SIMPLES** (custo/imposto/margem) OU **COMPLETA** (preço de compra → desconto fornecedor → impostos entrada ICMS-/ST/IPI/Frete/IBS-CBS → preço de custo calculado → margem/markup → impostos de venda) + **grade de preços por tabela**. Gateado por animais_foundation
- [x] 0.11 ✔️ **Configurações de preço** [DADOS ✔️ pricing_settings (0422+0424) | UI ✔️ commits 2a9ef5d3 + 7bf93900] — em Gestão > Configurações > Preços: (a) tabela padrão B2C; (b) precedência produto x cliente; (c) **composição simples x completa**; (d) **cálculo margem x markup**; (e) hierarquia documentada. ⚠️ Convenção de sinal dos impostos de entrada (ICMS crédito=subtrai; ST/IPI/Frete/IBS-CBS somam) seguiu o modelo da tela do cliente — confirmar com Vinícius/Aline no teste


## DECISÕES DE DESENHO — FASE 0 (30/08, aprovadas pelo PO)
- **Multi-CNPJ = "empresa faturante" dentro de UM tenant** (opção A). Grupo Animais = 1 tenant; 3 empresas (Emp 001/002/003 = 3 CNPJs) como entidades de faturamento. Mesmo acesso/login; UMA OS por visita; serviços apontam a empresa faturante; no recebimento o montante da OS é quebrado por empresa → contas a receber e NFS-e SEPARADOS por CNPJ. Bônus: resolve o cadastro único (0.2) naturalmente e vira recurso de produto p/ grandes clientes multi-CNPJ. Quando unificarem os 3 CNPJs, some a complexidade sem retrabalho.
- **Nº de atendimento (OS):** sequencial legível configurável (número inicial parametrizável). ⚠️ Perguntar ao Vinícius: continuar a numeração atual deles ou iniciar do 0.
- **Urgência (triagem por cor):** 🟢 verde=comum · 🟡 amarelo=risco · 🔴 vermelho=emergência (fura a fila).

## FASE 1 — Financeiro / Administrativo *(dores Aline + Bruna)*
- [x] 1.1 ✔️/👤 Conciliação de cartões — CAMADA NOSSA FEITA (CardReconciliation + parser Sipag XLSX/EDI + matching NSU/valor/parcela + relatório prévio 3 grupos + "Incluir e conciliar" + detectar cartões não cadastrados). 👤 falta arquivo/EDI real Sipag + API parceiro FinPet (cliente/Aline liberar)
- [x] 1.2 ✔️ Recebíveis por adquirente (NSU, taxas, pendências) — em produção
- [x] 1.3 ✔️/👤 Conciliação bancária — FEITA (ConciliacaoTab 2 painéis, OFX + API Sicoob Conta Corrente v4 gated, F3 opções, N:1 vínculo/conciliar/ignorar, EXTRATO=movimentos efetivos). 👤 falta Client ID + e-CNPJ A1 Sicoob por conta
- [x] 1.4 ✔️ Visão cruzada entre os 3 CNPJs — FEITA (aba CNPJs / CrossCompanyTab: recebido/pago/saldo + crédito por empresa; inter-CNPJ eliminado após auditoria 05/09)
- [x] 1.5 ✔️ Motor de repasses profissionais + comissão de parceiras + tela de pagamento — FEITO (comissões por item %/valor no cadastro do profissional → contas a pagar; payCommissions; pagamento de labs parceiros F1/F3; baixa em massa genérica). NFS-e desmembrada = 1.A
- [x] 1.6 ✔️ Crédito global do cliente nas 3 empresas (transferência inter-CNPJ automática) — FEITO (adiantamento no caixa + applyTutorCreditToInvoice com partida dobrada inter-CNPJ + reconciliação corrigida 05/09: adiantamento=passivo, receita no consumo, credit_balance fora do caixa)
- [x] 1.7 ✔️ Livro de Controlados digital — FEITO no dev 05/09 (deploy sysvetmax-ht98b622g). Migration 0441 (stock_items.substance/concentration/is_human_use/control_class); action getControlledBook (une stock_movements + sale_items do PDV, razão por substância, saldo inicial+entradas/saídas/perdas/saldo, humano×veterinário); relatório "Livro de Controlados" em Relatórios (sintético por substância + analítico cronológico expansível, botão "Último ano" retroativo + Imprimir/PDF p/ Vigilância); campos substância/concentração/lista 344/uso humano no cadastro do item controlado. FALTA (P2): nº de notificação de receita e capturar saída de applied_medications em consulta (hoje cobre PDV+internação+ajustes).
- [x] 1.8 ✔️ Compras: entrada por XML de NF-e → estoque + **contas a pagar** — FEITO no dev 05/09 (deploy sysvetmax-50d1s2oi2). Migration 0440; flag "Lançar contas a pagar?" no Confirmar da entrada (default on, off em bonificação); parcelas pré-preenchidas pelas duplicatas do XML (`<cobr>/<dup>`) ou "gerar N iguais"; espécie; amarra fornecedor/NF/parcela/vencimento; idempotente. XMLs já são armazenados (xml_content). Cai no Contas a Pagar com filtros + baixa em massa.
- [ ] 1.9 ⏳ Conferência do convênio AVA (matching OS × repasse) — NÃO INICIADO; PO decidiu que depende do Portal do Tutor (Fase 3), então adiado
- [x] 1.10 ✔️/👤 PAGFOR — Pagamento a Fornecedores — CAMADA NOSSA FEITA (aba PAGFOR: importar DDA CSV → verde/vermelho → lançar mantendo dados → agendar → remessa rascunho; migration 0430). 👤 falta habilitar DDA + convênio de pagamento no banco + CNAB240/API real do banco
- [x] 1.A 🔨✔️/💰 **NFS-e automática no checkout (Focus NFe) — MÓDULO FEITO no dev 05/09 (deploy sysvetmax-i7q7f9ciq)** — emissão DESMEMBRADA por empresa faturante (1 nota por CNPJ), automática no checkout (toggle) ou por confirmação. Migration 0439 (company_fiscal_config + billing_documents.company_id + nfse_auto_checkout); config fiscal por empresa na aba Empresas (botão "Fiscal"); fallback p/ config da clínica (retrocompat 1-CNPJ). ⏳ ATIVAR emissão real depende do token/custo Focus NFe por empresa (💰 cliente). Falta: cancelamento de NFS-e + webhook de status. ⚠️ Janela: emissor atual vence OUT/2026
- [ ] 1.B 💰👤 **TEF / recebimento na maquininha (Smart TEF via POS Controle ou Connect TEF)** — fase 2 do financeiro; depende de licença (investimento) + escolha do integrador

## FASE 2 — Laboratório *(docs mapeadas)*
- [x] 2.1 ✔️/👤 Interfaceamento URIT BH-5100 (hematologia) — pilha FEITA (agente MLLP + parser ORU + ingestão em exam_results). 👤 falta conexão física (AnyDesk/rede/ligar "transmitir p/ host" no aparelho). Pendente nosso: gráficos (histograma/scattergram das tags ED) + mapeamento analito→catálogo
- [x] 2.2 ✔️/👤 Interfaceamento bioquímico **BIOBASE** (BK-200; era rotulado "MaxBio/Sérum 200") — MESMO listener/protocolo (HL7 2.3.1/MLLP, sending-app BIOBASE). 👤 idem 2.1 (só valores numéricos, sem gráficos)
- [x] 2.3 ✔️/👤 Worklist bidirecional por código de barras — FEITO (agente responde QRY^Q02→DSR^Q03; etiqueta Code128 do tubo imprimível; "bipar amostra"→exames vinculados; getExamsBySample). 👤 falta conexão física
- [x] 2.4 ✔️ Tela de conferência e liberação do resultado pelo MV — FEITO no dev 07/09 (deploy sysvetmax-g3apj8y8c). Migration 0444 (exam_results); ExamResultsPanel no ExamDetail (entrada manual de analitos + import HL7 + "Conferir e liberar", só MV/admin; liberado é imutável). Parser HL7 (parseHL7ORU) pronto p/ os aparelhos.
- [x] 2.5 ✔️/👤 Agente-ponte local (nuvem→LAN) — FEITO (lab-agent/ Node standalone, MLLP server + ponte HTTPS + fila retry; rotas /api/lab/{ping,worklist,results}; tabela lab_agents; UI Gestão>Config>Laboratório gera código + **Baixar (.zip) instalador**; install.ps1 registra serviço via Scheduled Task; **node.exe portátil servido em /lab-agent/node.exe → dispensa Node no PC**; seletor de ambiente dev/prod; E2E validado). 👤 falta só AnyDesk + rede do lab
- [ ] 2.6 ⏳ **Itens adicionais do laboratório/exames** — o PO detalhará ao chegarmos na Fase 2 (há pedidos extras do Vinícius/Aline ainda não listados)

## FASE 3 — Diagnóstico por Imagem + Portal
- [ ] 3.1 🔗 Worklist ASL — a OS alimenta o aparelho (API JSON). 👤 formalizar com gerente ASL
- [ ] 3.2 🔨 Kanban de SLA por setor com alertas (substitui o mapa manual do Vinícius)
- [ ] 3.3 ✅/🔨 Editor de laudos com templates por exame + relação profissional × documento
- [x] 3.4 ✔️ **Portal / Ambiente do Tutor** (evolução do Portal de Laudos — decisão 30/08) — o atual é do Vertis; desenvolver o nosso com: (a) publicação de resultados/laudos ao cliente + WhatsApp na hora; (b) tutor vê a agenda e marca a própria consulta; (c) tutor informa dados de pré-consulta (o antigo item de pré-check-in, incorporado aqui); (d) tutor acompanha exames e laudos pelo portal — **EM PRODUÇÃO desde 24/09/2026** (virada `2b93ab47`), junto do Portal do Parceiro, visualizador DICOM, chat, pré-consulta e agendamento online. Flag `portal_enabled` (hoje OFF na Animais — ligar após validação).
- [ ] 3.4.1 🔨 **Portal white-label por clínica** — aprovado pelo Diretor 24/09; branch `feature/portal-white-label`. Hoje o portal troca só logo/nome e **desliga a marca quando o tutor tem 2+ clínicas**; cores e fonte são fixas no código (paleta da Animais), e não há contexto de clínica na URL. Entregar: (1) `/portal/c/<slug>` com retrocompatibilidade dos links já enviados; (2) tema por clínica (cores/fonte/capa) em variáveis CSS, configurável em Gestão › Configurações com preview, default = paleta atual; (3) seletor de clínica para tutor multi-clínica, mostrando só os pets daquela clínica. Isolamento `(tutor_id, clinic_id)` inalterado — contexto na URL **não** amplia acesso. Migrations a partir de 0476. **Alvo: próxima leva de produção.** ⚠️ Não vender o portal como white-label antes desta entrega.
- [ ] 3.5 🔗💰👤 Captura de imagens da Ambra (API v3: login→study/list por accession→link/add). 👤💰 depende do ajuste de contrato do cliente com a Ambra

## FASE 4 — Centro Cirúrgico + Estoque *(sem custo externo)*
- [ ] 4.1 🔨 Kit cirúrgico por procedimento — débito dos insumos usados + **devolução automática do não-usado ao estoque** (necessidade nº1 do Vinícius)
- [ ] 4.2 🔨 Checagem de pré-anestésicos e jejum na OS (fluxo desenhado pelo Vinícius)
- [ ] 4.3 🔨 Registro técnico-cirúrgico (opcional) + mapa das cirurgias do dia
- [ ] 4.4 🔨 Estoque: endereçamento de prateleira + sugestão de compra pela saída + alertas de validade
- [ ] 4.5 ✅ Internação completa — JÁ PRONTA; flufo desenhado junto quando a expansão chegar (futuro)

## FASE 5 — Gestão / Diretoria *(sem custo externo)*
- [ ] 5.1 🔨 Painéis por setor e por empresa (produção, SLA, financeiro, estoque) em tempo real
- [ ] 5.2 ✅/🔨 DRE + centro de custos / lucro por área (DRE G13 e Plano de Contas existem; recorte por setor a validar)

## MIGRAÇÃO *(na virada para operação definitiva)*
- [ ] M.1 👤 Export do Vertis (cadastros, pets, exames, financeiro) — ação do cliente
- [ ] M.2 🔨 Migração dos dados para o SYSVETMAX (backup estruturado ou planilhas)

## LAYOUTS *(Contrato 2 — faturado pós-validação)*
- [ ] L.1 🔨 ~500 layouts de documentos — parametrizar valor de referência/unidade (base ~única). 60h.

## ★ PRÓXIMOS SALTOS *(visão futura — fora do escopo dos 4 meses)*
- TVs com painel de SLA por setor · Painel de chamada na recepção (MV chama paciente) · Agentes de IA por setor (Compras etc.)

---

## 💰 Bloco de INVESTIMENTOS EXTERNOS (ativação sob demanda do cliente)
| Item | Fase | Custo/dependência | Observação |
|---|---|---|---|
| Focus NFe (emissão NFS-e real) | 1.A | token/custo Focus NFe | módulo desenvolvido antes; ativa quando pagar. Janela OUT/2026 |
| POS Controle / Connect TEF (TEF) | 1.B | licença por maquininha | recebimento automático na maquininha; fase 2 |
| Ambra (API de imagens) | 3.5 | ajuste de contrato c/ a Ambra | cliente negocia valor com o comercial Ambra |

## Ambiente
- Desenvolvimento no ambiente de testes (branch dev / sysvetmax-dev) e validação com o cliente antes da virada. Feature flags por clínica (ativa só na Animais; zero impacto nas demais).
