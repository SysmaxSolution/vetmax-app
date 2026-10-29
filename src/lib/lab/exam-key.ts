// Qual EXAME cada analito pertence. Sem I/O — testável.
//
// Isto é a unidade do fluxo, e vinha faltando. "Hemograma" e "Bioquímico" não
// são dois exames: na tabela de preços da Clínica Animais cada analito de
// bioquímica é um exame vendido à parte — 33 Creatinina, 47 Ureia, 46 ALT,
// 36 Fosfatase Alcalina… — enquanto "21 Hemograma" é um exame só, que o
// analisador hematológico entrega inteiro.
//
// O laudo real deles confirma: uma OS, paginação contínua, e UMA ASSINATURA
// POR EXAME. São sete laudos no mesmo lote, não um laudo misturado.
//
// Por isso cada exame tem conferência, liberação e assinatura próprias.

import { biochemDef } from './biochem-report'
import { HEMOGRAM_DEFS, splitAnalyteCode } from './hemogram-report'

export interface ExamKey {
  /** Identificador estável do exame dentro da OS. */
  key:   string
  /** Como aparece no título do laudo. */
  title: string
  /** Aparelho/seção de origem — serve para agrupar na tela. */
  group: 'hemograma' | 'bioquimico' | 'outros'
}

export const HEMOGRAMA: ExamKey = { key: 'hemograma', title: 'HEMOGRAMA', group: 'hemograma' }

/**
 * Descobre a que exame o analito pertence.
 * Bioquímica: cada bloco do catálogo é um exame (ALT, CREA, UREIA, BIL…).
 * Hematologia: tudo que o analisador mede no CBC cai no mesmo exame.
 */
export function examKeyOf(
  code: string | null | undefined,
  name?: string | null,
): ExamKey {
  const bio = biochemDef(code, name)
  if (bio) return { key: `bio:${bio.block}`, title: bio.title, group: 'bioquimico' }

  const { base } = splitAnalyteCode(code ?? name)
  if (base && HEMOGRAM_DEFS[base]) return HEMOGRAMA

  // Analito que não está em catálogo nenhum ainda entra no hemograma só quando
  // veio junto do hematológico; fora disso fica num exame "outros", para não
  // sumir do laudo nem contaminar a assinatura de outro exame.
  return { key: 'outros', title: 'OUTROS PARÂMETROS', group: 'outros' }
}

export interface ExamSummaryInput {
  analyte_code: string | null
  analyte_name: string
  status:       string
  released_at:  string | null
}

export interface ExamSummary extends ExamKey {
  total:       number
  released:    number
  draft:       number
  /** 'released' só quando TODOS os analitos daquele exame já foram liberados. */
  status:      'released' | 'draft'
  released_at: string | null
}

/** Agrupa os resultados da OS por exame, cada um com o seu estado. */
export function summarizeExams(rows: ExamSummaryInput[]): ExamSummary[] {
  const mapa = new Map<string, ExamSummary>()
  for (const r of rows) {
    const ek = examKeyOf(r.analyte_code, r.analyte_name)
    let e = mapa.get(ek.key)
    if (!e) {
      e = { ...ek, total: 0, released: 0, draft: 0, status: 'draft', released_at: null }
      mapa.set(ek.key, e)
    }
    e.total++
    if (r.status === 'released') {
      e.released++
      if (r.released_at && (!e.released_at || r.released_at > e.released_at)) e.released_at = r.released_at
    } else {
      e.draft++
    }
  }
  for (const e of mapa.values()) {
    // Um exame só está liberado quando nada dele ficou em rascunho. Meio
    // liberado não existe num documento assinado.
    e.status = e.total > 0 && e.draft === 0 ? 'released' : 'draft'
    if (e.status !== 'released') e.released_at = null
  }
  // Hemograma primeiro (é o que abre o laudo deles), depois bioquímica em ordem.
  const peso = (g: ExamKey['group']) => (g === 'hemograma' ? 0 : g === 'bioquimico' ? 1 : 2)
  return [...mapa.values()].sort(
    (a, b) => peso(a.group) - peso(b.group) || a.title.localeCompare(b.title, 'pt-BR'),
  )
}
