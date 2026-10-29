import 'server-only'

// Livro de Controlados em Excel, no mesmo layout da planilha que a clínica envia
// à Vigilância: abas "Resumo de saldos", "Saldo inicial", "Perdas",
// "Lançamentos gerais" e uma aba por medicamento (Livro de Registro Específico).
// ESTOQUE e totais são fórmulas — abrindo no Excel, recalcula igual à planilha.

import ExcelJS from 'exceljs'
import type { ControlledBook } from '@/types/controlled-book'
import { montarFolha, montarResumo, montarPerdas, montarLancamentosGerais, nomeDaAba, todosOsItens, rotuloMedicamento, dataBR, type FolhaLivro } from '@/lib/controlled/livro-fiscal'

const FMT_QTD = '#,##0.###'
const CINZA = 'FFE7EBEF'
const CINZA_CLARO = 'FFF4F6F8'
const borda: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBFC7CE' } }, left: { style: 'thin', color: { argb: 'FFBFC7CE' } },
  bottom: { style: 'thin', color: { argb: 'FFBFC7CE' } }, right: { style: 'thin', color: { argb: 'FFBFC7CE' } },
}

function cabecalho(ws: ExcelJS.Worksheet, linha: number, textos: string[]) {
  const row = ws.getRow(linha)
  textos.forEach((t, i) => {
    const c = row.getCell(i + 1)
    c.value = t
    c.font = { bold: true, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = borda
  })
  row.height = 20
}

function linhaEstabelecimento(book: ControlledBook): string {
  const c = book.clinic
  const endereco = [c.address, c.city && c.state ? `${c.city}/${c.state}` : (c.city ?? c.state), c.cep ? `CEP ${c.cep}` : null].filter(Boolean).join(' · ')
  const rt = c.technical_responsible_name ? `RT: ${c.technical_responsible_name}${c.technical_responsible_crmv ? ` (${c.technical_responsible_crmv})` : ''}` : 'RT: —'
  return [`${c.name}${c.cnpj ? ` · CNPJ ${c.cnpj}` : ''}`, endereco || null, rt, `Período: ${dataBR(book.from)} a ${dataBR(book.to)}`].filter(Boolean).join('   |   ')
}

/** Uma aba por medicamento. Devolve a posição das células que o Resumo referencia. */
function abaDoMedicamento(wb: ExcelJS.Workbook, book: ControlledBook, folha: FolhaLivro, nome: string) {
  const ws = wb.addWorksheet(nome, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: 'frozen', ySplit: 5 }] })
  ws.columns = [
    { key: 'data', width: 12 }, { key: 'pet', width: 30 }, { key: 'proc', width: 36 }, { key: 'os', width: 11 },
    { key: 'ent', width: 10 }, { key: 'sai', width: 10 }, { key: 'per', width: 10 }, { key: 'est', width: 11 },
    { key: 'ass', width: 22 }, { key: 'obs', width: 34 },
  ]
  ws.mergeCells('A1:J1')
  ws.getCell('A1').value = `LIVRO DE REGISTRO ESPECÍFICO — ${folha.substancia.toUpperCase()}${folha.concentracao ? ` (${folha.concentracao})` : ''} — unidade: ${folha.unidade}${folha.classe ? ` — lista ${folha.classe}` : ''} — forma farmacêutica ${folha.uso}`
  ws.getCell('A1').font = { bold: true, size: 12 }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 22
  ws.mergeCells('A2:J2')
  ws.getCell('A2').value = linhaEstabelecimento(book)
  ws.getCell('A2').font = { size: 9, color: { argb: 'FF4A5A58' } }
  ws.getCell('A2').alignment = { horizontal: 'center', wrapText: true }
  ws.getRow(2).height = 18

  // Cabeçalho em dois níveis, como na planilha
  ws.mergeCells('A3:A4'); ws.mergeCells('B3:D3'); ws.mergeCells('E3:G3'); ws.mergeCells('H3:H4'); ws.mergeCells('I3:I4'); ws.mergeCells('J3:J4')
  cabecalho(ws, 3, ['DATA', 'H I S T Ó R I C O', '', '', 'MOVIMENTO', '', '', 'ESTOQUE', 'ASSINATURA DO RESP.\nTÉCNICO', 'OBSERVAÇÕES'])
  cabecalho(ws, 4, ['', 'Pet-Responsável', 'Procedimento', 'N. OS', 'Entrada', 'Saída', 'Perdas', '', '', ''])
  ws.getRow(3).height = 28

  // Saldo anterior
  const r5 = ws.getRow(5)
  ws.mergeCells('A5:G5')
  r5.getCell(1).value = `Saldo anterior em ${dataBR(book.from)}`
  r5.getCell(1).font = { italic: true, color: { argb: 'FF4A5A58' } }
  r5.getCell(8).value = folha.saldo_anterior
  r5.getCell(8).numFmt = FMT_QTD
  r5.getCell(8).font = { bold: true }
  for (let c = 1; c <= 10; c++) { r5.getCell(c).border = borda; r5.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } } }

  let r = 6
  for (const l of folha.linhas) {
    const row = ws.getRow(r)
    row.getCell(1).value = l.hora && l.hora !== '08:00' ? `${l.data} ${l.hora}` : l.data
    row.getCell(2).value = l.pet_responsavel
    row.getCell(3).value = l.procedimento
    row.getCell(4).value = l.os
    row.getCell(5).value = l.entrada
    row.getCell(6).value = l.saida
    row.getCell(7).value = l.perdas
    row.getCell(8).value = { formula: `H${r - 1}+N(E${r})-N(F${r})-N(G${r})`, result: l.estoque }
    row.getCell(9).value = ''
    row.getCell(10).value = [l.observacoes, l.responsavel ? `Reg.: ${l.responsavel}` : null].filter(Boolean).join(' · ')
    for (const c of [5, 6, 7, 8]) row.getCell(c).numFmt = FMT_QTD
    for (let c = 1; c <= 10; c++) { row.getCell(c).border = borda; row.getCell(c).alignment = { vertical: 'top', wrapText: c === 3 || c === 10 || c === 2 } }
    r++
  }
  const ultima = r - 1
  const tot = ws.getRow(r)
  ws.mergeCells(`A${r}:D${r}`)
  tot.getCell(1).value = 'Totais do período'
  tot.getCell(5).value = { formula: `SUM(E6:E${Math.max(ultima, 6)})`, result: folha.total_entradas }
  tot.getCell(6).value = { formula: `SUM(F6:F${Math.max(ultima, 6)})`, result: folha.total_saidas }
  tot.getCell(7).value = { formula: `SUM(G6:G${Math.max(ultima, 6)})`, result: folha.total_perdas }
  tot.getCell(8).value = { formula: `H${ultima}`, result: folha.saldo_final }
  for (let c = 1; c <= 10; c++) { tot.getCell(c).font = { bold: true }; tot.getCell(c).border = borda; tot.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } } }
  for (const c of [5, 6, 7, 8]) tot.getCell(c).numFmt = FMT_QTD
  ws.getRow(r + 2).getCell(9).value = '______________________________'
  ws.getRow(r + 3).getCell(9).value = 'Assinatura do Responsável Técnico'
  ws.getRow(r + 3).getCell(9).font = { size: 9, color: { argb: 'FF4A5A58' } }
  return { aba: nome, linhaSaldoAnterior: 5, linhaTotais: r }
}

