# Fase 1 — Financeiro/Administrativo (Clínica Animais) — ✅ APROVADO P/ EXECUÇÃO (01/09)

*Desenho colaborativo por grupo concluído com o Diretor. Aprovado para começar a construir em 01/09. Fonte da verdade da Fase 1. Mesmo fluxo da Fase 0: gateado por flag, aditivo, worktree C:\sysvetmax-dev, deploy no sysvetmax-dev, reportar em checkpoints.*

## SEQUÊNCIA DE EXECUÇÃO APROVADA
0. **Fundação financeira** (pré-requisito): cadastro de bancos/contas vinculado à empresa + razão/lançamentos (partida dobrada) — base para 1.3/1.6/1.10.
1. **1.6 Adiantamento/Crédito** (config + botão no Caixa + uso com transferência inter-CNPJ) — fully designed, sem dependência externa.
2. **1.5 Repasses de profissionais** (+ comissão de parceiras) + tela de pagamento de comissão.
3. **1.8 Compras → Contas a Pagar** (flag "Lançar contas a pagar?") + **1.10 PAGFOR** (DDA + Pagamento a Fornecedores).
4. **1.1/1.2 Conciliação de cartões** (API + arquivo, matching, relatório prévio).
5. **1.3 Conciliação bancária** (Sicoob API + OFX, tela 2 painéis, F3) + **1.4 visão cruzada CNPJs**.
6. **1.9 AVA** (matching OS × repasse convênio).
7. **1.7 Controlados** (livro por substância, humano×vet separado, retroativo 1 ano).
8. **1.A NFS-e Focus NFe** (Diretor detalha depois; janela OUT/2026) e **1.B TEF** (por último; investimento).

*Ordem ajustável: NFS-e sobe na fila se o Diretor detalhar antes de OUT/2026. Cartões/bancária dependem de credenciais do cliente (EDI Sipag, Client ID Sicoob, DDA/Pagfor por banco).*

Regra: registrar fielmente as decisões do Diretor; executar aditivo/gateado.

---

## GRUPO A — Recebimentos & Conciliação — ✍️ DESENHADO PELO DIRETOR (31/08)

### 1.1 · Conciliação de CARTÕES (decisão do Diretor)
- **Duas fontes de ingestão:** arquivo (OFX/EDI da adquirente) **E** API — mesma tela.
- Sistema busca o extrato da adquirente e **cruza** por: nome, data, data de vencimento, parcela, NSU, valor bruto, valor líquido, taxa (MDR), etc. → monta o **vínculo automático**.
- **Relatório PRÉVIO** na tela (imprimível/salvável): detalhado e ordenado, mostrando (a) o que já foi encontrado/vinculado, (b) o que já foi **baixado anteriormente** (idempotência — não reconciliar 2x), (c) o que **não foi encontrado** no sistema.
- Depois do prévio → tela com 3 grupos: **títulos vinculados · títulos divergentes · títulos não encontrados**.
- Usuário pode **buscar títulos** para ajustar; ao **vincular um título divergente**, os dados são **atualizados automaticamente com os dados do extrato**.
- Separação por **legenda colorida simples** (visual).

### 1.3 · Conciliação BANCÁRIA (decisão do Diretor)
- Rotina única com **2 opções (API + arquivo OFX)**, ambas na **mesma tela** de operação.
- **Tela dividida em 2 painéis:**
  - **ESQUERDA = extrato bancário (a "voz da verdade")** — o que realmente movimentou no banco.
  - **DIREITA = títulos do sistema** (baixados), subdividida: **parte superior** = filtrar/selecionar (data, valor, demais dados); **parte inferior** = títulos **vinculados** (prontos para conciliar).
- Ao importar OFX / buscar via API → **amarração automática por comparação** (traz títulos sistema × extrato já vinculados); usuário pode **desvincular** e escolher o título correto.
- Se não encontrar → verificar em **contas a receber / contas a pagar em ABERTO** (casos em que esqueceram de baixar).
- As etapas automáticas já resolvem **~50%** da conciliação.
- Botão **"Opções" (atalho F3)**: (a) **baixar títulos em aberto** para aparecerem e serem vinculados; (b) **inserir títulos** que nem tinham sido lançados no sistema.
- Quando **todos os títulos do extrato** estiverem vinculados → aparece o botão **CONCILIAR**.
- Título que não deve ser conciliado: marcar + **"ignorar"** → fica **riscado ao meio** e fora da conciliação.
- **Ações por título:** vincular / ignorar / desvincular.

