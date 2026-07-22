# Blueprint — Setor Administrativo · Grupo Animais (Ribeirão Preto)

*Rascunho v0.9 · 21/07/2026 · Capítulo 1 do plano de solução (base do contrato). Uso interno SysMax — versão para o cliente será formatada após fechamento das pendências.*

---

## 1. Contexto

**Setor:** 2 colaboradoras (Aline e Bruna) respondendo por todo o financeiro, faturamento, compras/estoque, controlados e apoio geral das 3 empresas (Sipag Lab · Sipag Clínica · FinPet Imagem — cada setor com sua maquininha, 1 banco por CNPJ).

**Custo atual de sistemas (âncora):** R$ 2.840,72/mês ≈ R$ 34,1 mil/ano (Vertis R$ 1.773,15 cobrado POR LAUDO + emissor de notas R$ 89,70 + manutenção de servidor/PCs R$ 977,87) — sem contar ~R$ 10 mil já investidos em servidor local e as horas de trabalho manual abaixo.

## 2. Dores quantificadas

| # | Dor | Evidência (na voz delas) | Custo hoje |
|---|-----|--------------------------|------------|
| 1 | **Conferência de cartões manual** | "O dia inteiro se estiver [só nisso]… para a conferência de 25 dias, 1 ou 2 semanas" | **~25–50% do mês da Bruna** |
| 2 | **Conciliação bancária abandonada** | "Era feita em 2 dias… agora isso não é mais possível" | **Hoje NINGUÉM confere sistema × banco** — 289 lançamentos/mês sem verificação; erro/desvio fica invisível |
| 3 | **Recebimento na empresa errada** | "Tudo separado, MAS acontece aquela exceção com alguns clientes, o que não deveria" | Transferência inter-CNPJ + baixa manual + caça ao lançamento |
| 4 | **Splits de profissionais manuais** | "Rateados em parcelas, tem que fazer manual 1 por 1… demanda muito tempo" (diário + quinzenal, 3 profissionais) | Horas recorrentes + risco de erro em % |
| 5 | **NFS-e em lote atrasada** | "Passei a manhã emitindo notas da quinzena… pessoal vai pedindo e vou anotando" | Manhãs inteiras; notas agrupadas (exposição fiscal de competência); Develey sem solução no Vertis (split) |
| 6 | **Livro de controlados parado** | Livro físico ~1 ano sem colar; Excel ~2 meses atrasado | Passivo sanitário acumulado há 1 ano |
| 7 | **Compras/estoque sem XML** | "Tudo manual, o Vertis não integra XML nem estoque" | Redigitação de notas de entrada; vencimentos em planilha |
| 8 | **Convênio AVA conferido OS a OS** | "Manual, diariamente, ordem de serviço uma a uma" | Rotina diária evitável |

## 3. Soluções propostas

### 3.1 Conciliação de cartões + TEF *(ataca dores 1 e 3 — a maior alavanca de ROI)*
- **Já existe no Sysvetmax:** recebíveis por adquirente com NSU, taxas configuráveis, pendings por transação.
- **Fase 1 — importadores dos extratos (layouts REAIS confirmados com amostras do cliente em 21/07):**
  - **Sipag** ("Relatório de vendas recebidas detalhado", 28 colunas): estabelecimento (CB-…), data/hora da transação, nº transação, ID Venda (**RRN**), bandeira, forma de pagamento, plano, parcela N/N, **nº autorização**, tipo de cartão, terminal, tipo de captura, indicador crédito/débito, **indicador de cancelamento** (linhas negativas = estorno), data prevista de liquidação, status, **data do pagamento**, banco/agência/conta, **valor bruto, desconto (MDR), valor líquido**. Chave de matching: RRN + autorização + data/hora + valor bruto.
  - **FinPet** ("Recebimentos do estabelecimento", 11 colunas, visão por recebimento/parcela): data da transação, valor da transação, valor da parcela, parcelas (1/N), **valor bruto do recebimento, código de autorização**, bandeira, **"Nome do Cliente" = nº da OS + nome do pet + tutor** (ex.: "204456 Nick - Osmar…"), **valor líquido do recebimento** (bruto − líquido embute o SPLIT do profissional), data original do recebimento, status. Chave de matching: nº da OS no campo cliente (quase determinístico) + autorização + valor.
  - **Condicional por clínica:** toda a funcionalidade nasce atrás de configuração (feature flag por clínica) — ativa apenas na Clínica Animais; zero impacto nas demais clínicas da base.
- **Fase 2 (após aprovação do plano por Vinícius e Ana):** (a) **TEF via Smart TEF com POS Controle + FinPet (Transação Remota)** — captura automática da transação na maquininha (NSU, bruto/líquido, taxa, parcelas, CNPJ correto na origem — elimina a "exceção da máquina errada" na raiz); (b) **importação automatizada dos arquivos** (EDI Sipag — habilitar Código EDI cedo, não é retroativo — e arquivo programado FinPet) para conciliação bancária e de cartões sem ação manual.
- **Resultado esperado:** conferência de 25 dias cai de 1–2 semanas para **horas** (fase 1) e para **contínua/automática** (fase 2); divergências apontadas pelo sistema, não caçadas.

