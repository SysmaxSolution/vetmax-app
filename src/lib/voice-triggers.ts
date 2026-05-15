'use client'

// Palavras de ativação e encerramento de voz — padrão global SysVetMax.
// Importe aqui ao adicionar wake-word support em qualquer módulo.

import Fuse from 'fuse.js'

function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

const DEFAULT_WAKE_WORDS = [
  'vet ?max', 'pet ?max', 'bet ?max', 'vet ?mas', 'ver ?max',
  'assistente',
  'gravar evolu[çc][ãa]o',
  'iniciar grava[çc][ãa]o',
  'come[çc]ar grava[çc][ãa]o',
  'come[çc]ar registro',
  'ativar assistente',
  'ligar microfone',
  'iniciar registro',
  'gravar observa[çc][ãa]o',
  'gravar anota[çc][ãa]o',
  'iniciar anota[çc][ãa]o',
]

const DEFAULT_STOP_WORDS = [
  'salvar evolu[çc][ãa]o',
  'finalizar',
  'pode salvar',
  'encerrar grava[çc][ãa]o',
  'terminar grava[çc][ãa]o',
  'parar grava[çc][ãa]o',
  'concluir',
  'encerrar registro',
  'terminar registro',
  'pronto[,.]?\\s*(?:pode)?\\s*(?:salvar)?',
  'salvar e fechar',
  'finalizar registro',
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
  return new RegExp('(' + terms.join('|') + ')', 'i')
}

/**
 * Testa se o texto transcrito corresponde a algum gatilho personalizado via fuzzy matching.
 * Usa Fuse.js com threshold 0.35 para tolerar erros de pronúncia/transcrição.
 * Complementa buildWakeRe/buildStopRe para gatilhos de clínica que não são regex.
 */
export function fuzzyMatchCustom(text: string, triggers: string[]): boolean {
  if (!triggers.length || !text.trim()) return false
  const fuse = new Fuse(triggers, { includeScore: true, threshold: 0.35 })
  // Testa o texto completo e também cada segmento de 3+ palavras para maior recall
  const segments = [text, ...text.split(' ').reduce<string[]>((acc, _, i, arr) => {
    if (i + 2 < arr.length) acc.push(arr.slice(i, i + 3).join(' '))
    return acc
  }, [])]
  return segments.some(seg => fuse.search(seg).some(r => (r.score ?? 1) <= 0.35))
}