export async function gerarLivroControladosXlsx(book: ControlledBook): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SYSVETMAX'
  wb.created = new Date(book.generated_at)

  const resumoWs = wb.addWorksheet('Resumo de saldos', { views: [{ state: 'frozen', ySplit: 1 }] })
  const inicialWs = wb.addWorksheet('Saldo inicial', { views: [{ state: 'frozen', ySplit: 1 }] })
  const perdasWs = wb.addWorksheet('Perdas', { views: [{ state: 'frozen', ySplit: 1 }] })
  const geraisWs = wb.addWorksheet('Lançamentos gerais', { views: [{ state: 'frozen', ySplit: 4, xSplit: 4 }] })

  // Abas por medicamento (nomes únicos)
  const itens = todosOsItens(book)
  const usados = new Set<string>()
  const posicoes: { aba: string; linhaSaldoAnterior: number; linhaTotais: number; medicamento: string; unidade: string; folha: FolhaLivro }[] = []
  for (const item of itens) {
    const folha = montarFolha(item)
    let nome = nomeDaAba(rotuloMedicamento(item))
    let n = 2
    while (usados.has(nome.toLowerCase())) nome = nomeDaAba(`${rotuloMedicamento(item).slice(0, 27)} ${n++}`)
    usados.add(nome.toLowerCase())
    const pos = abaDoMedicamento(wb, book, folha, nome)
    posicoes.push({ ...pos, medicamento: rotuloMedicamento(item), unidade: item.unit ?? 'un', folha })
  }

  // Resumo de saldos: fórmulas apontando para a aba de cada medicamento
  resumoWs.columns = [{ width: 24 }, { width: 10 }, { width: 13 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }]
  cabecalho(resumoWs, 1, ['Medicamento', 'Unidade', 'Saldo inicial', 'Entradas', 'Saídas', 'Perdas', 'Saldo final'])
  const resumo = montarResumo(book)
  posicoes.forEach((p, i) => {
    const r = i + 2
    const row = resumoWs.getRow(r)
    const ref = `'${p.aba.replace(/'/g, "''")}'`
    const linha = resumo.find(x => x.medicamento === p.medicamento)
    row.getCell(1).value = p.medicamento
    row.getCell(2).value = p.unidade
    row.getCell(3).value = { formula: `${ref}!H${p.linhaSaldoAnterior}`, result: linha?.saldo_inicial ?? 0 }
    row.getCell(4).value = { formula: `${ref}!E${p.linhaTotais}`, result: linha?.entradas ?? 0 }
    row.getCell(5).value = { formula: `${ref}!F${p.linhaTotais}`, result: linha?.saidas ?? 0 }
    row.getCell(6).value = { formula: `${ref}!G${p.linhaTotais}`, result: linha?.perdas ?? 0 }
    row.getCell(7).value = { formula: `C${r}+D${r}-E${r}-F${r}`, result: linha?.saldo_final ?? 0 }
    for (const c of [3, 4, 5, 6, 7]) row.getCell(c).numFmt = FMT_QTD
    for (let c = 1; c <= 7; c++) row.getCell(c).border = borda
  })

  // Saldo inicial
  inicialWs.columns = [{ width: 24 }, { width: 13 }, { width: 10 }, { width: 50 }]
  cabecalho(inicialWs, 1, ['Medicamento', 'Saldo inicial', 'Unidade', 'Observações'])
  posicoes.forEach((p, i) => {
    const row = inicialWs.getRow(i + 2)
    row.getCell(1).value = p.medicamento
    row.getCell(2).value = p.folha.saldo_anterior
    row.getCell(2).numFmt = FMT_QTD
    row.getCell(3).value = p.unidade
    row.getCell(4).value = `Saldo em estoque na abertura do período (${dataBR(book.from)}), apurado pelos movimentos anteriores.`
    for (let c = 1; c <= 4; c++) row.getCell(c).border = borda
  })

  // Perdas
  perdasWs.columns = [{ width: 18 }, { width: 24 }, { width: 14 }, { width: 10 }, { width: 40 }, { width: 24 }, { width: 36 }]
  cabecalho(perdasWs, 1, ['Data', 'Medicamento', 'Quantidade perdida', 'Unidade', 'Motivo', 'Responsável', 'Observações'])
  montarPerdas(book).forEach((p, i) => {
    const row = perdasWs.getRow(i + 2)
    row.getCell(1).value = `${p.data} ${p.hora}`
    row.getCell(2).value = p.medicamento
    row.getCell(3).value = p.quantidade; row.getCell(3).numFmt = FMT_QTD
    row.getCell(4).value = p.unidade
    row.getCell(5).value = p.motivo
    row.getCell(6).value = p.responsavel
    row.getCell(7).value = p.observacoes
    for (let c = 1; c <= 7; c++) row.getCell(c).border = borda
  })

  // Lançamentos gerais (tabela cruzada)
  const gerais = montarLancamentosGerais(book)
  geraisWs.mergeCells(1, 1, 1, 4 + gerais.medicamentos.length * 2)
  geraisWs.getCell('A1').value = 'LANÇAMENTO ÚNICO — TODOS OS MEDICAMENTOS'
  geraisWs.getCell('A1').font = { bold: true, size: 12 }
  geraisWs.mergeCells(2, 1, 2, 4 + gerais.medicamentos.length * 2)
  geraisWs.getCell('A2').value = 'Uma linha por atendimento (ou nota de entrada). As abas de cada medicamento mostram o mesmo movimento em forma de livro.'
  geraisWs.getCell('A2').font = { size: 9, color: { argb: 'FF4A5A58' } }
  const cab = ['Data', 'Animal - Tutor', 'Procedimento', 'N. OS']
  for (const m of gerais.medicamentos) cab.push(`${m} - Entrada`, `${m} - Saída`)
  cabecalho(geraisWs, 4, cab)
  geraisWs.getColumn(1).width = 16; geraisWs.getColumn(2).width = 30; geraisWs.getColumn(3).width = 36; geraisWs.getColumn(4).width = 10
  for (let c = 5; c <= cab.length; c++) geraisWs.getColumn(c).width = 12
  gerais.linhas.forEach((l, i) => {
    const row = geraisWs.getRow(i + 5)
    row.getCell(1).value = l.hora && l.hora !== '08:00' ? `${l.data} ${l.hora}` : l.data
    row.getCell(2).value = l.animal_tutor
    row.getCell(3).value = l.procedimento
    row.getCell(4).value = l.os
    gerais.medicamentos.forEach((m, j) => {
      const v = l.valores[m]
      const ce = row.getCell(5 + j * 2), cs = row.getCell(6 + j * 2)
      ce.value = v && v.entrada ? v.entrada : null
      cs.value = v && v.saida ? v.saida : null
      ce.numFmt = FMT_QTD; cs.numFmt = FMT_QTD
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}
