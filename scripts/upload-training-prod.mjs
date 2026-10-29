// Sobe os 67 vídeos para o bucket PRIVADO training-videos e semeia training_videos.
import { createRequire } from 'module'
import { readFileSync, existsSync } from 'node:fs'
const require = createRequire('C:/SysMax/package.json')
const env = Object.fromEntries(readFileSync('C:/SysMax/.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const { createClient } = require('@supabase/supabase-js')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
// GUARDA DE AMBIENTE: este script escreve em PRODUCAO. Aborta se o alvo nao for o projeto de producao.
const EXPECTED_REF = 'yivjuhurcadxtllmkkqd'
console.log('ALVO SUPABASE:', env.NEXT_PUBLIC_SUPABASE_URL)
if (!String(env.NEXT_PUBLIC_SUPABASE_URL || '').includes(EXPECTED_REF)) {
  console.error(`ABORTADO: alvo nao e o projeto de producao (${EXPECTED_REF}).`); process.exit(1)
}
if (!process.argv.includes(`--confirm=${EXPECTED_REF}`)) {
  console.error(`ABORTADO: passe --confirm=${EXPECTED_REF} para confirmar a escrita em producao.`); process.exit(1)
}
const OUT = 'C:/SysMax/Marketing/screencast/out/'
const BUCKET = 'training-videos'

const A = [
  ['recepcao','01','aula-01-recepcao-cadastro-tutor-pet.mp4','Cadastro de Tutor e Pet','Cadastrar um novo tutor e o pet dele, campo a campo, sem papel.'],
  ['recepcao','08','aula-08-recepcao-checkin.mp4','Check-in e Ordem de Serviço','Dar entrada no pet e gerar a OS que amarra todo o atendimento.'],
  ['recepcao','13','aula-13-recepcao-cadastro-rapido.mp4','Cadastro Rápido','Cadastrar tutor e pet em segundos, sem segurar a fila.'],
  ['recepcao','19','aula-19-recepcao-urgencia.mp4','Urgência que fura a fila','Classificação por cor (comum/risco/emergência) e o caso grave no topo.'],
  ['recepcao','40','aula-40-recepcao-fila.mp4','Fila de Espera e Atendidos','Acompanhar o dia em lista ou painel por setor.'],
  ['recepcao','21','aula-21-recepcao-agenda.mp4','Agenda e Agendamento','Marcar horários por dia/semana/mês, com lembrete no WhatsApp.'],
  ['triagem','09','aula-09-triagem-sinais-vitais.mp4','Sinais Vitais e Encaminhamento','Peso, temperatura, FC/FR e encaminhamento ao consultório.'],
  ['consultorio','25','aula-25-consultorio-anamnese.mp4','Incluir na Fila e Anamnese','Abrir o prontuário e escrever anamnese/exame físico/conduta (CFMV).'],
  ['consultorio','22','aula-22-consultorio-voz.mp4','Ditar por Voz (IA escriba)','O veterinário fala, a IA transcreve; consentimento LGPD e revisão do MV.'],
  ['consultorio','23','aula-23-consultorio-diagnostico.mp4','Diagnóstico IA, Faturamento e Receita','Sugestão de diagnóstico, captura de faturamento, medicação e prescrição.'],
  ['consultorio','12','aula-12-consultorio-prescricao.mp4','Prescrição','Montar a receita com posologia, via e duração.'],
  ['consultorio','14','aula-14-consultorio-encerrar-alta.mp4','Encerrar Consulta e Alta','Enviar ao caixa mantendo aberto ou dar alta assinada (imutável).'],
  ['consultorio','24','aula-24-consultorio-internacao.mp4','Encaminhar para Internação','Do prontuário direto ao kanban de leitos, com um clique.'],
  ['consultorio','02','aula-02-consultorio-prontuario.mp4','Prontuário — Visão Geral','Panorama completo do consultório e do prontuário eletrônico.'],
  ['exames','10','aula-10-exames-solicitacao.mp4','Solicitar Exame (laboratório)','Criar o pedido de exame na fila do laboratório.'],
  ['exames','18','aula-18-exames-resultado-laudo.mp4','Registrar Resultado e Liberar Laudo','Lançar analitos, ditar o laudo e liberar (imutável) ao MV e ao tutor.'],
  ['exames','63','aula-63-exames-no-consultorio.mp4','Solicitar Exame na Consulta','Pedir exame do próprio prontuário, sem sair da tela.'],
  ['imagem','16','aula-16-imagem-laudos.mp4','Estudos e Laudos de Imagem','Criar estudo (raio-x/US/TC/RM) e entregar imagens e laudo por link.'],
  ['internacao','11','aula-11-internacao-admissao.mp4','Admissão e Mapa de Leitos','Admitir o paciente e o kanban Observação→Enfermaria→UTA→Alta.'],
  ['internacao','15','aula-15-internacao-evolucao.mp4','Evolução Clínica','Ficha de plantão: estado, observações, medicação e IA.'],
  ['internacao','33','aula-33-internacao-prescricao.mp4','Prescrição e Aprazamento','Medicação por horário (a cada X horas) e receita por IA.'],
  ['internacao','34','aula-34-internacao-sinais-vitais.mp4','Controle de Sinais Vitais','Registrar os sinais vitais a cada plantão na linha do tempo.'],
  ['internacao','35','aula-35-internacao-alta.mp4','Alta do Paciente Internado','Arrastar para Pronto para Alta e encaminhar ao caixa.'],
  ['cirurgia','17','aula-17-centro-cirurgico.mp4','Agendar Cirurgia','Procedimento, risco ASA e o quadro Preparo→Sala→RPA.'],
  ['cirurgia','36','aula-36-cirurgia-checklist.mp4','Checklist Pré-Operatório','Jejum, exames e termo de consentimento (obrigatório — CFMV).'],
  ['cirurgia','37','aula-37-cirurgia-ato.mp4','Registro do Ato Cirúrgico','Anotações cronológicas, ficha anestésica e relatório por voz.'],
  ['cirurgia','38','aula-38-cirurgia-pos.mp4','Pós-Operatório e Encaminhamento','Recuperação e encaminhamento direto à internação.'],
  ['estoque','06','aula-06-estoque-novo-item.mp4','Cadastrar Novo Item','Nome, marca, lote e validade — rastreabilidade e alerta de vencimento.'],
  ['estoque','44','aula-44-estoque-controlado.mp4','Item Controlado e Livro','Controlados sinalizados e o Livro de Controlados para a fiscalização.'],
  ['estoque','45','aula-45-estoque-abas-filtros.mp4','Abas e Filtros','Produtos, Serviços e Pacotes e Planos + filtros por categoria.'],
  ['estoque','46','aula-46-estoque-csv.mp4','Importar por CSV','Cadastrar um estoque inteiro em lote, por planilha.'],
  ['estoque','20','aula-20-farmacia-dispensar.mp4','Dispensar (baixa de estoque)','Dar saída num item e o estoque baixa sozinho.'],
  ['compras','54','aula-54-compras-nfe.mp4','Importar NF-e (XML)','Arrastar o XML da nota e o estoque entra sozinho.'],
  ['compras','55','aula-55-compras-entrada-manual.mp4','Entrada Manual','Registrar a compra sem nota eletrônica, item a item.'],
  ['compras','56','aula-56-compras-fornecedor.mp4','Cadastrar Fornecedor','Cadastro do fornecedor com CNPJ, contato e histórico.'],
  ['compras','57','aula-57-compras-entradas-xml.mp4','Entradas e Exportar XML','Histórico de entradas e exportação das notas ao contador.'],
  ['compras','05','aula-05-compras-nfe.mp4','Compras — Visão Geral','Panorama do módulo de compras e importação de NF-e.'],
  ['caixa','03','aula-03-caixa-recebimento.mp4','Caixa — Visão Geral','Abas, recebimentos, saídas e fechamento de sessão.'],
  ['caixa','41','aula-41-caixa-abrir-sessao.mp4','Abrir Sessão do Dia','Informar o fundo de troco e abrir o caixa.'],
  ['caixa','42','aula-42-caixa-suprimento.mp4','Lançar Entrada (Suprimento)','Reforço de caixa que soma no saldo da sessão.'],
  ['caixa','43','aula-43-caixa-sangria.mp4','Registrar Saída (Sangria)','Retirada de dinheiro do caixa com descrição do motivo.'],
  ['financeiro','48','aula-48-financeiro-novo-titulo.mp4','Novo Título','Criar conta a receber/pagar com categoria e vencimento.'],
  ['financeiro','49','aula-49-financeiro-contas-baixa.mp4','Contas a Receber/Pagar (baixa)','Filtrar, dar baixa quando o dinheiro entra e estornar.'],
  ['financeiro','50','aula-50-financeiro-conciliacao.mp4','Extrato e Conciliação','Importar o extrato do banco e cruzar com as vendas.'],
  ['financeiro','51','aula-51-financeiro-creditos-cartoes.mp4','Créditos e Cartões','Crédito do tutor e recebíveis de cartão sob controle.'],
  ['financeiro','52','aula-52-financeiro-pagfor.mp4','PAGFOR (pagamento em lote)','Importar DDA e pagar fornecedores em lote (CNAB).'],
  ['financeiro','53','aula-53-financeiro-cnpjs.mp4','Visão por CNPJ','Recebido/pago/saldo separado por empresa (multi-CNPJ).'],
  ['financeiro','04','aula-04-financeiro-conciliacao.mp4','Financeiro — Visão Geral','Panorama do financeiro e da conciliação.'],
  ['faturamento','47','aula-47-faturamento-orcamento.mp4','Criar Orçamento','Montar orçamento de serviços que depois vira nota fiscal.'],
  ['relatorios','26','aula-26-relatorios-painel.mp4','Painel (BI) e Período','A estante de relatórios e o filtro de período.'],
  ['relatorios','27','aula-27-relatorios-dre.mp4','DRE e DRE por CNPJ','O resultado da clínica, empresa por empresa.'],
  ['relatorios','28','aula-28-relatorios-curva-abc.mp4','Curva ABC','Onde está o dinheiro: os itens que mais faturam.'],
  ['relatorios','29','aula-29-relatorios-fluxo-aging.mp4','Fluxo de Caixa e Aging','O dinheiro no tempo e as dívidas por idade.'],
  ['relatorios','30','aula-30-relatorios-comissoes.mp4','Comissões e Produtividade','Comissão calculada automaticamente por profissional.'],
  ['relatorios','31','aula-31-relatorios-estoque-controlados.mp4','Estoque e Livro de Controlados','Posição de estoque e livro pronto para a fiscalização.'],
  ['relatorios','32','aula-32-relatorios-clientes.mp4','Clientes e Exportação','Novos × recorrentes e exportar para o contador.'],
  ['relatorios','07','aula-07-relatorios-bi.mp4','Relatórios — Visão Geral','Panorama do painel de indicadores (BI).'],
  ['gestao','58','aula-58-gestao-config-contabil.mp4','Configurações e Contábil (NFS-e)','Configurar a clínica e ligar a nota fiscal de serviço.'],
  ['gestao','59','aula-59-gestao-usuarios.mp4','Usuários e Permissões','Cada função vê só a sua tela (segurança + LGPD).'],
  ['gestao','60','aula-60-gestao-precificacao.mp4','Precificação','Tabelas de preço, custo, imposto e margem × markup.'],
  ['gestao','61','aula-61-gestao-empresas-faturantes.mp4','Empresas Faturantes','Multi-CNPJ com conta bancária por empresa.'],
  ['gestao','62','aula-62-gestao-clinicas-parceiras.mp4','Clínicas Parceiras (B2B)','Encaminhamento entre empresas e comissão.'],
  ['whatsapp','64','aula-64-whatsapp-bot-agendamento.mp4','Bot de Agendamento','A IA pré-agenda; a recepção valida antes de confirmar.'],
  ['whatsapp','65','aula-65-whatsapp-lembretes.mp4','Lembretes de Consulta','Lembrete automático reduz faltas.'],
  ['whatsapp','66','aula-66-whatsapp-recall-vacina.mp4','Recall de Vacina','Avisa o tutor quando a vacina vence e traz o pet de volta.'],
  ['whatsapp','67','aula-67-whatsapp-handoff.mp4','Handoff Humano','Quando a pessoa assume, o bot recua — troca suave.'],
  ['transversal','39','aula-39-busca-omnisearch.mp4','Busca Inteligente (Ctrl+K)','Achar tutor, pet ou consulta em segundos, de qualquer tela.'],
]

// 1) bucket privado
const { data: buckets } = await db.storage.listBuckets()
if (!buckets?.some(b => b.name === BUCKET)) {
  const { error } = await db.storage.createBucket(BUCKET, { public:false, fileSizeLimit:'200MB', allowedMimeTypes:['video/mp4'] })
  console.log(error ? 'ERRO bucket: '+error.message : 'bucket criado (privado): '+BUCKET)
} else console.log('bucket já existe:', BUCKET)

// 2) upload + seed
let up=0, seed=0, skip=0
for (let i=0;i<A.length;i++){
  const [mod, code, file, title, desc] = A[i]
  const path = `aulas/${file}`
  if (!existsSync(OUT+file)) { console.log('  ! falta arquivo:', file); continue }
  const bytes = readFileSync(OUT+file)
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType:'video/mp4', upsert:true })
  if (upErr) { console.log('  ! upload', file, upErr.message.slice(0,50)); continue }
  up++
  const { error: seErr } = await db.from('training_videos').upsert({
    module_key: mod, code: `aula-${code}`, title, description: desc, storage_path: path, sort_order: Number(code), is_active: true
  }, { onConflict:'code' })
  if (seErr) { console.log('  ! seed', code, seErr.message.slice(0,60)); } else seed++
  if ((i+1)%10===0) console.log(`  ...${i+1}/${A.length}`)
}
console.log(`UPLOAD ${up} vídeos · SEED ${seed} linhas · de ${A.length}`)
const { count } = await db.from('training_videos').select('*',{count:'exact',head:true})
console.log('training_videos total:', count)
