'use client'

// Palavras de ativação e encerramento de voz — padrão global SysVetMax.
// Importe aqui ao adicionar wake-word support em qualquer módulo.

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
  return new RegExp('\\b(' + [...DEFAULT_WAKE_WORDS, ...custom.map(esc)].join('|') + ')\\b', 'i')
}

export function buildStopRe(custom: string[] = []): RegExp {
  return new RegExp('(' + [...DEFAULT_STOP_WORDS, ...custom.map(esc)].join('|') + ')', 'i')
}
