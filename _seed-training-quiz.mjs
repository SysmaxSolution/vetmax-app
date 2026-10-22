// Semeia 1 pergunta de reforço por aula (por code) em training_quiz_questions.
import { createRequire } from 'module'; import { readFileSync } from 'node:fs'
const require = createRequire('C:/sysvetmax-dev/package.json')
const env = Object.fromEntries(readFileSync('C:/sysvetmax-dev/.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const { createClient } = require('@supabase/supabase-js')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })

// [code, pergunta, [opções], índiceCorreto, explicação]
const Q = [
  ['aula-01','Qual dado do pet é essencial no cadastro por garantir a dose segura de medicamentos?',['O peso','A cor da pelagem','O nome do tutor','A raça'],0,'O peso é o que garante a dose certa de cada medicamento no atendimento.'],
  ['aula-08','O que o check-in gera e amarra todo o atendimento do pet?',['A Ordem de Serviço (OS)','A nota fiscal','O prontuário','A receita'],0,'O check-in abre a OS, que liga tudo o que acontece no atendimento.'],
  ['aula-13','Para que serve o Cadastro Rápido na recepção?',['Cadastrar tutor e pet em segundos sem segurar a fila','Emitir nota fiscal','Fechar o caixa','Gerar receita'],0,'O cadastro rápido evita que a fila pare para um cadastro completo.'],
  ['aula-19','No SYSVETMAX, o que faz um caso de emergência ir para o topo da fila?',['A classificação de urgência por cor','A ordem de chegada','O nome do tutor','O valor do serviço'],0,'A urgência (comum/risco/emergência) fura a fila conforme a cor.'],
  ['aula-21','O que a agenda pode enviar ao tutor para reduzir faltas?',['Um lembrete automático no WhatsApp','Uma carta','Uma ligação da recepção','Nada'],0,'O sistema envia lembrete automático da consulta pelo WhatsApp.'],
  ['aula-40','Quais são as duas visões da fila na recepção?',['Lista e Painel por setor','Diária e mensal','Aberta e fechada','Simples e avançada'],0,'A fila pode ser vista em lista ou no painel por setor.'],
  ['aula-09','Quais são os dois campos obrigatórios da triagem?',['Peso e temperatura','Nome e telefone','Raça e cor','CPF e e-mail'],0,'Peso e temperatura retal são obrigatórios na triagem.'],
  ['aula-25','Qual estrutura deixa a anamnese no padrão CFMV?',['ANAMNESE / EXAME FÍSICO / CONDUTA','Início / Meio / Fim','Nome / Idade / Peso','Entrada / Saída'],0,'Anamnese, exame físico e conduta deixam o prontuário claro e no padrão.'],
  ['aula-22','No ditado por voz, quem revisa e assina o prontuário?',['O médico veterinário','A inteligência artificial','A recepção','O tutor'],0,'A IA é escriba; a revisão e a assinatura são sempre do MV.'],
  ['aula-23','O que a captura de faturamento no prontuário evita?',['Serviço prestado ficar sem cobrar','Erro de medicação','Falta de estoque','Atraso na agenda'],0,'Inserir serviços no ato evita o "cemitério" de faturamento não cobrado.'],
  ['aula-12','O que a prescrição precisa informar além do medicamento?',['Dose, via e duração','Apenas o preço','Só o nome do tutor','A cor do remédio'],0,'A receita precisa de posologia, via e por quantos dias.'],
  ['aula-14','O que acontece com o prontuário após concluir a consulta?',['Fica imutável; correções só por adendo','Pode ser apagado','Some do sistema','Vira rascunho'],0,'Concluir assina e trava o prontuário (CFMV); correção entra como adendo.'],
  ['aula-24','De onde o pet pode ser encaminhado para a internação?',['Direto do prontuário, com um clique','Só pela recepção','Só pelo caixa','Não pode ser encaminhado'],0,'O encaminhamento é feito do próprio prontuário, sem recadastrar.'],
  ['aula-02','O que o módulo Consultório monta durante o atendimento?',['O prontuário eletrônico','A nota fiscal','O extrato bancário','O orçamento'],0,'O consultório é onde o MV atende e monta o prontuário eletrônico.'],
  ['aula-10','Para onde vai o pedido quando o exame é solicitado?',['Para a fila de exames do laboratório','Para o caixa','Para a agenda','Para a farmácia'],0,'O pedido entra na fila de exames aguardando a coleta.'],
  ['aula-18','O que acontece ao liberar o resultado do exame?',['Fica imutável e disponível ao MV e ao tutor','Pode ser editado sempre','É apagado','Vira rascunho'],0,'Ao conferir e liberar, o resultado fica imutável e disponível ao solicitante e ao tutor.'],
  ['aula-63','De onde o veterinário pode solicitar o exame durante a consulta?',['Do próprio prontuário, sem sair da tela','Só do laboratório','Só da recepção','Não pode'],0,'A aba Solicitar Exames encaminha o pet sem sair do prontuário.'],
  ['aula-16','Como as imagens e o laudo chegam ao veterinário solicitante?',['Por link rastreado, sem pendrive','Por pendrive','Impressos','Por carta'],0,'O módulo entrega imagens e laudo por link ao MV e ao tutor.'],
  ['aula-11','Como o quadro de internação organiza os pacientes?',['Por colunas de estágio (Observação/Enfermaria/UTA/Alta)','Por ordem alfabética','Por preço','Por idade'],0,'O kanban mostra cada paciente no seu estágio.'],
  ['aula-15','O que a equipe marca a cada plantão na ficha de evolução?',['O estado (piorou/estável/melhorou)','O preço','O CPF do tutor','A raça'],0,'O estado geral resume como o paciente passou o plantão.'],
  ['aula-33','O que organiza a medicação por horário na internação?',['A frequência (aprazamento)','O preço','A cor do remédio','O nome do tutor'],0,'A frequência (ex.: a cada 8h) organiza o aprazamento.'],
  ['aula-34','Onde a equipe registra os sinais vitais durante a internação?',['Nas observações clínicas de cada plantão','No caixa','Na agenda','Na nota fiscal'],0,'Os sinais vitais entram nas observações do plantão, na linha do tempo.'],
  ['aula-35','Para dar alta ao internado, para qual coluna o card vai?',['Pronto para Alta','Observação','UTA','Enfermaria'],0,'Ao recuperar, o card vai para Pronto para Alta e abre o fluxo de alta.'],
  ['aula-17','O que classifica o risco anestésico ao agendar a cirurgia?',['A classificação ASA','O peso do tutor','A cor do pet','O preço'],0,'O risco anestésico é informado na classificação ASA (I a V).'],
  ['aula-36','Qual item do checklist é obrigatório antes do procedimento (CFMV)?',['Termo de consentimento assinado','A cor do pet','O nome do tutor','O preço'],0,'O sistema avisa que o termo é obrigatório antes do procedimento.'],
  ['aula-37','Como o cirurgião registra o ato de mãos livres?',['Ditando por voz','Digitando com uma mão','Não registra','Só depois'],0,'O ditado por voz preenche a ficha, o checklist e o relatório sem parar a cirurgia.'],
  ['aula-38','Para onde o paciente pode ser encaminhado no pós-operatório?',['Direto para a internação','Para o caixa','Para a agenda','Para casa sempre'],0,'Se precisar se recuperar internado, o sistema encaminha à internação.'],
  ['aula-06','Que dados dão rastreabilidade e alerta de vencimento ao item?',['Lote e validade','Cor e tamanho','Nome do tutor','Preço de venda'],0,'Lote e validade dão rastreabilidade e disparam o alerta de vencimento.'],
  ['aula-44','O que alimenta o Livro de Controlados automaticamente?',['As entradas e saídas dos controlados','O caixa','A agenda','A recepção'],0,'Cada movimentação do controlado alimenta o livro para a fiscalização.'],
  ['aula-45','O que fica na aba Serviços do estoque?',['Os procedimentos cobrados (consulta, exames)','Os medicamentos físicos','Os fornecedores','Os pacotes'],0,'Serviços são os procedimentos cobrados, sem estoque físico.'],
  ['aula-46','Para que serve a importação por CSV no estoque?',['Cadastrar vários produtos de uma vez','Emitir nota','Fechar caixa','Gerar receita'],0,'O CSV cadastra um estoque inteiro em lote, sem digitação manual.'],
  ['aula-20','O que acontece com o estoque ao dispensar um item?',['Baixa automaticamente','Sobe','Não muda','Duplica'],0,'Dispensar dá saída e baixa o estoque sozinho.'],
  ['aula-54','O que acontece ao importar a NF-e (XML) nas compras?',['O estoque entra sozinho','Nada','Só cria o fornecedor','Fecha o caixa'],0,'O sistema lê a nota e dá entrada em todos os produtos de uma vez.'],
  ['aula-55','Quando se usa a Entrada Manual nas compras?',['Quando a compra não tem XML da NF-e','Sempre','Nunca','Só com XML'],0,'A entrada manual registra a compra sem nota eletrônica.'],
  ['aula-56','Como o fornecedor é reconhecido nas notas depois de cadastrado?',['Automaticamente pelo CNPJ','Pelo nome digitado toda vez','Pela cor','Não é reconhecido'],0,'Com o fornecedor cadastrado, o sistema o reconhece pelo CNPJ.'],
  ['aula-57','O que o botão Exportar XML Contabilidade entrega?',['As notas do período para o contador','A receita','O extrato','A agenda'],0,'Exporta todas as notas do período no formato certo para a contabilidade.'],
  ['aula-05','O que a importação de NF-e faz com o estoque?',['Dá entrada nos produtos automaticamente','Não mexe','Zera o estoque','Só imprime'],0,'A NF-e importa os produtos e dá entrada no estoque.'],
  ['aula-03','Onde o caixa do dia é aberto e fechado?',['Na aba Sessão','Na aba Recebimentos','Na aba Saídas','Na aba Relatórios'],0,'A aba Sessão controla a abertura e o fechamento do caixa.'],
  ['aula-41','O que se informa ao abrir a sessão de caixa?',['O fundo de troco inicial','O CPF do tutor','A senha do banco','A nota fiscal'],0,'O fundo de troco é o dinheiro que já está na gaveta para dar troco.'],
  ['aula-42','O que é um suprimento de caixa?',['Uma entrada manual de dinheiro no caixa','Uma retirada','Uma venda','Uma despesa'],0,'O suprimento reforça o caixa e soma no saldo da sessão.'],
  ['aula-43','O que é uma sangria de caixa?',['Retirar dinheiro da gaveta por segurança','Colocar dinheiro','Vender um produto','Emitir nota'],0,'A sangria retira dinheiro do caixa e baixa do saldo.'],
  ['aula-48','O que o vencimento de um novo título já vem preenchido?',['Automaticamente (+30 dias), ajustável','Sempre em branco','Fixo em 7 dias','Sem vencimento'],0,'O vencimento vem automático em +30 dias, mas dá para ajustar.'],
  ['aula-49','O que fazer quando o dinheiro de um título a receber entra?',['Dar baixa no título','Excluir o título','Duplicar','Nada'],0,'Dar baixa muda o título de pendente para pago.'],
  ['aula-50','O que a conciliação cruza com as vendas?',['O extrato do banco','A agenda','O estoque','A receita'],0,'Importa o extrato (OFX/CSV) e cruza com as vendas automaticamente.'],
  ['aula-51','O que são os recebíveis de cartão?',['Valores que a operadora deposita depois','Dinheiro em espécie','Crédito do fornecedor','Despesas'],0,'As vendas no cartão viram recebíveis que caem depois, com taxa descontada.'],
  ['aula-52','O que o PAGFOR permite fazer?',['Pagar fornecedores em lote via arquivo do banco','Receber do cliente','Emitir nota','Abrir o caixa'],0,'O PAGFOR importa DDA e gera o CNAB para pagar vários fornecedores de uma vez.'],
  ['aula-53','O que a visão por CNPJ separa?',['O financeiro por empresa','Os pets por raça','As vendas por hora','Os exames'],0,'Recebido/pago/saldo ficam separados por empresa (multi-CNPJ).'],
  ['aula-04','Qual tarefa a conciliação automatiza?',['Conferir se o dinheiro entrou certo','Marcar consultas','Gerar receita','Dar alta'],0,'A conciliação cruza banco e cartão com as vendas, em minutos.'],
  ['aula-47','O que um orçamento pode virar depois, no checkout?',['A nota fiscal','Um exame','Uma internação','Uma vacina'],0,'O mesmo documento do orçamento vira a nota fiscal no checkout.'],
  ['aula-26','O que sempre conferir primeiro no painel de relatórios?',['O período selecionado','A cor do gráfico','O nome do usuário','O tamanho da tela'],0,'Tudo obedece ao período; número certo do mês errado engana.'],
  ['aula-27','O que a DRE responde?',['Se a clínica deu lucro (o resultado)','Quantos pets vieram','Qual vacina vendeu','Quem faltou'],0,'A DRE mostra receita, custos e o resultado do período.'],
  ['aula-28','O que a Curva ABC mostra?',['Os itens que mais faturam','A agenda do dia','O estoque mínimo','As faltas'],0,'A curva ABC ordena do que mais fatura para o que menos fatura.'],
  ['aula-29','O que o Aging mostra?',['As dívidas por faixa de atraso','O lucro do mês','A curva ABC','As comissões'],0,'O aging mostra a idade das dívidas a receber e a pagar.'],
  ['aula-30','Como a comissão é calculada no sistema?',['Automaticamente pelas regras','Na planilha à parte','De cabeça','Não é calculada'],0,'O sistema aplica a regra de cada profissional sobre o que ele faturou.'],
  ['aula-31','Para que serve o Livro de Controlados no relatório?',['Apresentar à fiscalização','Marcar consultas','Gerar receita','Abrir o caixa'],0,'O livro sai pronto, com o rastro completo por lote, para a fiscalização.'],
  ['aula-32','O que o relatório de Clientes separa?',['Novos × recorrentes','Cães × gatos','Pagos × pendentes','Manhã × tarde'],0,'Mostra quem chegou agora e quem voltou (recorrência).'],
  ['aula-07','O que o painel de relatórios (BI) entrega de cara?',['Uma visão geral da saúde do negócio','A agenda','O estoque','As receitas'],0,'O painel resume faturamento, recebimentos e categorias por período.'],
  ['aula-58','O que a aba Contábil da Gestão liga?',['A emissão de NFS-e','O caixa','A agenda','O estoque'],0,'Na Contábil a clínica configura e ativa a nota fiscal de serviço.'],
  ['aula-59','O que as permissões por módulo garantem?',['Cada função vê só a sua tela','Todos veem tudo','Ninguém acessa','Só o tutor acessa'],0,'A permissão por módulo protege dados sensíveis e cumpre a LGPD.'],
  ['aula-60','Na precificação, o que embute no cálculo do preço?',['O custo e o imposto','Só o nome','A cor','A raça do pet'],0,'O preço é formado pelo custo real e pelo imposto, com margem ou markup.'],
  ['aula-61','O que cada empresa faturante precisa ter ligada?',['Sua conta bancária','Um pet','Uma vacina','Um exame'],0,'Cada CNPJ é ligado à sua conta bancária para o dinheiro cair certo.'],
  ['aula-62','O que o cadastro de clínicas parceiras controla?',['O encaminhamento B2B e a comissão','O estoque','A agenda','O caixa'],0,'Registra o encaminhamento entre empresas e a comissão da indicação.'],
  ['aula-64','No bot de agendamento, quem confirma o horário na agenda?',['A recepção','O bot sozinho','O tutor','Ninguém'],0,'O bot pré-agenda, mas quem confirma na agenda é sempre a recepção.'],
  ['aula-65','O que os lembretes de consulta reduzem?',['As faltas','O estoque','O lucro','As vacinas'],0,'O lembrete automático no WhatsApp reduz de verdade as faltas.'],
  ['aula-66','O que dispara o recall de vacina?',['A data do próximo reforço se aproximando','O aniversário do tutor','O fim do mês','Uma venda'],0,'Perto do vencimento, o sistema avisa o tutor e traz o pet de volta.'],
  ['aula-67','No handoff, o que o bot faz quando a pessoa assume a conversa?',['Recua e para de responder','Continua respondendo junto','Fecha a conversa','Apaga tudo'],0,'Quando alguém assume, o bot recua para não haver resposta dupla.'],
  ['aula-39','O atalho da busca inteligente é...',['Control + K','Control + P','Control + S','Alt + F4'],0,'Control+K abre a busca universal de qualquer tela.'],
]

const { data: vids } = await db.from('training_videos').select('id, code')
const byCode = new Map((vids ?? []).map(v => [v.code, v.id]))
let ins = 0, skip = 0
for (const [code, question, options, correct, expl] of Q) {
  const vid = byCode.get(code)
  if (!vid) { console.log('  ! sem vídeo p/', code); continue }
  // evita duplicar: só insere se ainda não há pergunta para o vídeo
  const { count } = await db.from('training_quiz_questions').select('*', { count:'exact', head:true }).eq('video_id', vid)
  if (count && count > 0) { skip++; continue }
  const { error } = await db.from('training_quiz_questions').insert({ video_id: vid, question, options, correct_index: correct, explanation: expl, sort_order: 1 })
  if (error) console.log('  ! insert', code, error.message.slice(0,50)); else ins++
}
console.log(`QUIZ: inseridas ${ins} · já existiam ${skip} · total no seed ${Q.length}`)
