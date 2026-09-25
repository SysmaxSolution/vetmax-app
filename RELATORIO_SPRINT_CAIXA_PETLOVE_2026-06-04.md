# Relatório da Sprint — Reunião de 04/06/2026 (Dra. Laís / Levi)

> **Status geral:** Tudo desenvolvido, testado e **já em produção** no VetMax (deploy de 04/06/2026).
> **Volume:** 7 entregas (4 correções + 3 melhorias), 1 migração de banco, 44 testes automatizados novos — suíte completa com **1.133 testes passando**.

---

## 🐛 CORREÇÕES (bugs vistos ao vivo na reunião)

### 1. Caixa cobrava o valor cheio mesmo com a cobertura Petlove aplicada
| | |
|---|---|
| **Causa** | Ao clicar "Aplicar cobertura", o sistema marcava os itens como conveniados, mas **não recalculava o total a pagar** — na demo, cobrou R$ 75,75 quando deveria cobrar a coparticipação de R$ 30,21. Além disso, o saldo do repasse ficava registrado numa categoria errada do financeiro, invisível para a conciliação da Petlove. |
| **O que foi feito** | O cálculo do "Total a Pagar" foi corrigido e o saldo restante passou a ser registrado corretamente como **"Aguardando Petlove"**. |
| **Como fica agora** | Aplicou a cobertura → o caixa cobra **só a coparticipação** (ex.: R$ 30,21). O repasse (ex.: R$ 45,54) vai automaticamente para o financeiro como "A Receber Petlove" e é baixado quando a planilha mensal for importada. Remover a cobertura volta ao valor particular na hora. |

### 2. Consultório mostrava o preço particular para pet conveniado
| | |
|---|---|
| **Causa** | Dois problemas: (a) a tela de seleção de serviços **sempre exibia o preço particular**, mesmo com preço de convênio cadastrado; (b) quando o pet tinha mais de um vínculo de convênio no histórico (ex.: um cancelado + um ativo), uma falha silenciosa fazia o sistema tratá-lo como particular. |
| **O que foi feito** | A tela de seleção passou a consultar o preço real do pet, e a busca do convênio foi blindada contra vínculos duplicados. |
| **Como fica agora** | Ao inserir um serviço para pet conveniado, aparece o **preço do convênio com o escudo 🛡 e o particular riscado** (ex.: 🛡 R$ 73,00 ~~R$ 120,00~~). A hierarquia de preço é respeitada: preço fixado do pet → preço base do convênio no serviço → particular. |

### 3. Serviço "Consulta" duplicado no catálogo
| | |
|---|---|
| **Causa** | O importador da planilha Petlove comparava nomes de forma exata: "CONSULTA VETERINARIA" (planilha) ≠ "Consulta Veterinária" (catálogo) por causa de acentos e maiúsculas — e criava um segundo serviço, **sem preço**, que ao ser selecionado cobrava errado. |
| **O que foi feito** | O importador agora ignora acentos, maiúsculas e espaços extras ao procurar o serviço. Também foram criados utilitários de diagnóstico e de mesclagem de duplicatas (com simulação antes de gravar). |
| **Como fica agora** | Reimportar a mesma planilha quantas vezes for **não cria mais duplicatas**. Verificamos a base em produção: hoje não há nenhum serviço duplicado (a duplicata da demo estava no ambiente de teste). Se surgirem em qualquer ambiente, o utilitário mescla mantendo histórico e auditoria. |

### 4. Levi não conseguia excluir item lançado errado (como produto)
| | |
|---|---|
| **Causa** | Cancelar/excluir venda fechada exige perfil de administrador (proteção correta — evita furo de estoque), mas o operador **ficava sem nenhuma saída**: só recebia o erro. |
| **O que foi feito** | A proteção foi mantida e criou-se o caminho de **"Solicitar correção ao administrador"**, alinhado à regra da Laís ("o administrador edita/exclui depois"). |
| **Como fica agora** | Quando o Levi tenta cancelar e não tem permissão, a tela oferece enviar a solicitação com o motivo. A **Laís recebe o alerta no chat interno (sininho)** com venda, valor, tutor e motivo — e tudo fica registrado na auditoria (quem pediu, quando, por quê). |

---

## ✨ MELHORIAS (aprovadas na reunião)

### 5. Data de adesão/microchipagem editável (carências)
| | |
|---|---|
| **Motivo** | "Tem cliente que compra o plano e só vem microchipar dois meses depois" — a carência conta da microchipagem, mas a data não era editável; o sistema usava a data do cadastro. |
| **O que foi feito** | O campo de data já existia no banco e o cálculo de carência já o priorizava — **faltava a tela**. Criamos o campo editável e a transparência da origem da data. |
| **Como fica agora** | Na **aba Convênio** do pet há o campo "Data de Adesão / Microchipagem" — a Laís confere no portal Petlove e corrige ali; o semáforo de carência recalcula **na hora**. A tela mostra qual data está em uso e de onde veio (manual / 1ª remessa / cadastro). Na **aba Paciente**, junto do microchip, há o resumo rápido com atalho para ajustar. Bônus: a **microchipagem express** já grava a data de adesão automaticamente no implante. |