### 1.6 · Crédito global do cliente (decisão do Diretor)
- Crédito aparece **só no RECEBIMENTO (Caixa)**, visível a todos os usuários com acesso, e **apenas no cliente que tem crédito pendente** (mesmo que de outra empresa).
- Ao escolher **"utilizar crédito"** → abatido do **valor total do documento**.
- Se o crédito for de **outra empresa** → **transferência automática inter-CNPJ** com **rastreabilidade**.
  - Ex.: crédito R$10 na Emp 001, procedimento na Emp 002 → ao pagar na 002 usa o crédito → sistema lança **2 transações** (débito na 001, crédito na 002) como transações bancárias entre empresas + **baixa** desse valor junto com o recebimento.
- **Relatórios:** localizar créditos utilizados, vendas em que se usou crédito, etc.
- Modelo contábil = **partida dobrada** (débito/crédito) → auditável.

### Pontos a confirmar com o Diretor (Grupo A)
1. ✔️ RESOLVIDO **1.1 fonte do cartão:** duas fontes = **API (preferencial) + ARQUIVO como fallback** quando a API não estiver disponível. "OFX" foi genérico p/ "arquivo"; o parser lê o formato real da adquirente (Sipag EDI 28 col, FinPet). Tela idêntica nas duas fontes.
2. ✔️ RESOLVIDO **1.6 origem do crédito = ADIANTAMENTO.** Botão no Caixa (condicionado a config Gestão>Config "Utiliza adiantamento?") para lançar um valor que o cliente quer usar futuramente em consultas/procedimentos. Casos reais: cliente já em atendimento que sabe que vai voltar e paga a mais p/ "deixar certo", ou já deixa valor adiantado p/ um serviço próximo. (Uso do crédito = já desenhado: abate no caixa + transferência inter-CNPJ por partida dobrada.)
3. ✔️ RESOLVIDO **1.3 conta ↔ empresa = SIM.** Cada empresa tem sua conta; no **cadastro de bancos** vincula-se a empresa cadastrada, sinalizando a qual empresa a conta pertence. Conciliação por conta/CNPJ → alimenta a visão cruzada 1.4.

### 1.10 · PAGFOR — Pagamento a Fornecedores (NOVO, decisão do Diretor 01/09)
Premissa do Diretor: buscar títulos/boletos **emitidos contra o CNPJ da clínica** no período filtrado; tela com **legenda colorida** (verde = já está no sistema; vermelho = não está); marcar os que já estão p/ **pagar no vencimento ou data X**; marcar os que não estão p/ **lançar no sistema mantendo os dados**. Por banco (Bradesco, Itaú, Santander, BB, Sicoob, Sicredi), via **API ou CNAB**.
- ✔️ **VIÁVEL, sem Open Finance.** Mapeamento técnico (pesquisa 01/09):
  - **Buscar boletos contra o CNPJ = DDA (Débito Direto Autorizado):** serviço Febraban/CIP em que o pagador vê num só lugar TODOS os boletos emitidos contra o CPF/CNPJ. Todos os bancos têm (Bradesco, Itaú "varredura DDA", Sicoob, Sicredi "DDA/Agenda de boletos" + Agregador Eletrônico). Consumo via **API do banco** ou **arquivo CNAB/varredura DDA**. Suporta **matriz + filiais** (lotes por CNPJ) → casa com o multi-CNPJ da Fase 0.
  - **Pagar no vencimento / agendar = PAGFOR (Bradesco) / Pagamento a Fornecedores / Multipag:** remessa de pagamento em **CNAB 240 (ou 500) OU API** (Bradesco: certificado .pfx + Client ID/Secret). Agenda pagamento no vencimento ou futuro; **arquivo de retorno confirma o pagamento** → baixa o título.
  - Verde/vermelho + "lançar mantendo os dados" = **camada nossa** de matching + auto-cadastro sobre os dados do DDA.
- **Integra com:** 1.8 (o título vermelho vira lançamento no contas a pagar), 1.3 (o pagamento sai no extrato e reconcilia), 1.4 (por CNPJ). É a "outra ponta" da conciliação: contas a **pagar**.
- **Dependências do cliente:** habilitar **DDA** e o convênio de **Pagamento a Fornecedores** em cada banco + gerar certificado/Client ID por conta.
- Fontes: banco.bradesco (Pagfor/Multipag CNAB 240/500, manual Pagamento Escritural a Fornecedores), Itaú (varredura DDA), Sicoob/Sicredi (DDA), Febraban CNAB 240.

---

## GRUPO B — Repasses & Convênios — ✍️ DESENHADO (01/09)

