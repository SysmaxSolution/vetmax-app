# Prospecto — Animais Clínica Veterinária e Centro de Diagnósticos (Ribeirão Preto/SP)

*Dossiê OSINT + veredito do conselho — 16/07/2026. Uso interno SysMax.*

---

## 1. Quem é a clínica

**Animais Clínica Veterinária e Centro de Diagnósticos** — Rua São Paulo, 244, Campos Elíseos, CEP 14085-010, Ribeirão Preto/SP. Tel/WhatsApp (16) 3931-5487 · adm@clinicaanimais.com.br · [clinicaanimais.com.br](https://www.clinicaanimais.com.br) · IG [@clinicaanimaispet](https://www.instagram.com/clinicaanimaispet/) (~6,5k seguidores).

> **Não é uma clínica generalista.** É um **centro de diagnóstico por imagem + laboratório**, referência regional que recebe encaminhamentos B2B de outras clínicas num raio de ~150 km. Fundada em 2003 pelo MV **Francisco Ferreira Develey**, pioneiro em ultrassonografia veterinária na região.

**Serviços (núcleo):** Tomografia Computadorizada Multislice · **Ressonância Magnética** (anunciada como exclusiva no interior de SP) · Radiologia Digital (DR) · Ultrassom com Doppler · Ecocardiografia · ECG · Laboratório próprio desde 2009 (hematologia, bioquímica, ELISA, PCR, endocrinologia, cito/histopatologia). Consultas e vacinação são secundárias. **Não anunciam**: internação 24h, cirurgia, banho e tosa, petshop.

**Operação:** seg–sex 8h–19h, sáb 8h–12h; "plantão" com taxa extra após ~18h (não anunciado). Agendamento 100% manual (WhatsApp humano, telefone, formulário). **Portal de Laudos próprio (LIS)** para entrega digital de resultados. Nenhum ERP veterinário de mercado detectado.

## 2. Os 3 CNPJs (grupo família Develey — mesmo quarteirão, mesmo telefone)

| Empresa | CNPJ | Papel | Regime |
|---|---|---|---|
| Francisco Ferreira Develey Ltda (ME) | 18.767.441/0001-89 | Clínica operacional + medicamentos/pet (R. São Paulo, 244) | Fora do Simples |
| Develey e Dias Diagnóstico por Imagem Ltda (EPP) | 23.692.661/0001-20 | Braço de imagem — maior capital (R. São Paulo, 266) | Fora do Simples |
| Ana Lucia Detore Develey (EI) | 02.154.085/0001-98 | Entidade original de 1997, vet/varejo pet (R. São Paulo, 270) | Simples |

4º CNPJ (laboratório) baixado em 2019 — lab hoje roda dentro de um dos ativos. **Decisores: Francisco (perfil técnico, ~23 anos de operação) e Ana Lucia.**

## 3. Reputação e as 3 feridas públicas

Google ~4,7★ (~1.190 avaliações) · Facebook 94% recomendam. Porém:

1. **Agenda desconectada (Reclame Aqui set/2025, não respondida):** atendente confirmou ultrassom às 18h por WhatsApp; veterinário recusou na hora alegando plantão/taxa; gata grave, exame já pago. → *recepção e ponta clínica sem sistema comum.*
2. **Transparência de orçamento:** conflito por conta de ~R$ 9 mil (tomografias) sem justificativa clara.
3. **Pós-venda abandonado:** 4 de 5 reclamações no Reclame Aqui sem resposta.

## 4. Veredito do Conselho (LLM Council — 5 conselheiros + revisão por pares)

### Onde o conselho concorda (alta confiança)
1. **Não liderar pelo ERP generalista.** Abrir com internação/cirurgia/banho e tosa/farmácia = "esse sistema foi feito para outra clínica". O núcleo dele (imagem+lab) é justamente o que o VetMax não cobre.
2. **Nunca prometer consolidação financeira dos 3 CNPJs.** Mostrar ClinicSwitcher + NFS-e correta por CNPJ (força real); se pedirem visão consolidada: "roadmap Enterprise" — nunca tela vazia, nunca promessa.
3. **Atacar as 3 feridas públicas:** agenda conectada recepção↔MV com regra de plantão/taxa; orçamento com aprovação do tutor e baixa no caixa; recall/pós-venda via WhatsApp.
4. **Blindar a demo:** WhatsApp bot só em vídeo gravado (histórico de instabilidade da Evolution); NFS-e só sandbox; não inventar DICOM.
5. **Framing vencedor:** *"o VetMax não substitui o seu Portal de Laudos — ele orbita o seu LIS"*, dito cedo e espontaneamente. Converte os 3 gaps (LIS, PACS, portal B2B) em decisão de escopo.

### Onde o conselho diverge
- **Expansionista:** este cliente é o "hub" que evangeliza dezenas de clínicas solicitantes num raio de 150 km (laudos rastreáveis "powered by SYSVETMAX"); multi-CNPJ é fosso competitivo.
- **Os outros 4 (e 4 das 5 revisões):** o "hub" pressupõe exatamente o portal B2B e a worklist que **não existem**; vender promessa a um cético de 23 anos que já tem portal funcionando destrói a confiança. Guardar o efeito de rede para quando a peça técnica existir.

### Pontos cegos que a revisão por pares pegou (decisivos)
1. **Economia da venda:** ancorar R$ 359,90/mês transparente contra a "conta de R$ 9 mil sem justificativa" que o queimou; preço para 3 CNPJs; custo de troca/migração.
2. **A objeção real é CONFIANÇA, não features** — ele foi queimado por conta inflada e pós-venda abandonado; levar prova de suporte e precificação transparente.
3. **Qualificação ANTES da demo:** ele quer trocar de sistema ou tapar as 3 feridas? Quem assina (qual CNPJ)? Qual orçamento?
4. **Métrica de sucesso da reunião:** não é "fechar" — é sair com **piloto pago em UM CNPJ**.
5. **Plano B para "integra com meu Portal de Laudos?"** + risco LGPD/CFMV de laudos/imagens.

### Recomendação final
**Não fazer a demo "que atende TUDO". Fazer descoberta + demo cirúrgica das 3 feridas, precificada e com prova de confiança.**

Roteiro da demo = apenas o fluxo dele: encaminhamento → agenda conectada com regra de plantão/taxa → orçamento com aprovação → baixa no caixa → NFS-e por CNPJ via ClinicSwitcher. Seed em clínica demo "Animais Diagnósticos" com casos de imagem/lab (tomografia, ecocardio, PCR) — nada de "Rex vacina antirrábica". Cortar jargão interno ("conferência cega", "split Petlove", "gate de revisão").

**NÃO mostrar:** internação, cirurgia, banho e tosa, petshop, farmácia, tela de exames interna, consolidação inexistente.

### A primeira coisa a fazer
**Ligação de descoberta de 20 minutos com o Francisco ANTES de seedar qualquer dado**, para confirmar uma única coisa: ele quer *trocar* o sistema ou *orbitar* o Portal de Laudos que já funciona. A resposta reescreve a demo, define o preço e diz se o ciclo vale o investimento.

---

## 5. Preparo técnico pendente (lado SysMax)

- [ ] Ligação de descoberta (Francisco / Ana Lucia) — antes de tudo
- [ ] Clínica demo "Animais Diagnósticos" seedada com casos de imagem/lab + 3 CNPJs de exemplo no ClinicSwitcher
- [ ] Serviço "Taxa de Plantão (após 18h)" configurado + horários de funcionamento espelhando os deles
- [ ] Vídeo gravado do bot WhatsApp (agendamento validado pela recepção) — não demonstrar ao vivo
- [ ] NFS-e em sandbox por CNPJ
- [ ] Resposta pronta para: "cadê o DICOM?", "integra com meu portal?", "cadê a visão consolidada do grupo?"
- [ ] Tabela de preço transparente (piloto pago em 1 CNPJ como próximo passo)
- [ ] Ensaio completo cronometrado na véspera

---

## 6. Round 2 do Conselho — estratégia da 1ª visita (16/07, após contato com Dr. Vinícius)

**Fato novo:** contato feito com Dr. Vinícius — provável sócio do CNPJ de imagem (Develey e Dias). Entrada pelo sócio técnico do braço mais capitalizado; risco de a conversa ancorar em imagem/PACS (onde não competimos).

### O que o conselho validou da estratégia do PO
- Não demonstrar na 1ª visita: **aprovação unânime** (é o que "ganha" o cliente).
- Perguntar antes de vender + honestidade proativa sobre fit.

### O que o conselho mandou mudar
1. **Trial:** de "menor fluxo, grátis, 30 dias" para **"CNPJ onde a dor dói mas é isolável (braço B2C/EI), com preço pós-trial acordado ANTES, contrato, operador nomeado, métricas e reunião de decisão no dia 25"**. Menor fluxo = menor dor = não converte; grátis sem data de morte = POC não-remunerada.
2. **Descoberta:** de 7 frentes para 4 perguntas desqualificadoras: (a) o Portal de Laudos fica ou sai? (se exige substituição → desqualificar); (b) quem sente a dor de agenda/financeiro e quanto custa/mês; (c) quem assina e qual o orçamento atual de software; (d) critério de sucesso do trial. + LGPD + resposta pronta para o incidente do bot (gate de revisão humana).
3. **Nunca dizer:** "integramos com as máquinas", "DICOM no roadmap", "consolidação depois". Dizer: **"orbitamos o seu Portal/LIS, não substituímos"**.
4. **Rotinas sob medida: recusar como regra.** Configuração/implantação sim; arquitetura nova só se genérica a N clínicas. O "módulo Centro de Diagnóstico" é nicho não-replicável — não construir para fechar 1 cliente. Exceção a explorar: **inversão** — parceria/white-label do Portal de Laudos DELES como canal, em vez de substituí-lo.
5. **Exigir na sala quem assina** (Francisco/Ana Lucia), não só o Vinícius. Reunião de 60–75 min, sem laptop.

### Veredito de fit (sem rodeios)
**Como grupo, NÃO é nosso público** (núcleo = laudo B2B/imagem: sem PACS/worklist/portal externo/consolidação). **Como pedaço, É**: o B2C de UM CNPJ (agenda, WhatsApp, caixa, NFS-e, conciliação de cartão). Vender exatamente isso e nada além — meio-fit vendido como fit-total é a origem do churn.

### A primeira coisa a fazer
**Fazer a conta do ticket**: quanto o pedaço B2C isolado de um CNPJ paga/mês, e se isso justifica visita+implantação. Se não pagar um ticket digno, este prospecto é distração — o gargalo real é vender para a 2ª/3ª/10ª clínica simples parecida com a Almavet.

### Red flags que encerram o ciclo educadamente
- DICOM/PACS ou substituição do Portal de Laudos como condição de negócio.
- Decisão presa em sócio ausente; sem orçamento definido.

## 7. Ambiente demo (pronto, para quando chegar a hora)
- 3 clínicas no ClinicSwitcher: "Animais RP — Clínica Veterinária / Diagnóstico por Imagem / Pet (Demo)", horários espelhando os reais, 9 layouts CFMV cada (inseridos automaticamente pelo trigger 0414).
- Login demo: demo.animais@vetmax.test (senha com o time).
- Catálogo de diagnóstico (tomo R$1.200, RM R$2.500, eco, US Doppler, taxa de plantão) + 3 casos de encaminhamento B2B seedados (TC coluna, eco+ECG, US+lab).
- Limpeza: manifest em .tmp/demo-animais-manifest.json.

---

## 11. Reunião de 18/07 (sábado, 9h) — Dr. Vinícius · Levantamento pós-visita

**Presentes:** PO + Saulo. Clínica movimentada (3 recepcionistas, 10+ tutores em espera no sábado). Administrativo no andar superior (não visitado).

### Fatos novos (mudam o diagnóstico anterior)
1. **Sistema atual = VERTIS (legado, MUITO insatisfeito).** Requer servidor local (~R$ 10 mil investidos), quase sem integrações, fornecedor "não consegue desenvolver" pedidos. Usado para administrativo + emissão de laudos.
2. **Pagam 3 sistemas**: VERTIS + um de integração com as máquinas de imagem + um emissor de notas.
3. **🔑 A trava de imagem caiu:** ele NÃO pretende trocar o sistema de imagens — ele armazena em **servidor em NUVEM com integração acessível para captura/download**. Nossa integração é com uma API de nuvem, não com máquinas/DICOM.
4. **O "Portal de Laudos" é DOR, não ativo**: demora para publicar resultados porque o VERTIS só envia imagens após assinatura digital do laudo.
5. Rotinas manuais: exporta do sistema p/ Excel (estoque e outros). Lab: fita impressa do hemograma com 30+ valores digitados à mão, ~40 hemogramas/dia.
6. **Vinícius é champion técnico**: desenvolveu agente de IA (OpenAI) e não conseguiu integrar ao legado.
7. B2B + B2C confirmados (clínicas da região encaminham exames).
8. **Grupo nacional de WhatsApp só de veterinários: "todo dia pelo menos 4 reclamando de sistema"**. Frase dele: "se atenderem meu fluxo (completo e complexo), atendem qualquer clínica ou hospital".
9. **Portas abertas**: levantar problemas com cada departamento → plano completo de soluções/automações → depois custos e contrato. Grupo de WhatsApp criado.
10. Restrição dele: **"não entregar solução manca"** — o plano precisa responder todos os setores.

### Reavaliação de fit (vs. veredito do council)
O council disse "não é nosso público como grupo" sob duas premissas que a reunião DERRUBOU: (a) que o núcleo de imagem exigiria DICOM/PACS — não exige, a integração é com a nuvem existente; (b) que o portal/LIS era ativo intocável — é fonte de insatisfação. **Fit recalculado: substituímos o VERTIS + o emissor de notas (2 dos 3 sistemas) + aposentamos o servidor local; integramos com o 3º (nuvem de imagens).** O núcleo administrativo — onde o calo aperta — é exatamente nosso ponto forte.

### Sequência de ataque acordada
1. **Administrativo** (financeiro, caixa, cartões/TEF, notas, relatórios, centro de custos)
2. **Exames** (fluxo B2B/B2C, integração com a nuvem de imagens, publicação de laudo)
3. **Laboratório** (interfaceamento de analisadores — fim da digitação de 30+ valores)
4. **Recepção/Agendamento** (defasagem grande)
5. **Estoque**

### Riscos a gerenciar
- **Consultoria grátis**: levantamento com timebox e entregável definido (blueprint por setor); o combinado é plano → custos → CONTRATO antes de desenvolver.
- **"Solução manca"**: o plano cobre todos os setores, mas a ENTREGA é faseada na ordem que ele mesmo priorizou — plano completo ≠ tudo pronto no dia 1.
- **Descobrir no levantamento**: nome/API do sistema de nuvem de imagens; custo mensal de cada um dos 3 sistemas (âncora de preço); export de dados do VERTIS (migração); marcas dos analisadores do lab (protocolos ASTM/HL7/serial).
- Interfaceamento de laboratório e TEF são desenvolvimentos GENÉRICOS (servem a N clínicas) — dentro da regra do council para co-desenvolvimento pago.

---

## 12. Levantamento Administrativo — Aline & Bruna (20/07, WhatsApp + ligações)

### Responsabilidades do setor
- **Bruna:** contas a receber · conciliação de caixas · conciliação de bancos · conferência de vendas do convênio AVA · vencimentos de medicamentos · lista de compras · splits de 3 profissionais (diário + quinzenal)
- **Aline:** contas a pagar (previsionar/baixar/separar/arquivar/malotes) · emissão de NFS-e · compras e estoque · livro de medicamentos controlados · comissões de veterinários · fechamento do plano de saúde · infra · banco de horas/docs de RH (folha é do contador)

### Dores ranqueadas (na voz delas)
1. **Conciliação bancária (dor nº 1 declarada):** manual — exporta relatório do Vertis e compara com extrato; sem OFX; erros por troca de recebimento entre máquinas; várias origens numa conta só; 3 CNPJs = 3 bancos.
2. **Cartões/TEF:** maior fluxo é cartão; POS digitado à mão; conciliação manual. Adquirentes: **Sipag** (+ FinPet). FinPet já entrega split por empresa/profissional no extrato, mas o Vertis não comporta.
3. **Splits rateados em parcelas — manual, 1 a 1** (diário e quinzenal, 3 profissionais). Modelo (entendido por ligação): OS com % do profissional (ex. 30/70); o profissional emite NFS-e da parte dele ao cliente; a clínica emite NFS-e do restante e recebe o total. Pede parametrização de cálculos/percentuais.
4. **Emissão de NFS-e:** consome manhãs inteiras; notas atrasadas emitidas em lote quinzenal AGRUPADAS numa nota só ("ref tais serviços" no corpo). ⚠️ **Janela de outubro:** emissor atual pago até out/2026; depois planejam contratar módulo do Vertis (1 clique) para as empresas Ana e Francisco — a Develey (imagem) ficaria de fora por causa do split.
5. **Livro de medicamentos controlados PARADO** por falta de tempo.
6. **Contas a pagar/estoque:** tudo manual; Vertis não importa XML nem integra estoque. Fluxo proposto (aprovado por ela, sem o livro fiscal): XML → entrada → estoque + parcelas no contas a pagar. "Não é o foco da dor."
7. **Crédito de cliente entre empresas:** adiantamento cai na empresa errada → transferência e baixa manuais. Solução acordada: crédito GLOBAL do cliente com transferência inter-CNPJ + baixa automática.
8. Cashback AVA: cálculo manual + devolução via Pix pela Ana — **não querem automatizar** (simples). Fiados/"marcam": falar com **Ana** (é da clínica). Comissões de vets: variáveis conforme entradas do mês.
9. Boletos: 2-3/mês, manual no banco — "café pequeno perto do problema do TEF". Não priorizar.

### Compromissos de solução assumidos na conversa (PO)
- Conciliação bancária com importação OFX + tela de matching (lançamentos × extrato, multi-empresa)
- TEF + importação do extrato da adquirente (bruto/líquido/taxa/NSU) com conciliação
- Split parametrizável → contas a receber (clínica) + contas a pagar (profissional) + NFS-e desmembrada automática
- Crédito global multi-empresa
- Verificar APIs: Sipag e FinPet (extrato/split automatizado — SEM promessa, depende da adquirente)

### Respostas da Aline (21/07) + planilha de rateio do Vertis

**Âncora de preço — custo mensal recorrente atual (sem contar o servidor de ~R$10k já investido):**
| Item | Custo/mês |
|---|---|
| Vertis (rateado: servidor/pcs R$842 + laudos R$771,15 + interface/ambra R$160) | **R$ 1.773,15** |
| Emissor de notas (R$29,90 × 3 empresas) | R$ 89,70 |
| Manutenção de computadores e servidor | R$ 977,87 |
| **Total** | **≈ R$ 2.840,72/mês (≈ R$ 34,1 mil/ano)** |

**Modelo de cobrança do Vertis: POR LAUDO** (planilha de rateio, período 26/05–25/06):
- Laboratório: 346 laudos (R$336,88) · RX: 41 (R$142,10) · Tomo: 59 (R$204,06) · Cardio/ambra: 80 (R$88,10) → **≈ 526 laudos/mês** — volumetria-chave p/ o setor de exames.
- **"interface/ambra" R$160/mês** → forte indício de que a nuvem de imagens citada pelo Vinícius é a **Ambra Health** (PACS em nuvem, da Intelerad, com API REST documentada) — CONFIRMAR no levantamento de exames.

**Demais respostas:**
- NFS-e/mês (jun/26): Ana 20 · Francisco 13 · Develey 20 = **53 notas/mês** → a dor da NFS-e é PROCESSO (manual + split), não volume.
- Certificados A1 em dia; renovação = Campez Contabilidade.
- Convênio AVA: conferência **manual, diária, OS por OS** → automatizável (matching de OS × repasse).
- Vencimento de medicamentos: planilha.
- **Livro de controlados: físico ~1 ANO sem colar; Excel ~2 meses atrasado.** Desenho correto (revisado 21/07): **Livro de Controlados DIGITAL no Sysvetmax como fonte da verdade** — razão por substância: entradas via XML/lote (estoque já tem is_controlled + lotes FIFO + validade, migrations 0099/0198), saídas via dispensação da farmácia vinculada à receita com CRMV obrigatório (0063), saldo e trilha de auditoria em tempo real. A planilha deixa de ser gestão e vira ARTEFATO DE IMPRESSÃO: relatório mensal em 1 clique no formato que a fiscal aceita colado no livro físico (exigência da Port. 344/98, não escolha nossa). Regularização do passivo: importar histórico de compras/saídas e gerar as folhas retroativas do ano inteiro. Upside a confirmar com a Vigilância local: aceite de livro 100% digital (elimina até a colagem).
- Malote: documentos físicos por empresa para o contador.
- Pendente: respostas da Bruna (bancos, cartões, volumetria de transações).

### Pesquisa técnica — Ambra Health/Ambra Saúde (21/07)

**Hipótese confirmável: a "interface/ambra" (R$160/mês) = Ambra Health (Intelerad), PACS em nuvem, operação brasileira "Ambra Saúde" desde 2013** (ambrasaude.com.br, suporte em PT). Não há produto "Ambra" no catálogo do Vertis/GPIti (que integra Agfa/Fuji/Pixeon/WTT) — hipótese alternativa improvável. **Confirmar com um print da URL do portal deles** (`*.ambrahealth.com` ou `*.dicomgrid.com` = confirmado).

**Viabilidade de integração: ALTA.** API v3 REST pública (access.dicomgrid.com/api/v3/api.html), auth por sessão (usuário de serviço), endpoints prontos para tudo que precisamos: `study/list` (buscar estudos por paciente/data/accession), `study/download` (DICOM/ZIP), `link/add` (link do viewer web p/ anexar no laudo — mesmo molde da integração Ambra↔Cerbo EHR), `webhook/add` (novo estudo → notifica nosso sistema). **Precedente veterinário direto: integração oficial Ambra + ezyVet.**

**Esforço estimado: 3–5 dias de dev** (auth + busca + link no laudo + webhook). Fluxo: exame no VetMax → busca estudo na Ambra (ideal: accession number) → anexa link do viewer no laudo → webhook sugere vínculo automático quando novo estudo chega.

**Pendências/riscos:** (a) usuário de API precisa ser solicitado pelo CLIENTE à Ambra Saúde (a conta é dele) — verificar se há custo extra; (b) nomes de paciente no PACS costumam vir "TUTOR^PET" — matching por accession number resolve; (c) viewer em iframe pode ser bloqueado — abrir em nova aba é o caminho garantido.

### Respostas da Bruna (21/07) — volumetria e ROI do financeiro

- **Lançamentos bancários/mês (mês de muito movimento): 289** (Laboratório 123 · Clínica 105 · Raio-X 61).
- **Conferência de cartões: consome O DIA INTEIRO quando dedicada; um ciclo de 25 dias leva 1–2 SEMANAS** (intercalado com as demais tarefas) — mesmo no cenário "quase tudo certo".
- **Conciliação bancária: levava 2 dias quando dava para montar o relatório; HOJE NÃO É MAIS POSSÍVEL** — na prática está ABANDONADA. Eles não conseguem mais conferir sistema × banco (risco financeiro invisível; argumento forte para a diretoria).
- **Maquininhas (3): Sipag → Laboratório · Sipag → Clínica · FinPet → Rx/TC/RM** (cada setor com a sua). "Tudo separado, MAS acontece aquela exceção com alguns clientes, o que não deveria" → **confirmada a causa-raiz da dor nº 1**: recebimento na máquina/empresa errada gera transferência inter-CNPJ e caça manual ao lançamento.
- Ainda pendente: exemplo de extrato exportado das adquirentes (Sipag/FinPet), nº de transações de cartão/dia, e o tema "fiados" com a Ana.

### Pesquisa técnica — FinPet (21/07)

**Quem é:** marca da **EvoluServices Meios de Pagamento** (CNPJ 04.556.068/0001-02; mesmas raízes da Saúde Service, desde 2003) — plataforma de pagamentos multiadquirente vertical (Saúde Service = médicos, Evo = varejo, Finpet = vet). Split de pagamento é funcionalidade NATIVA (divisão na liquidação, cai direto na conta de cada empresa/profissional — por isso o extrato do cliente já vem separado). 4 modalidades de split (manual, automático %, por montante, royalty).

**Achado-chave 1 — precedente direto:** o **Dvet (ERP vet concorrente) já tem "Maquininha Finpet" integrada com split no PDV e conciliação de recebíveis** → a FinPet fecha parceria técnica com ERPs veterinários; nosso pleito não é inédito. Argumento: "queremos o que o Dvet já tem".

**Achado-chave 2 — TEF viável:** o portal developer da EvoluServices documenta **"Transação Remota" (aciona o PinPad via chamada HTTP, com `callbackUrl`/webhook de status)** — na prática é o TEF para a maquininha FinPet: a venda nasce do sistema e volta conciliada. Exige homologação. Também há API de Link de Pagamento (OpenAPI 3.0).

**Gap:** NÃO existe API pública de conciliação/extrato/recebíveis — o caminho é B2B: **integracoes@evoluservices.com** (+ suporte@finpet.com.br, (11) 3230-0108). Portal/app do lojista exporta extrato com filtros (envio por e-mail); layout dos campos a confirmar com a amostra do cliente.

**Caminho recomendado:** (1) importador do export do portal (estilo módulo Petlove: matching por data+valor+NSU, colunas de split viram lançamentos separados); (2) automatizar ingestão do arquivo; (3) parceria B2B p/ API de conciliação + Transação Remota (TEF).
Fontes: evoluservices.github.io/evoluservices-developer · finpet.com.br · dvet.com.br/maquina-integrada

### Pesquisa técnica — Sipag/Sicoob (21/07)

**Quem é:** marca de adquirência do Sicoob, white-label sobre a Fiserv/First Data (ex-Bin) desde 2014 — o ferramental de EDI/TEF segue o ecossistema Fiserv.

**Confirmado:**
- **Portal do Lojista** (sipag.com.br/portaldolojista) exporta vendas e recebíveis em **CSV/PDF** com colunas customizáveis: data/hora, terminal, ID da venda, bandeira, forma de pagamento, parcela, autorização, previsão de pagamento, **valor bruto e líquido** (MDR derivável). → dá para começar o importador HOJE com um export do cliente.
- **Extrato eletrônico EDI existe**: habilita com "Código EDI" (termo de autorização; implantação ~12 dias úteis; **NÃO retroativo** → habilitar cedo). Formato do ecossistema Bin/Fiserv: CSV e JSON (vendas, pagamentos, chargebacks). Layout não é público — contato: atendimentoedi@fiserv.com.
- **Mercado já concilia Sipag** (Conciliadora, F360, Equals, webPosto, TOTVS) — o feed existe.
- **TEF viável**: Sipag credenciada no **SiTef (Software Express/Fiserv)**; PinPad para automação comercial. Bate com nossa decisão de arquitetura (TEF como captura).

**Não existe:** API pública de recebíveis/agenda Sipag (developers.sicoob.com.br é só bancário; APIs Fiserv são de captura p/ parceiros credenciados). Longo prazo: registradoras (CERC/B3/TAG).

**Caminho recomendado:** (a) importador do CSV do Portal do Lojista AGORA (mesmo molde do importador Petlove); (b) habilitar EDI em paralelo (cliente assina termo; sem retroativo); (c) TEF via SiTef quando o cliente quiser caixa integrado; API pública não há.

### Síntese das 2 adquirentes (para o blueprint 3.1)
| | Sipag (Lab + Clínica) | FinPet (Imagem) |
|---|---|---|
| Export manual | ✅ CSV no Portal do Lojista | ✅ portal/app com export (layout a confirmar) |
| Arquivo automatizado | ✅ EDI (Código EDI, ~12du, sem retroativo) | ⚠️ e-mail programado / negociar B2B |
| API de conciliação | ❌ pública não existe | ❌ pública não existe (B2B: integracoes@evoluservices.com) |
| TEF | ✅ SiTef/Software Express | ✅ "Transação Remota" HTTP + callback (docs públicas) |
| Precedente em ERP vet | — | ✅ Dvet já integra (split + conciliação) |

**Fase 1 (sem depender de ninguém):** importadores dos exports das duas + matching contra recebíveis. **Fase 2:** EDI Sipag + arquivo programado FinPet. **Fase 3 (TEF):** FinPet Transação Remota (docs abertas, homologação) e Sipag via SiTef.

### Extratos-amostra recebidos e mapeados (21/07)

**Sipag (.xlsm, "Relatório de vendas recebidas detalhado", 28 colunas):** RRN (ID Venda), nº autorização, data/hora, bandeira, forma pgto, parcela N/N, terminal, tipo captura, indicador de cancelamento (estornos = linhas negativas), data prevista de liquidação, data do pagamento, banco/agência/conta, **bruto / desconto (MDR) / líquido**. Matching: RRN + autorização + data + valor.

**FinPet (.xls OLE2, "Recebimentos", 11 colunas, visão por parcela/recebimento):** data transação, valor transação, valor parcela, parcelas 1/N, bruto do recebimento, código autorização, bandeira, **"Nome do Cliente" = Nº DA OS + pet + tutor** (matching quase determinístico!), líquido do recebimento (**bruto − líquido embute o split do profissional**), data do recebimento, status.

**Decisões de arquitetura (PO, 21/07):** Fase 1 = importadores manuais por adquirente **atrás de feature flag por clínica** (ativo só na Animais). Fase 2 (pós-aprovação do plano por Vinícius e Ana) = **TEF com Smart TEF via POS Controle + FinPet Transação Remota** + importação automatizada dos arquivos (EDI Sipag + arquivo programado FinPet) para conciliação bancária e de cartões.
