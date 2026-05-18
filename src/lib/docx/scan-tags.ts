/**
 * Extrai as tags presentes em um DOCX e mapeia para chaves canônicas.
 * Usado na importacao de templates: a clinica sobe o .docx, o sistema
 * registra quais variaveis sao necessarias.
 */

import PizZip from 'pizzip'
import { getAllKnownTags } from './known-tags'

export interface ScannedTag {
  literal: string
  canonical: string
  occurrences: number
}

export interface ScanResult {
  tags: ScannedTag[]
  unknownLiterals: string[]   // candidatos que parecem placeholder porem nao estao na whitelist
  totalRunsWithText: number
  rawText: string
}

const PLACEHOLDER_LIKE = /\b(?:Custom_|Code_|Patient_|Medicament[oa]s?_|Medicamento\d+_|medicamento\d+_|Cidade_da_|sigla_|Dia_|mes_|ano_)[A-Za-z0-9_çãéíóúáàâêôõ]+\b/g

export function scanDocxTags(buffer: Buffer | Uint8Array): ScanResult {
  const zip = new PizZip(buffer)
  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) throw new Error('DOCX invalido: ausente word/document.xml')
  const xml = docXmlFile.asText()

  // Para detectar tags fragmentadas, concatenamos por parágrafo
  const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map(
    (m) => {
      const ts = [...m[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      return ts.map((t) => decode(t[1])).join('')
    },
  )
  const rawText = paragraphs.join('\n')

  const known = getAllKnownTags()
  const seen = new Map<string, ScannedTag>()

  for (const t of known) {
    if (!rawText.includes(t.literal)) continue
    const occ = (rawText.match(new RegExp(escapeReg(t.literal), 'g')) ?? []).length
    seen.set(t.literal, {
      literal: t.literal,
      canonical: t.canonical,
      occurrences: occ,
    })
  }

  // Candidatos nao mapeados — para suporte humano resolver
  const knownLiterals = new Set(known.map((k) => k.literal))
  const unknownLiterals = new Set<string>()
  for (const m of rawText.matchAll(PLACEHOLDER_LIKE)) {
    if (!knownLiterals.has(m[0])) unknownLiterals.add(m[0])
  }

  const totalRunsWithText =
    (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? []).length

  return {
    tags: Array.from(seen.values()).sort((a, b) => a.literal.localeCompare(b.literal)),
    unknownLiterals: Array.from(unknownLiterals).sort(),
    totalRunsWithText,
    rawText,
  }
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
