'use client'

import { useState } from 'react'
import { UploadCloud, FileType, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react'
import { importTutorsAndPets, type CsvRow } from '@/lib/actions/import'

export default function CsvImporter() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{ success?: number, error?: string } | null>(null)

  // Função para baixar a planilha modelo (AJUSTADA PARA O EXCEL BRASILEIRO)
  const downloadTemplate = () => {
    // Agora usamos ponto-e-vírgula para abrir perfeitamente no Excel sem desconfigurar
    const headers = "tutor_name;tutor_cpf;tutor_phone;tutor_email;pet_name;pet_species;pet_breed;pet_weight\n"
    const example = "João Silva;11122233344;11999999999;joao@email.com;Rex;Cachorro;Labrador;25.5\n"
    const blob = new Blob([headers + example], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = "SysVetMax_modelo_importacao.csv"
    link.click()
  }

  // Leitor de CSV Nativo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return
    setFile(uploadedFile)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      // Lida com quebras de linha tanto do Windows quanto do Mac
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
      if (lines.length < 2) return 
      
      // DETETOR INTELIGENTE: Descobre se o arquivo usa ; ou ,
      const separator = text.includes(';') ? ';' : ','
      
      const parsedRows: CsvRow[] = lines.slice(1).map(line => {
        // Separa as colunas usando o separador correto
        const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`)
        const values = line.split(regex).map(v => v.replace(/"/g, '').trim())
        
        return {
          tutor_name: values[0] || '',
          tutor_cpf: values[1] || '',
          tutor_phone: values[2] || '',
          tutor_email: values[3] || '',
          pet_name: values[4] || '',
          pet_species: values[5] || '',
          pet_breed: values[6] || '',
          pet_weight: values[7] || ''
        }
      }).filter(row => row.tutor_name && row.pet_name)

      setPreview(parsedRows)
    }
    reader.readAsText(uploadedFile)
  }

  const handleImport = async () => {
    if (preview.length === 0) return
    setIsImporting(true)
    setResult(null)

    const res = await importTutorsAndPets(preview)
    
    if ('error' in res) {
      setResult({ error: res.error })
    } else {
      setResult({ success: res.imported })
      setFile(null)
      setPreview([])
    }
    setIsImporting(false)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Importação em Massa</h2>
          <p className="text-sm text-slate-500">Migre tutores e pets de outro sistema via planilha CSV.</p>
        </div>
        <button 
          onClick={downloadTemplate}
          className="flex items-center gap-2 text-sm font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-4 py-2.5 rounded-xl transition-colors"
        >
          <Download className="h-4 w-4" /> Baixar Planilha Modelo
        </button>
      </div>

      {!file && (
        <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
          <div className="h-14 w-14 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <UploadCloud className="h-6 w-6 text-violet-500" />
          </div>
          <span className="text-sm font-bold text-slate-700">Clique para anexar arquivo .CSV</span>
          <span className="text-xs text-slate-400 mt-1">Tamanho máximo: 5MB</span>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
        </label>
      )}

      {file && preview.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-violet-50 p-4 rounded-2xl border border-violet-100">
            <div className="flex items-center gap-3">
              <FileType className="h-8 w-8 text-violet-600" />
              <div>
                <p className="text-sm font-bold text-violet-900">{file.name}</p>
                <p className="text-xs text-violet-600">{preview.length} registros válidos encontrados</p>
              </div>
            </div>
            <button onClick={() => { setFile(null); setPreview([]) }} className="text-xs font-bold text-rose-500 hover:text-rose-700 px-3 py-1.5 bg-white rounded-lg shadow-sm">
              Trocar Arquivo
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tutor</th>
                  <th className="px-4 py-3 font-semibold">CPF</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">Pet</th>
                  <th className="px-4 py-3 font-semibold">Espécie / Raça</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.slice(0, 5).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.tutor_name}</td>
                    <td className="px-4 py-3 text-slate-500">{row.tutor_cpf || 'Não preenchido'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.tutor_phone}</td>
                    <td className="px-4 py-3 font-medium text-violet-600">{row.pet_name}</td>
                    <td className="px-4 py-3 text-slate-600">{row.pet_species} {row.pet_breed ? `(${row.pet_breed})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 5 && (
              <div className="px-4 py-2 bg-slate-50 text-xs text-center text-slate-500 font-medium">
                Mostrando 5 de {preview.length} registros...
              </div>
            )}
          </div>

          <button
            onClick={handleImport}
            disabled={isImporting}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-violet-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
            {isImporting ? 'Importando...' : `Confirmar Importação de ${preview.length} clientes`}
          </button>
        </div>
      )}

      {/* Resultados Melhorados */}
      {result && (
        <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 border ${
          result.success !== undefined && result.success > 0 ? 'bg-emerald-50 border-emerald-200' : 
          result.success === 0 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
        }`}>
          
          {/* Ícone Dinâmico */}
          {result.success !== undefined && result.success > 0 ? <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" /> : 
           result.success === 0 ? <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" /> : 
           <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />}
          
          <div>
            {/* Título Dinâmico */}
            <h3 className={`text-sm font-bold ${
              result.success !== undefined && result.success > 0 ? 'text-emerald-800' : 
              result.success === 0 ? 'text-amber-800' : 'text-rose-800'
            }`}>
              {result.success !== undefined && result.success > 0 ? 'Importação Concluída!' : 
               result.success === 0 ? 'Registros Já Existentes' : 'Erro na Importação'}
            </h3>
            
            {/* Mensagem Dinâmica */}
            <p className={`text-xs mt-0.5 leading-relaxed ${
              result.success !== undefined && result.success > 0 ? 'text-emerald-600' : 
              result.success === 0 ? 'text-amber-700' : 'text-rose-600'
            }`}>
              {result.success !== undefined && result.success > 0 
                ? `${result.success} novos clientes/pets foram adicionados com sucesso ao seu banco de dados.` 
                : result.success === 0 
                ? 'Todos os tutores e pets desta planilha já constam no banco de dados. O sistema bloqueou as duplicidades automaticamente para manter o seu cadastro limpo.' 
                : result.error}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}