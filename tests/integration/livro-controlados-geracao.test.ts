/**
 * Gera o Livro de Controlados (Excel) a partir do banco de TESTES e
 * compara com a planilha que a clínica envia à Vigilância.
 *
 * Pré-requisito: `scripts/importar-livro-controlados-planilha.mjs --confirmar`
 * rodado contra o banco de testes (clínica "Animais Diagnóstico por Imagem").
 * Lê DATABASE_URL/SUPABASE_* do .env.local do cwd (jest-setup) — o banco de testes.
 *
 * Saída: C:/SysMax/.tmp/livro-controlados-teste.xlsx, para conferência visual.
 */
jest.mock('server-only', () => ({}), { virtual: true })
// exceljs carrega `uuid` (ESM puro na v14) — o jest/ts-jest não transforma node_modules.
jest.mock('uuid', () => ({ v4: () => require('node:crypto').randomUUID(), v1: () => require('node:crypto').randomUUID() }))

import { writeFileSync, existsSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { montarLivroControlados } from '@/lib/server/controlled-book-data'
import { gerarLivroControladosXlsx } from '@/lib/reports/controlled-book-xlsx'
import { montarResumo, montarFolha, todosOsItens } from '@/lib/controlled/livro-fiscal'

const PLANILHA = 'C:/Users/djham/Downloads/Controle_medicamentos_formato_modelo_2026_corrigido.xlsx'
const CLINICA = 'Animais Diagnóstico por Imagem'
const FROM = '2026-01-01', TO = '2026-10-31'
const r3 = (v: number) => Math.round(v * 1000) / 1000

const temPlanilha = existsSync(PLANILHA)
const describeSe = temPlanilha ? describe : describe.skip

describeSe('Livro de Controlados × planilha da Vigilância (banco de testes)', () => {
  jest.setTimeout(240_000)

  it('gera Excel e PDF e os totais batem com a planilha da clínica', async () => {
    const admin = createAdminClient()
    const { data: clinica } = await admin.from('clinics').select('id').eq('name', CLINICA).maybeSingle()
    expect(clinica?.id).toBeTruthy()

    const completo = await montarLivroControlados(admin, clinica!.id as string, FROM, TO)

    // O banco de testes recebeu depois o catálogo do Vertis, que trouxe outros
    // controlados com saldo inicial. A conferência é contra a planilha da
    // Vigilância, então o livro aqui é só a parte que veio dela.
    const { data: doVertis } = await admin.from('stock_items')
      .select('id').eq('clinic_id', clinica!.id as string).like('source_code', 'VERTIS-%')
    const idsVertis = new Set((doVertis ?? []).map(r => r.id as string))
    const semVertis = <T extends { stock_item_id: string }>(xs: T[]) => xs.filter(i => !idsVertis.has(i.stock_item_id))
    const book = { ...completo, veterinary: semVertis(completo.veterinary), human: semVertis(completo.human) }

    const itens = todosOsItens(book)
    expect(itens.length).toBeGreaterThanOrEqual(14)

    // ── Referência: a planilha da Aline ──────────────────────────────────────
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(PLANILHA)
    const resumoDela = new Map<string, { entradas: number; saidas: number }>()
    wb.getWorksheet('Resumo de saldos')!.eachRow((row, n) => {
      if (n === 1) return
      const med = String(row.getCell(1).value && typeof row.getCell(1).value === 'object' && 'result' in (row.getCell(1).value as object) ? (row.getCell(1).value as { result: string }).result : row.getCell(1).value)
      const num = (c: ExcelJS.Cell) => { const v = c.value as { result?: number } | number | null; return typeof v === 'object' && v ? Number(v.result ?? 0) : Number(v ?? 0) }
      resumoDela.set(med, { entradas: num(row.getCell(3)), saidas: num(row.getCell(4)) })
    })
    expect(resumoDela.size).toBe(14)

    // ── Totais por medicamento: entradas e saídas iguais; perdas só a de exemplo ──
    const resumo = montarResumo(book)
    const conferidos = new Set<string>()
    for (const r of resumo) {
      const dela = resumoDela.get(r.medicamento)
      if (!dela) continue            // medicamento cadastrado depois, fora da planilha
      conferidos.add(r.medicamento)
      expect(r3(r.entradas)).toBeCloseTo(r3(dela!.entradas), 3)
      expect(r3(r.saidas)).toBeCloseTo(r3(dela!.saidas), 3)
      expect(r.perdas).toBe(r.medicamento === 'Propofol' ? 20 : 0)
      expect(r3(r.saldo_inicial + r.entradas - r.saidas - r.perdas)).toBeCloseTo(r3(r.saldo_final), 3)
      expect(r.saldo_final).toBeGreaterThanOrEqual(0)
    }

    // Nenhum medicamento da planilha pode ter ficado de fora do livro.
    expect(conferidos.size).toBe(resumoDela.size)

    // ── Linhas por medicamento: cada aba dela tem o mesmo nº de movimentos ───
    for (const item of itens) {
      const folha = montarFolha(item)
      const abaDela = wb.getWorksheet(folha.substancia)
      if (!abaDela) continue         // medicamento fora da planilha da Vigilância
      let linhasDela = 0
      abaDela!.eachRow((row, n) => {
        if (n < 4) return
        const v = row.getCell(1).value as { result?: unknown } | null
        if (v && typeof v === 'object' && 'result' in v && v.result) linhasDela++
      })
      // nossas linhas, sem o saldo inicial e sem a perda de exemplo
      const nossas = folha.linhas.filter(l => l.pet_responsavel !== 'Saldo inicial' && l.perdas == null).length
      expect(nossas).toBe(linhasDela)
      // estoque nunca negativo em nenhuma linha
      for (const l of folha.linhas) expect(l.estoque).toBeGreaterThanOrEqual(0)
      // saídas sempre com OS, pet e procedimento (histórico da folha fiscal)
      for (const l of folha.linhas.filter(x => x.saida != null)) {
        expect(l.os).not.toBe('')
        expect(l.pet_responsavel).not.toBe('')
        expect(l.procedimento).not.toBe('')
      }
    }

    // ── Arquivos ─────────────────────────────────────────────────────────────
    const xlsx = await gerarLivroControladosXlsx(book)
    writeFileSync('C:/SysMax/.tmp/livro-controlados-teste.xlsx', xlsx)
    // O PDF (react-pdf, ESM puro) não carrega no jest: é exercitado pela rota
    // /api/reports/controlled-book no ambiente de testes (scripts/baixar-livro-controlados-dev.mjs).
    expect(xlsx.length).toBeGreaterThan(20_000)

    // ── Excel gerado: mesmas abas e fórmulas de estoque/totais ───────────────
    const nosso = new ExcelJS.Workbook()
    await nosso.xlsx.load(xlsx as unknown as ArrayBuffer)
    const abas = nosso.worksheets.map(w => w.name)
    expect(abas.slice(0, 4)).toEqual(['Resumo de saldos', 'Saldo inicial', 'Perdas', 'Lançamentos gerais'])
    for (const med of resumoDela.keys()) expect(abas).toContain(med)
    const propofol = nosso.getWorksheet('Propofol')!
    expect(propofol.getCell('A1').value).toContain('LIVRO DE REGISTRO ESPECÍFICO')
    expect(propofol.getCell('B4').value).toBe('Animal-Responsável')
    expect(propofol.getCell('D4').value).toBe('N. OS')
    expect(propofol.getCell('H3').value).toBe('ESTOQUE')
    const h6 = propofol.getCell('H6').value as { formula?: string }
    expect(h6.formula).toBe('H5+N(E6)-N(F6)-N(G6)')
    const resumoCell = nosso.getWorksheet('Resumo de saldos')!.getCell('G2').value as { formula?: string }
    expect(resumoCell.formula).toBe('C2+D2-E2-F2')
  })
})