### 3.2 Conciliação bancária com OFX *(ataca dor 2)*
- **Desenvolver:** importação de arquivo OFX dos 3 bancos + tela de conciliação (lançamentos do sistema × extrato, busca por valor/data/empresa, visão cruzada entre CNPJs — o lançamento "perdido" aparece na empresa vizinha).
- **Resultado esperado:** religar uma rotina que hoje **não existe mais** — de "impossível" para rotina diária de minutos. Volume atual (289 lançamentos/mês) é confortável para matching assistido.

### 3.3 Motor de splits + NFS-e desmembrada *(ataca dores 4 e 5 — diferencial que o Vertis admite não ter)*
- **Já existe:** NFS-e por CNPJ no checkout (Focus NFe), arquitetura de split de convênio como base.
- **Desenvolver:** cadastro de % por serviço/profissional → no fechamento (diário/quinzenal), gera automaticamente contas a receber (clínica) + contas a pagar (profissional) + **NFS-e com valores desmembrados**; emissão automática ao finalizar o atendimento/exame com envio por e-mail.
- **Resultado esperado:** as manhãs de emissão desaparecem; a Develey (que ficaria de fora do módulo do Vertis) é atendida; nota por atendimento na competência correta (elimina a exposição fiscal do agrupamento — argumento para a diretoria).
- ⚠️ **Janela crítica: entregar antes de OUTUBRO/2026** (vencimento do emissor atual e data em que planejam contratar o módulo do Vertis).

### 3.4 Crédito global do cliente *(ataca dor 3, lado do cliente)*
- **Desenvolver:** saldo de adiantamento visível nas 3 empresas; ao usar, o sistema faz a transferência inter-CNPJ e a baixa automaticamente.

### 3.5 Livro de Controlados digital *(ataca dor 6)*
- **Já existe:** estoque com `is_controlled` + lotes FIFO + validade; receita de controlado com CRMV obrigatório (constraint de banco); dispensação da farmácia.
- **Desenvolver:** razão por substância (entradas via XML/lote − saídas via dispensação vinculada à receita/tutor/pet = saldo, com trilha de auditoria) + **relatório mensal em 1 clique no formato aceito pela Vigilância** (impresso e colado no livro físico — exigência da Port. 344/98) + **geração retroativa das folhas do passivo de 1 ano**.
- **Resultado esperado:** o livro se escreve sozinho; o atraso de 1 ano se resolve numa tarde de conferência. *Upside a confirmar: aceite de livro 100% digital pela VISA local.*

### 3.6 Compras com XML → estoque + contas a pagar *(ataca dor 7)*
- **Já existe:** módulo Compras com importação de XML NF-e, fornecedores, NCM.
- **Desenvolver:** ligação da entrada às parcelas do contas a pagar + armazenamento dos XMLs para a contadoria (Campez) + alertas de vencimento de medicamentos pelo lote (mata a planilha de validades).

### 3.7 Conferência do convênio AVA *(ataca dor 8)*
- **Desenvolver (fase 2 do setor):** matching automático OS × repasse do convênio. *(Detalhar o formato do repasse antes de especificar.)*

## 4. Fora de escopo deliberado (pedido delas)
Boletos automatizados ("café pequeno") · cashback AVA (manual e fácil) · folha/RH (contador) · previsão de pagamentos variáveis de vets (sem padrão automatizável — mas o relatório de comissionamento sobre recebimentos sai como subproduto do motor de splits).

## 5. ROI resumido (para a conversa de custos)

| Frente | Hoje | Com Sysvetmax |
|---|---|---|
| Conferência de cartões | 1–2 semanas por ciclo | Horas, com divergências apontadas |
| Conciliação bancária | Abandonada (risco invisível) | Rotina diária de minutos |
| Emissão de NFS-e | Manhãs inteiras, em lote | Automática por atendimento |
| Splits | Manual, 1 a 1 | Fechamento em 1 clique |
| Livro de controlados | 1 ano de atraso | Automático + retroativo gerado |
| Custo de sistemas | R$ 2.840/mês (3 sistemas + servidor, cobrado por laudo) | 1 sistema, preço fixo, sem servidor local |

## 6. Pendências para fechar o capítulo
1. ~~Exemplo de extrato exportado (Sipag e FinPet)~~ ✅ RECEBIDOS e mapeados (21/07).
2. ~~Verificação técnica das adquirentes e cobertura Focus NFe p/ Ribeirão Preto~~ ✅ CONCLUÍDAS (21/07): conciliação viável nas duas; TEF com caminho documentado (SiTef p/ Sipag; Transação Remota p/ FinPet); Focus NFe cobre Ribeirão Preto (exige liberação de RPS na prefeitura + homologação→produção).
3. Export de dados do Vertis (migração de cadastros/histórico) — única pendência aberta.

**Decisões de arquitetura (21/07, PO):** (a) Fase 1 = importação MANUAL das planilhas de cada adquirente, **sempre atrás de configuração por clínica** (ativada só na Animais; sem impacto nas demais); (b) Fase 2, condicionada à aprovação do plano por Vinícius e Ana = **TEF com Smart TEF via POS Controle + FinPet** e importação automatizada dos arquivos de conciliação bancária e de cartões.

*Decisões de escopo (21/07):* tabela de splits NÃO será levantada — os % são variáveis, então a solução é **tela de parametrização pela própria Aline** (% por serviço × profissional), já contemplada em 3.3. "Fiados" descartado do levantamento — fluxo pequeno demais para priorizar.
