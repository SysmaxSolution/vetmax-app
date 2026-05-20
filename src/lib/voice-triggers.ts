'use client'

// Palavras de ativação e encerramento de voz — padrão global SysVetMax.
// Importe aqui ao adicionar wake-word support em qualquer módulo.

import Fuse from 'fuse.js'

function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Wake words: priorizar marca + composições. "assistente" sozinho é um falso-positivo
// frequente ("o assistente vai te ajudar") — exigir "ativar/ei/olá assistente".
const DEFAULT_WAKE_WORDS = [
  'vet ?max', 'pet ?max', 'bet ?max', 'vet ?mas', 'ver ?max',
  '(?:ativar|ol[áa]|ei|hey) +assistente',
  'gravar evolu[çc][ãa]o',
  'iniciar grava[çc][ãa]o',
  'come[çc]ar grava[çc][ãa]o',
  'come[çc]ar registro',
  'ligar microfone',
  'iniciar registro',
  'gravar observa[çc][ãa]o',
  'gravar anota[çc][ãa]o',
  'iniciar anota[çc][ãa]o',
]

// Stop words: evitar verbos isolados ("finalizar", "concluir") que aparecem em
// discurso clínico normal. Exigir intenção explícita ("finalizar registro",
// "encerrar gravação", "salvar e fechar").
const DEFAULT_STOP_WORDS = [
  'salvar evolu[çc][ãa]o',
  'pode salvar',
  'encerrar grava[çc][ãa]o',
  'terminar grava[çc][ãa]o',
  'parar grava[çc][ãa]o',
  'encerrar registro',
  'terminar registro',
  'finalizar registro',
  'finalizar grava[çc][ãa]o',
  'concluir registro',
  'concluir grava[çc][ãa]o',
  'salvar e fechar',
  'pronto,? +pode salvar',
]

export function buildWakeRe(custom: string[] = []): RegExp {
  // Usa exclusivamente os triggers da clínica quando configurados.
  // Defaults só como fallback quando a clínica não tem triggers no banco.
  const terms = custom.length > 0 ? custom.map(esc) : DEFAULT_WAKE_WORDS
  return new RegExp('\\b(' + terms.join('|') + ')\\b', 'i')
}

export function buildStopRe(custom: string[] = []): RegExp {
  // Usa exclusivamente os triggers da clínica quando configurados.
  // Defaults só como fallback quando a clínica não tem triggers no banco.
  const terms = custom.length > 0 ? custom.map(esc) : DEFAULT_STOP_WORDS
  return new RegExp('\\b(' + terms.join('|') + ')\\b', 'i')
}

/**
 * Testa se o texto transcrito corresponde a algum gatilho personalizado via fuzzy matching.
 * Threshold 0.2 (estrito) para evitar disparos em discurso clínico normal.
 * Quando triggers curtos (≤1 palavra) são configurados, exige match exato word-boundary,
 * porque o fuzzy degenera em correspondências pobres com 1-palavra.
 */
export function fuzzyMatchCustom(text: string, triggers: string[]): boolean {
  if (!triggers.length || !text.trim()) return false
  const txt = text.toLowerCase()
  const longTriggers: string[] = []
  for (const t of triggers) {
    const trimmed = t.trim()
    if (!trimmed) continue
    if (trimmed.split(/\s+/).length <= 1) {
      // Trigger de 1 palavra: word-boundary literal, sem fuzzy.
      if (new RegExp('\\b' + esc(trimmed.toLowerCase()) + '\\b').test(txt)) return true
    } else {
      longTriggers.push(trimmed)
    }
  }
  if (!longTriggers.length) return false
  const fuse = new Fuse(longTriggers, { includeScore: true, threshold: 0.2 })
  // Só testa segmentos contíguos de tamanho compatível com o trigger (palavras=N).
  const words = txt.split(/\s+/).filter(Boolean)
  const sizes = Array.from(new Set(longTriggers.map(t => t.split(/\s+/).length)))
  for (const n of sizes) {
    for (let i = 0; i + n <= words.length; i++) {
      const seg = words.slice(i, i + n).join(' ')
      if (fuse.search(seg).some(r => (r.score ?? 1) <= 0.2)) return true
    }
  }
  return false
}
