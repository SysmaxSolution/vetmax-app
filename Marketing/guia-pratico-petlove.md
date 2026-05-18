# 🐾 Guia Prático — Conciliação Petlove

**Para você que recebe a planilha da Petlove todo mês**

---

## 📚 Vamos por partes — em 4 passos

### 1️⃣ Abra o site da Petlove e baixe a planilha

Acesse o portal Petlove para clínicas credenciadas. Procure pelo botão **"Relatório de Pagamento"** ou **"Remessa do mês"**. Baixe o arquivo no formato **.xlsx** (Excel).

> 💡 Geralmente a planilha tem um nome longo tipo `126516almavetclinicaveterinaria22Apr2026.xlsx`. Não precisa renomear, pode salvar onde quiser no seu computador.

---

### 2️⃣ Abra o SysVetMax e vá em Financeiro

No menu superior do sistema, clique em **Financeiro**.

Procure pela aba roxa **🐾 Conciliação Petlove** (fica do lado direito das outras abas). Clique nela.

> ❓ **Não está aparecendo essa aba?** Significa que o módulo ainda não foi ativado. Peça para o administrador ir em Gestão › Configurações › Acesso › Módulos e ativar "Conciliação Petlove".

---

### 3️⃣ Arraste a planilha na área roxa

Você vai ver um quadrado tracejado roxo no meio da tela com a mensagem:

> 📂 **Arraste a planilha da Petlove aqui**

Pegue o arquivo .xlsx do seu computador e **arraste para dentro do quadrado**.
(Se preferir, clique no quadrado e selecione o arquivo manualmente.)

Em 2–3 segundos, a remessa aparece em **"Últimas remessas importadas"** logo abaixo. Pronto, a planilha entrou no sistema.

> ⚠ **Mensagem "Planilha já importada anteriormente"?**
> Significa que você (ou outra pessoa) já subiu esse mesmo arquivo antes.
> Para importar de novo: clique no ícone 🗑️ (lixeira) ao lado da remessa antiga e confirme a exclusão. Depois arraste de novo.

---

### 4️⃣ Clique em "Revisar →" e depois "Aprovar Conciliação"

Na remessa que acabou de aparecer, clique em **"Revisar →"**.

Você vai ver uma tela com:

- **Pets na remessa** — quantos pets já estão no sistema e quantos serão cadastrados agora
- **Cards coloridos** mostrando o que será feito
- No rodapé, um **botão verde grande**: **"Aprovar Conciliação"**

> 🟣 Se aparecer um **banner roxo "Mapeamento Necessário"**, clique para abrir uma janela onde você vincula os nomes dos procedimentos da Petlove ao seu estoque. **Pode deixar tudo em branco e clicar Salvar** — o sistema cria os serviços automaticamente.

Clique no **botão verde "Aprovar Conciliação"** (ou aperte **Ctrl + Enter**).

Aguarde 5 a 10 segundos. O sistema vai:
- Cadastrar os pets e tutores novos
- Criar todos os títulos no Contas a Receber
- Fixar os preços no cadastro de cada pet
- Lançar tudo no Extrato Bancário

Quando terminar, **🎉 confete** aparece na tela com um resumo do que foi feito.

---

## 👀 Onde olhar depois de aprovar

### ✅ Para ver os títulos financeiros que foram criados:

**Financeiro › Contas a Receber**

Vai aparecer uma linha para cada procedimento, com nome do pet e tutor na descrição.
Exemplo: "Petlove · Vacina V10 · Snow (Armando) · 02/03/2026"

### ✅ Para ver as movimentações no Extrato Bancário:

**Financeiro › Extrato**

No canto superior, selecione a **conta bancária padrão** da clínica. Filtre pelo mês da remessa. Você vai ver todas as entradas.

### ✅ Para ver um pet recém-cadastrado:

**Pacientes** → procure pelo nome do pet (ou microchip) → clique em **Editar**

Você vai ver:
- 🟡 **Banner amarelo "Cadastro rápido via Petlove"** — lista o que ainda precisa ser preenchido (sexo, data de nascimento, etc)
- Na aba **Convênio** (ícone escudo):
  - O vínculo Petlove já está configurado
  - **Preços do Convênio fixados neste pet** — todos os procedimentos com valor
  - **Histórico do Convênio** — quando foi cadastrado, mudanças de plano, preços atualizados

### ✅ Para ver o histórico/feed do pet:

**Pacientes** → procure pelo pet → clique no botão verde **"Histórico"**

Você vai ver eventos roxos com 🐾 contando tudo que veio da planilha.

---

## ❓ Perguntas que vão aparecer

### "Cadastrei um pet manualmente e ele veio também na planilha. O sistema duplica?"
**Não.** O sistema procura primeiro pelo **microchip**, depois pelo nome. Se já existe um pet com aquele chip, ele apenas cria o título e atualiza o preço — não cria pet novo.

### "Meses anteriores ao do banco aparecem com saldo R$ 1.000. Por quê?"
Não devem mais. Se o banco foi cadastrado em abril, o Extrato de janeiro até março mostra saldo inicial **R$ 0,00**. A partir de abril, aparece o saldo inicial real e nos meses seguintes herda o saldo final do mês anterior.

### "Importei errado, como apagar?"
Clique no ícone **🗑️ (lixeira)** ao lado da remessa. Aparece uma janela explicando o que vai ser apagado (títulos, preços fixados, histórico, baixas no extrato). Confirme.
Os **pets e tutores que foram criados permanecem** — você não perde os dados cadastrais.

### "O sistema cadastrou um pet sem sexo. Como completar?"
Abra o pet em **Pacientes › Editar**. O banner amarelo no topo lista o que falta. Preencha o sexo, data de nascimento, peso etc., e clique **Confirmar Alterações**. O banner some quando você terminar.

### "E se eu quiser conferir antes de aprovar?"
Sem problema. Antes de clicar "Aprovar Conciliação", **navegue pelas 4 abas coloridas** (Novos Pets, Sem Lançamento, Divergências, Casados). Use as setas **←** e **→** para trocar abas rápido. Quando estiver tudo OK, aprove.

### "Tem como cancelar a aprovação?"
Sim. Volte para a lista de remessas, clique na lixeira da remessa conciliada. O sistema **estorna tudo**: apaga os títulos, devolve os invoice_items para "aguardando repasse", apaga as movimentações do extrato e os preços fixados. Os pets/tutores criados permanecem.

---

## 💡 Atalhos do teclado

| Atalho | O que faz |
|---|---|
| `←` / `→` | Trocam entre as abas (Novos Pets, Casados etc) |
| `Ctrl + Enter` (ou `⌘ + Enter` no Mac) | Dispara a ação principal (Executar Matching ou Aprovar Conciliação) |
| `Esc` | Fecha qualquer modal aberto |

---

## 🧙 Precisa de ajuda?

O **Mentor IA** (botão azul circular no canto inferior direito) sabe esse fluxo de cor. Pergunte coisas como:

- *"Como faço para importar a planilha da Petlove?"*
- *"Onde vejo os títulos da Petlove?"*
- *"Excluí sem querer, e agora?"*
- *"O sistema cadastrou um pet sem sexo, o que faço?"*

Ele te guia em qualquer dúvida.

---

*Sysmax Solutions — Guia Prático Petlove · Maio/2026*