### 6. Taxa administrativa sobre a coparticipação no cartão (os "juros")
| | |
|---|---|
| **Motivo** | A Petlove repassa valores baixos; a clínica precisa repassar a taxa da maquininha + 6% de imposto ("R$ 2,50 a cada R$ 25" = 10%) — mas **só** sobre a coparticipação, **só** no cartão, e o Levi fazia essa conta de cabeça. |
| **O que foi feito** | Criado o campo **"% de taxa sobre coparticipação (cartão)"** no cadastro do serviço (junto do preço convênio), com cálculo automático no caixa seguindo as regras fechadas: só cartão (dinheiro/PIX isentos), só coparticipação (nunca o repasse nem itens particulares), arredondamento por item e proporcional em pagamento misto. |
| **Como fica agora** | A Laís cadastra o % uma vez por serviço. No caixa, ao escolher cartão, aparece de forma verificável de cabeça: **"Coparticipação Petlove: R$ 30,21 (+ R$ 3,02 Taxa Adm Cartão (10%))"**, com campo de desconto na taxa e total final. No recibo do tutor sai uma linha simples "**Taxa administrativa**" (sem detalhes internos). A conciliação da planilha Petlove **não é afetada** — o repasse fica registrado puro. |

### 7. PDV unificado ao Caixa
| | |
|---|---|
| **Motivo** | O Levi precisava lançar vendas avulsas direto do caixa ao receber uma consulta, sem abrir o módulo PDV separado — mesmo conceito da unificação triagem→consultório. |
| **O que foi feito** | Criada a opção **"PDV unificado ao Caixa"** em Gestão → Configurações → Acesso → Fluxo Contínuo (liga/desliga por clínica), com 4 capacidades novas no Caixa. |
| **Como fica agora** | Com a opção ativa: **(a)** o módulo PDV some do menu e a venda avulsa aparece no **topo de Caixa → Recebimentos** (busca produto/serviço + carrinho; tutor é opcional — sem tutor, registra "Consumidor avulso"); **(b)** dentro do recebimento de uma consulta dá para **adicionar item avulso** ("o tutor quer levar um petisco") — com controle de estoque automático; **(c)** **recebimento agrupado**: marca várias faturas e recebe tudo num pagamento só — tutores diferentes pedem confirmação, e no financeiro **cada fatura continua separada** (rastreabilidade); **(d)** a tela do operador ficou **limpa**: o Levi vê itens + valor a cobrar + taxa; repasse e dados administrativos ficam só na visão da Laís. A **Visão Geral continua acessível ao Levi** para a conferência dele. Clínicas com a opção desligada: nada muda. |

---

## 🔧 Itens técnicos (transparência)

| Item | Detalhe |
|---|---|
| **Criado** | 1 migração de banco (campos de taxa/juros — já aplicada), 4 bibliotecas de cálculo puras e testadas, componente de venda avulsa do caixa, 2 scripts de diagnóstico/merge de duplicatas, ação de solicitação de correção, 5 arquivos de teste (44 casos usando os números exatos da reunião). |
| **Corrigido de quebra** | (a) salvar o Fluxo Contínuo **apagava** outras configurações da clínica (bug latente — agora preserva); (b) desconto manual podia ser contado em dobro ao editar preços no caixa; (c) um teste automatizado intermitente que poluía a esteira. |
| **Excluído/Refeito** | Nada foi excluído de dados ou funcionalidades. O PDV **não foi removido** — vira opção por clínica. Duplicatas, quando mescladas, são **arquivadas** (nunca apagadas — auditoria preservada). |
| **Qualidade** | Suíte completa: **50 conjuntos / 1.133 testes passando** após o merge. Conciliação Petlove regredida: o matching da planilha mensal segue batendo nos valores puros de repasse. |

---

## 📋 O que combinar com o cliente (rollout)

1. **Ativar** o "PDV unificado ao Caixa" na clínica deles (Gestão → Configurações → Acesso) — já está em produção, basta ligar.
2. **Preencher nos serviços**: preço convênio + % de taxa (10%, conforme a regra deles).
3. **Conferir/ajustar** as datas de adesão dos pets conveniados (agora editável).
4. **Validar na rotina** (pedido da própria Laís): consulta conveniada → cobertura → cartão com taxa → venda avulsa → recebimento agrupado.

## 📦 Ficou para as próximas sprints (combinado na reunião)
- Importação da **tabela de preços Petlove em PDF** (anual)
- **Conciliação de cartões** com extrato PagBank e **conciliação bancária**
- **Módulo Orçamento** (reunião dedicada de levantamento, conforme alinhado)
- Cadastro dos cartões/taxas da clínica (operacional — a Laís envia os dados)
