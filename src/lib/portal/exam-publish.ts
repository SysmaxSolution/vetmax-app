// Lógica PURA: quais resultados de LABORATÓRIO aparecem no Portal do Tutor,
// conforme o flag publish_to_portal de cada serviço do catálogo.
//
// Regra (opt-in não-destrutivo): se a clínica NÃO marcou nenhum serviço de exame
// como "publicar no portal", mostra tudo que o MV liberou (comportamento atual).
// Assim que marca ao menos um, passa a mostrar SÓ os painéis correspondentes a
// serviços publicados (casados por nome). Painel vazio sempre aparece (não dá p/
// classificar). Casamento por nome é tolerante a acento, caixa e sufixos.

export function normalizeServiceName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')                        // remove [DEMO] etc.
    .replace(/[^a-z0-9]+/g, ' ')                        // só alfanumérico
    .replace(/\s+/g, ' ').trim()
}

/** Um painel está publicado se casa (contém, em qualquer direção) com algum nome de serviço publicado. */
export function isPanelPublished(panel: string | null | undefined, publishedNames: string[]): boolean {
  const p = normalizeServiceName(panel)
  if (!p) return true                      // painel vazio → não classificável → mostra
  return publishedNames.some(n => n && (p.includes(n) || n.includes(p)))
}

export interface CatalogServiceLike { name: string; publish_to_portal: boolean }
export interface ExamPanelLike { panel: string | null }

/** Filtra os resultados de exame pelos serviços publicados. */
export function filterPublishedExams<T extends ExamPanelLike>(
  exams: T[],
  services: CatalogServiceLike[],
): T[] {
  const published = services.filter(s => s.publish_to_portal).map(s => normalizeServiceName(s.name)).filter(Boolean)
  if (published.length === 0) return exams  // clínica não configurou → mostra tudo
  return exams.filter(e => isPanelPublished(e.panel, published))
}
