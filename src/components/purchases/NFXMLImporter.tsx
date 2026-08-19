'use client'

import { useState, useCallback, useTransition } from 'react'
import { Upload, X, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { importNFeXML, enrichProductFromNCM } from '@/lib/actions/purchases'
import type { PurchaseOrder } from '@/lib/actions/purchases'
import { parseNFeXML } from '@/lib/utils/nfe-parser'
import type { ParsedNFe } from '@/lib/utils/nfe-parser'
import { NFXMLPreview } from './NFXMLPreview'

interface Props {
  onClose:    () => void
  onImported: (order: PurchaseOrder) => void
}

type Step = 'upload' | 'preview' | 'importing' | 'success' | 'error'

export function NFXMLImporter({ onClose, onImported }: Props) {
  const [step, setStep]         = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [xmlContent, setXmlContent] = useState<string | null>(null)
  const [parsed, setParsed]     = useState<ParsedNFe | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.xml')) {
      setErrorMsg('O arquivo deve ser um XML de NF-e.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const result = parseNFeXML(content)
      if ('error' in result) {
        setErrorMsg(result.error)
        setStep('error')
        return
      }
      setXmlContent(content)
      setParsed(result)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleImport() {
    if (!xmlContent) return
    setStep('importing')
    startTransition(async () => {
      const result = await importNFeXML(xmlContent)
      if ('error' in result) {
        setErrorMsg(result.error)
        setStep('error')
      } else {
        setStep('success')
        setTimeout(() => onImported(result), 1000)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold text-slate-800">Importar NF-e XML</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {step === 'upload' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 transition-colors cursor-pointer ${
                dragging ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-slate-50 hover:border-purple-300 hover:bg-purple-50/50'
              }`}
              onClick={() => document.getElementById('nfe-xml-input')?.click()}
            >
              <Upload className={`h-12 w-12 mb-3 ${dragging ? 'text-purple-500' : 'text-slate-300'}`} />
              <p className="font-semibold text-slate-700">Arraste o arquivo XML da NF-e aqui</p>
              <p className="mt-1 text-sm text-slate-400">ou clique para selecionar</p>
              <p className="mt-2 text-xs text-slate-400">Formato: NF-e 4.0 (.xml)</p>
              <input
                id="nfe-xml-input"
                type="file"
                accept=".xml"
                className="hidden"
                onChange={onFileInput}
              />
            </div>
          )}

          {step === 'preview' && parsed && (
            <NFXMLPreview parsed={parsed} />
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
              <p className="font-medium text-slate-700">Processando NF-e...</p>
              <p className="text-sm text-slate-400">Criando/atualizando fornecedor e itens</p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="font-bold text-slate-800">NF-e importada com sucesso!</p>
              <p className="text-sm text-slate-500">Redirecionando para a ordem de compra...</p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <AlertCircle className="h-12 w-12 text-red-400" />
              <p className="font-bold text-red-700">Erro ao processar XML</p>
              <p className="text-sm text-slate-600 max-w-sm">{errorMsg}</p>
              <button
                onClick={() => { setStep('upload'); setErrorMsg(null) }}
                className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'preview') && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 shrink-0">
            <button
              onClick={() => { setStep('upload'); setParsed(null); setXmlContent(null) }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Voltar
            </button>
            <button
              onClick={handleImport}
              disabled={isPending}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Importação
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
