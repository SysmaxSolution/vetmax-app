'use client'

import { useState, useRef } from 'react'
import { Upload, Download, X, AlertTriangle, Check, Loader2, FileText } from 'lucide-react'
import { bulkImportStockItems, type BulkImportRow } from '@/lib/actions/stock'
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES, type StockCategory } from '@/lib/stock-constants'

// ─── Templates ────────────────────────────────────────────────────────────────

const PRODUCT_TEMPLATE = `nome,categoria,quantidade,unidade,preco,estoque_minimo,marca,fornecedor,lote,validade,controlado
Amoxicilina 250mg,medication,100,comprimido,5.50,20,Duprat,Distribuidora Pet,LOT2024A,2025-12-31,nao
Ketamina 10%,controlled_medication,10,frasco,45.00,3,Vetnil,,LOT2024B,2025-06-30,sim
Luva Descartável M,clinic_product,500,un,0.35,100,Supermax,MedPro,,,,
Coleira Antipulgas P,petshop,30,un,28.90,5,Seresto,PetBrasil,,,,
Shampoo Neutro 500ml,grooming_supply,20,frasco,18.50,5,Banho Pet,Distribuidora,,,,
Perfume Cãozinho,aesthetics,15,frasco,35.00,3,PetPerfume,,,,,`

const SERVICE_TEMPLATE = `nome,categoria,preco
Consulta Veterinária,service,150.00
Retorno / Acompanhamento,service,80.00
Hemograma Completo,exam,90.00
Radiografia (por incidência),exam,120.00
Banho Completo,service,70.00
Tosa Higiênica,service,40.00`

const VALID_PRODUCT_CATS = new Set(PRODUCT_CATEGORIES)
const VALID_SERVICE_CATS = new Set(SERVICE_CATEGORIES)

// ─── Parser ───────────────────────────────────────────────────────────────────

interface ParseError { row: number; reason: string }
interface ParseResult { rows: BulkImportRow[]; errors: ParseError[] }

function detectSep(line: string): string {
  return line.includes(';') ? ';' : ','
}

function parseBool(v: string): boolean {
  return ['sim', 'yes', 'true', '1', 's'].includes(v.trim().toLowerCase())
}

function parseFloat2(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

function parseProductCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, reason: 'Arquivo vazio ou sem dados.' }] }
  const sep = detectSep(lines[0])
  const cols = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/"/g, ''))
  const idx = (name: string) => cols.indexOf(name)

  const iNome   = idx('nome')
  const iCat    = idx('categoria')
  const iQtd    = idx('quantidade')
  const iUnit   = idx('unidade')
  const iPreco  = idx('preco')
  const iMin    = idx('estoque_minimo')
  const iMarca  = idx('marca')
  const iForn   = idx('fornecedor')
  const iLote   = idx('lote')
  const iVal    = idx('validade')
  const iCtrl   = idx('controlado')

  if (iNome < 0 || iCat < 0) {
    return { rows: [], errors: [{ row: 0, reason: 'Colunas obrigatórias: nome, categoria' }] }
  }

  const rows: BulkImportRow[] = []
  const errors: ParseError[]  = []

  lines.slice(1).forEach((line, i) => {
    const rowNum = i + 2
    const cells  = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    const nome   = cells[iNome] ?? ''
    const cat    = (cells[iCat] ?? '').toLowerCase().trim() as StockCategory

    if (!nome) { errors.push({ row: rowNum, reason: 'Nome vazio' }); return }
    if (!VALID_PRODUCT_CATS.has(cat)) {
      errors.push({ row: rowNum, reason: `Categoria inválida: "${cat}". Use: ${PRODUCT_CATEGORIES.join(', ')}` })
      return
    }

    rows.push({
      name:          nome,
      category:      cat,
      quantity:      iQtd  >= 0 ? parseFloat2(cells[iQtd]  ?? '0') : 0,
      unit:          iUnit >= 0 ? (cells[iUnit] ?? 'un') || 'un' : 'un',
      unit_price:    iPreco >= 0 ? parseFloat2(cells[iPreco] ?? '0') : 0,
      min_quantity:  iMin  >= 0 ? parseFloat2(cells[iMin]  ?? '0') : 0,
      is_service:    false,
      is_controlled: iCtrl >= 0 ? parseBool(cells[iCtrl] ?? '') : cat === 'controlled_medication',
      brand:         iMarca >= 0 ? cells[iMarca] || null : null,
      supplier:      iForn  >= 0 ? cells[iForn]  || null : null,
      sku:           null,
      barcode:       null,
      batch_number:  iLote >= 0 ? cells[iLote] || null : null,
      expiry_date:   iVal  >= 0 ? parseDateBR(cells[iVal] ?? '') : null,
    })
  })

  return { rows, errors }
}

function parseServiceCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, reason: 'Arquivo vazio ou sem dados.' }] }
  const sep = detectSep(lines[0])
  const cols = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/"/g, ''))
  const iNome  = cols.indexOf('nome')
  const iCat   = cols.indexOf('categoria')
  const iPreco = cols.indexOf('preco')

  if (iNome < 0 || iCat < 0 || iPreco < 0) {
    return { rows: [], errors: [{ row: 0, reason: 'Colunas obrigatórias: nome, categoria, preco' }] }
  }

  const rows: BulkImportRow[] = []
  const errors: ParseError[]  = []

  lines.slice(1).forEach((line, i) => {
    const rowNum = i + 2
    const cells  = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    const nome   = cells[iNome] ?? ''
    const cat    = (cells[iCat] ?? '').toLowerCase().trim() as StockCategory

    if (!nome) { errors.push({ row: rowNum, reason: 'Nome vazio' }); return }
    if (!VALID_SERVICE_CATS.has(cat)) {
      errors.push({ row: rowNum, reason: `Categoria inválida: "${cat}". Use: ${SERVICE_CATEGORIES.join(', ')}` })
      return
    }

    rows.push({
      name: nome, category: cat,
      quantity: 0, unit: 'un', min_quantity: 0,
      unit_price: parseFloat2(cells[iPreco] ?? '0'),
      is_service: true, is_controlled: false,
      brand: null, sku: null, barcode: null,
      batch_number: null, expiry_date: null, supplier: null,
    })
  })

  return { rows, errors }
}

function parseDateBR(val: string): string | null {
  if (!val) return null
  // Aceita DD/MM/YYYY ou YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mode:    'products' | 'services'
  onDone:  (inserted: number) => void
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StockCsvImporter({ mode, onDone, onClose }: Props) {
  const [file,       setFile]       = useState<File | null>(null)
  const [preview,    setPreview]    = useState<BulkImportRow[]>([])
  const [errors,     setErrors]     = useState<ParseError[]>([])
  const [saving,     setSaving]     = useState(false)
  const [result,     setResult]     = useState<{ inserted: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isProducts = mode === 'products'
  const template   = isProducts ? PRODUCT_TEMPLATE : SERVICE_TEMPLATE
  const filename   = isProducts ? 'template_produtos.csv' : 'template_servicos.csv'
  const title      = isProducts ? 'Importar Produtos em Massa' : 'Importar Serviços em Massa'

  async function handleFile(f: File) {
    setFile(f); setResult(null)
    const text = await f.text()
    const parsed = isProducts ? parseProductCsv(text) : parseServiceCsv(text)
    setPreview(parsed.rows)
    setErrors(parsed.errors)
  }

  async function handleImport() {
    if (preview.length === 0) return
    setSaving(true)
    const res = await bulkImportStockItems(preview)
    setSaving(false)
    if ('error' in res) { setErrors([{ row: 0, reason: res.error }]); return }
    setResult(res)
    onDone(res.inserted)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
              <Upload className="h-4 w-4 text-white" />
            </div>
            <p className="text-sm font-semibold text-white">{title}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Instruções + template */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Instruções</p>
            <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
              {isProducts ? <>
                <li>Colunas: <code className="bg-slate-100 px-1 rounded">nome, categoria, quantidade, unidade, preco, estoque_minimo</code></li>
                <li>Categorias válidas: <code className="bg-slate-100 px-1 rounded">{PRODUCT_CATEGORIES.join(', ')}</code></li>
                <li>Colunas opcionais: marca, fornecedor, lote, validade (DD/MM/AAAA), controlado (sim/não)</li>
              </> : <>
                <li>Colunas: <code className="bg-slate-100 px-1 rounded">nome, categoria, preco</code></li>
                <li>Categorias válidas: <code className="bg-slate-100 px-1 rounded">{SERVICE_CATEGORIES.join(', ')}</code></li>
              </>}
              <li>Separador: vírgula ou ponto-e-vírgula. Encoding: UTF-8.</li>
              <li>Itens com nome duplicado serão ignorados (sem sobrescrever).</li>
            </ul>
            <button
              onClick={() => downloadTemplate(template, filename)}
              className="flex items-center gap-1.5 text-xs text-teal-700 font-semibold hover:text-teal-800"
            >
              <Download className="h-3.5 w-3.5" /> Baixar template CSV
            </button>
          </div>

          {/* Upload area */}
          {!result && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors"
            >
              <FileText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              {file
                ? <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                : <p className="text-sm text-slate-400">Clique para selecionar um arquivo CSV</p>
              }
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}

          {/* Erros de parse */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {errors.length} erro{errors.length !== 1 ? 's' : ''} encontrado{errors.length !== 1 ? 's' : ''}
              </p>
              {errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-600">Linha {e.row}: {e.reason}</p>
              ))}
              {errors.length > 5 && (
                <p className="text-xs text-red-400">... e mais {errors.length - 5} erros</p>
              )}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && !result && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">
                {preview.length} item{preview.length !== 1 ? 's' : ''} válido{preview.length !== 1 ? 's' : ''} para importar:
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Nome</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Categoria</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-500">Preço</th>
                      {isProducts && <th className="text-right px-3 py-2 font-semibold text-slate-500">Qtd.</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {preview.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 text-slate-800 font-medium">
                          {r.name}
                          {r.is_controlled && <span className="ml-1 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold">CTRL</span>}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{r.category}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">
                          {r.unit_price > 0 ? `R$ ${r.unit_price.toFixed(2)}` : '—'}
                        </td>
                        {isProducts && <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{r.quantity} {r.unit}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 text-center">
              <Check className="h-8 w-8 mx-auto text-teal-600 mb-2" />
              <p className="text-sm font-bold text-teal-800">Importação concluída!</p>
              <p className="text-sm text-teal-600 mt-1">
                <strong>{result.inserted}</strong> item{result.inserted !== 1 ? 's' : ''} importado{result.inserted !== 1 ? 's' : ''}
                {result.skipped > 0 && `, ${result.skipped} ignorado${result.skipped !== 1 ? 's' : ''} (duplicata)`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result && preview.length > 0 && (
            <button onClick={handleImport} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {saving ? 'Importando...' : `Importar ${preview.length} itens`}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