### 1.5 · Motor de repasse dos profissionais (decisão do Diretor)
- No **cadastro de profissionais**, uma **aba** onde se vincula **serviço/produto → valor OU percentual de comissão** por profissional.
- Isso dá a direção para montar o **valor que a Clínica emite** e o **valor que o Profissional recebe**.
- **Regra (exemplo do Diretor):** exame R$300, comissão R$30 p/ o profissional → o sistema **emite a NFS-e de R$270** (parte da clínica) e **lança R$30 no CONTAS A PAGAR** para o profissional X, "Ref. comissão do documento Y" + detalhamentos.
- **Tela de pagamento de comissão:** usuário seleciona **mês de competência OU período** → sistema traz **todos os títulos do contas a pagar gerados por comissionamento** naquele período **ainda não pagos**.
- Reaproveita a **% de comissão das clínicas parceiras** (cadastro 0.8) para o repasse B2B (mesmo motor).

### 1.9 · Conferência do convênio AVA
- Segue o desenho: matching OS × repasse do AVA (mesma engine de matching da 1.1). (Sem alterações do Diretor ainda.)

---

## GRUPO C — Fiscal (NFS-e Focus NFe) — ✍️ CONFIRMADO (01/09)
- **1.A** segue o desenho apresentado (módulo desenvolvido agora, ativação real depende do token/custo Focus NFe; emissão automática no checkout, 1 nota por CNPJ). Diretor: "aguardar mais um pouco" para detalhar.

---

## GRUPO D — Controlados & Compras — ✍️ DESENHADO (01/09)

### 1.7 · Livro de Controlados (Diretor pediu pesquisa apurada — feita 01/09)
Diretor não opina; exige que **atenda Vigilância Sanitária + MAPA**. Pesquisa (fontes no fim do doc):
- **Base legal:** Portaria SVS/MS **344/1998** + **RDC 22/2014** (instituiu o SNGPC). Receituário: **Notificação de Receita A (amarela, entorpecentes) / B (azul, psicotrópicos)** + **Receita de Controle Especial (branca, 2 vias)**.
- **Livro de Registro Específico:** estoque, entradas, saídas e perdas em **ordem cronológica**, **por substância**. Medicamentos em forma farmacêutica **HUMANA** e **VETERINÁRIA** devem ser escriturados **SEPARADAMENTE** (não no mesmo livro).
- **Licença Sanitária:** estabelecimento veterinário que adquire controlado em forma humana precisa de **Licença de Dispensário de Medicamentos** na Vigilância Municipal + abrir o livro.
- ✅ **Importante:** clínicas veterinárias são **DISPENSADAS do BMPO** (Balanço de Medicamentos Psicoativos) — reduz escopo. Mas mantêm o **livro/escrituração** e podem ser fiscalizadas.
- **Desenho proposto:** razão digital por substância (entrada/saída/saldo/perda, cronológico), **separando forma humana × veterinária**, gerado dos lançamentos que já existem (dispensação + compras) + relatório p/ Vigilância + geração do **retroativo de 1 ano**. Amarra com o "Receituário Azul/Amarelo" já sinalizado no cadastro. ⚠️ Confirmar exigências específicas da Vigilância de **Ribeirão Preto** (formato aceito) na virada.

### 1.8 · Compras: entrada → contas a pagar (decisão do Diretor)
- Amarrar a **entrada ao contas a pagar, COM ou SEM XML** (a maioria das entradas tem financeiro).
- Ao **final da etapa de entrada de mercadoria**, flag **"Lançar contas a pagar?"** — **marcado por padrão**; em **bonificação** o usuário desmarca.
- O lançamento no contas a pagar amarra **todos os dados**: fornecedor, data de entrada, nº do documento, espécie, valor total, parcela, data de vencimento, etc.

---

## GRUPO E — TEF — ✍️ CONFIRMADO (01/09)
- **1.B** exatamente como desenhado (TEF como captura via Connect TEF/POS Controle), mas será **uma das ÚLTIMAS integrações**.

---

## Fontes da pesquisa (01/09)
- Controlados: CRMV-SP (manual de dispensação, Portaria 344), CRF-SP, Prefeitura SP (medicamentos controle especial), ANVISA (Portaria 344/1998, RDC 22/2014 SNGPC).
- Open Finance: BCB (Res. Conjunta 1/2020, Art. 6º — participante autorizado), openfinancebrasil.org.br (modelo de participação).

---

## GRUPOS B, C, D, E — ⏳ AGUARDANDO DESENHO DO DIRETOR
(1.5 repasses + parceiras · 1.9 AVA · 1.A NFS-e Focus NFe · 1.7 controlados · 1.8 compras XML · 1.B TEF)
