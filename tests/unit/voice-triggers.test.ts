/**
 * Unit — Voice triggers (wake/stop regex + fuzzy match)
 */

import { buildWakeRe, buildStopRe, fuzzyMatchCustom } from '@/lib/voice-triggers'

// ─── Wake words defaults ──────────────────────────────────────────────────────

describe('TC-VOICE-001 → "vetmax" ativa wake default', () => {
  test('vetmax → match', () => {
    const re = buildWakeRe()
    expect(re.test('vetmax me ajuda')).toBe(true)
  })
})

describe('TC-VOICE-002 → "vet max" (com espaço) ativa wake', () => {
  test('vet max → match', () => {
    const re = buildWakeRe()
    expect(re.test('vet max iniciar')).toBe(true)
  })
})

describe('TC-VOICE-003 → "petmax" ativa wake (variante reconhecida)', () => {
  test('petmax → match', () => {
    const re = buildWakeRe()
    expect(re.test('petmax assistente')).toBe(true)
  })
})

describe('TC-VOICE-004 → "ativar assistente" ativa wake', () => {
  // Endurecido contra falso-positivo clínico: "assistente" sozinho não dispara
  // (ver src/lib/voice-triggers.ts:14 — exige ativar|olá|ei|hey + assistente).
  test('ativar assistente → match', () => {
    const re = buildWakeRe()
    expect(re.test('ativar assistente registre tudo')).toBe(true)
  })
})

describe('TC-VOICE-005 → "gravar evolucao" (sem acento) ativa', () => {
  test('gravar evolucao → match', () => {
    const re = buildWakeRe()
    expect(re.test('por favor gravar evolucao')).toBe(true)
  })
})

describe('TC-VOICE-006 → "gravar evolução" (com acento) ativa', () => {
  test('gravar evolução → match', () => {
    const re = buildWakeRe()
    expect(re.test('gravar evolução agora')).toBe(true)
  })
})

describe('TC-VOICE-007 → "iniciar gravacao" ativa', () => {
  test('iniciar gravacao → match', () => {
    const re = buildWakeRe()
    expect(re.test('iniciar gravacao da consulta')).toBe(true)
  })
})

describe('TC-VOICE-008 → "ativar assistente" ativa', () => {
  test('ativar assistente → match', () => {
    const re = buildWakeRe()
    expect(re.test('ativar assistente vetmax')).toBe(true)
  })
})

describe('TC-VOICE-009 → case insensitive', () => {
  test('VETMAX em maiúsculas funciona', () => {
    const re = buildWakeRe()
    expect(re.test('VETMAX assistente')).toBe(true)
  })

  test('GraVar EvoLuçÃo em case misto', () => {
    const re = buildWakeRe()
    expect(re.test('GraVar EvoLuçÃo')).toBe(true)
  })
})

describe('TC-VOICE-010 → Texto sem wake word → false', () => {
  test('"olá doutor" → não dispara', () => {
    const re = buildWakeRe()
    expect(re.test('olá doutor')).toBe(false)
  })

  test('"" → não dispara', () => {
    const re = buildWakeRe()
    expect(re.test('')).toBe(false)
  })
})

// ─── Stop words ───────────────────────────────────────────────────────────────

describe('TC-VOICE-011 → "salvar evolução" para a gravação', () => {
  test('salvar evolução → match stop', () => {
    const re = buildStopRe()
    expect(re.test('pode salvar evolução')).toBe(true)
  })
})

describe('TC-VOICE-012 → "finalizar" stop', () => {
  test('finalizar → match', () => {
    const re = buildStopRe()
    expect(re.test('finalizar registro')).toBe(true)
  })
})

describe('TC-VOICE-013 → "encerrar gravação" stop', () => {
  test('encerrar gravação → match', () => {
    const re = buildStopRe()
    expect(re.test('encerrar gravação por favor')).toBe(true)
  })
})

describe('TC-VOICE-014 → "pronto, pode salvar" stop', () => {
  test('Padrão pronto + salvar', () => {
    const re = buildStopRe()
    expect(re.test('pronto, pode salvar')).toBe(true)
  })
})

describe('TC-VOICE-015 → "concluir gravação" stop', () => {
  // Endurecido: "concluir" sozinho aparece em discurso clínico ("vou concluir a consulta").
  // Exige intenção explícita: "concluir gravação" ou "concluir registro".
  test('concluir gravação → match', () => {
    const re = buildStopRe()
    expect(re.test('pode concluir gravação agora')).toBe(true)
  })
})

describe('TC-VOICE-016 → "parar gravacao" (sem acento) stop', () => {
  test('parar gravacao → match', () => {
    const re = buildStopRe()
    expect(re.test('parar gravacao')).toBe(true)
  })
})

describe('TC-VOICE-017 → Stop case insensitive', () => {
  test('FINALIZAR → match', () => {
    const re = buildStopRe()
    expect(re.test('FINALIZAR REGISTRO')).toBe(true)
  })
})

describe('TC-VOICE-018 → Texto sem stop → false', () => {
  test('"continue gravando" → não para', () => {
    const re = buildStopRe()
    expect(re.test('continue gravando')).toBe(false)
  })
})

// ─── Variações curtas (PO 2026-06-02) ────────────────────────────────────────

describe('TC-VOICE-018a → variações curtas pedidas pelo PO', () => {
  const re = buildStopRe()
  test('"pode finaliza" → match', () => {
    expect(re.test('doutor, pode finaliza')).toBe(true)
  })
  test('"finalizar" sozinho → match', () => {
    expect(re.test('pode finalizar')).toBe(true)
  })
  test('"finalizado" → match', () => {
    expect(re.test('está finalizado')).toBe(true)
  })
  test('"encerrar" sozinho → match', () => {
    expect(re.test('vamos encerrar agora')).toBe(true)
  })
  test('"encerrado" → match', () => {
    expect(re.test('atendimento encerrado')).toBe(true)
  })
  test('"concluir atendimento" → match', () => {
    expect(re.test('por favor concluir atendimento')).toBe(true)
  })
  test('"concluir o atendimento" → match', () => {
    expect(re.test('pode concluir o atendimento')).toBe(true)
  })
})

describe('TC-VOICE-018b → guard de falso positivo das curtas', () => {
  const re = buildStopRe()
  test('"concluir" sozinho NÃO dispara (verbo comum em consulta)', () => {
    expect(re.test('vou concluir a anamnese antes do exame')).toBe(false)
  })
  test('"continue" não casa com encerrar', () => {
    expect(re.test('continue com a consulta')).toBe(false)
  })
})

// ─── Custom triggers substituem defaults ──────────────────────────────────────

describe('TC-VOICE-019 → Custom wake substitui defaults', () => {
  test('Custom "hey doc" funciona, default "vetmax" não', () => {
    const re = buildWakeRe(['hey doc'])
    expect(re.test('hey doc me ouve')).toBe(true)
    expect(re.test('vetmax me ouve')).toBe(false)
  })
})

describe('TC-VOICE-020 → Custom stop substitui defaults', () => {
  test('Custom "stop now" funciona, default "finalizar" não', () => {
    const re = buildStopRe(['stop now'])
    expect(re.test('stop now')).toBe(true)
    expect(re.test('finalizar')).toBe(false)
  })
})

describe('TC-VOICE-021 → Custom com múltiplos triggers', () => {
  test('Lista de triggers OR funciona', () => {
    const re = buildWakeRe(['comecar', 'iniciar', 'gravar'])
    expect(re.test('comecar')).toBe(true)
    expect(re.test('iniciar')).toBe(true)
    expect(re.test('gravar')).toBe(true)
    expect(re.test('terminar')).toBe(false)
  })
})

describe('TC-VOICE-022 → Custom escapa regex characters', () => {
  test('"hello.world" não é interpretado como regex', () => {
    const re = buildWakeRe(['hello.world'])
    expect(re.test('hello.world')).toBe(true)
    // hellosworld (com s entre) NÃO deve casar (ponto literal, não wildcard)
    expect(re.test('hello world')).toBe(false)
  })
})

// ─── Fuzzy match ──────────────────────────────────────────────────────────────

describe('TC-VOICE-023 → fuzzyMatchCustom — match exato', () => {
  test('texto idêntico ao trigger', () => {
    expect(fuzzyMatchCustom('iniciar gravação', ['iniciar gravação'])).toBe(true)
  })
})

describe('TC-VOICE-024 → fuzzyMatchCustom — typo tolerado', () => {
  test('typo leve passa pelo threshold 0.2', () => {
    // Threshold 0.2 (estrito) — typo de 1 caractere ainda deve passar em trigger longo
    expect(fuzzyMatchCustom('inicar gravação', ['iniciar gravação'])).toBe(true)
  })
})

describe('TC-VOICE-025 → fuzzyMatchCustom — texto totalmente diferente', () => {
  test('palavras completamente diferentes não passam', () => {
    expect(fuzzyMatchCustom('olá mundo', ['iniciar gravação'])).toBe(false)
  })
})

describe('TC-VOICE-026 → fuzzyMatchCustom — triggers vazio → false', () => {
  test('Sem triggers configurados', () => {
    expect(fuzzyMatchCustom('qualquer texto', [])).toBe(false)
  })
})

describe('TC-VOICE-027 → fuzzyMatchCustom — texto vazio → false', () => {
  test('Texto vazio mesmo com triggers configurados', () => {
    expect(fuzzyMatchCustom('', ['gravar'])).toBe(false)
  })

  test('Apenas espaços → false', () => {
    expect(fuzzyMatchCustom('   ', ['gravar'])).toBe(false)
  })
})

describe('TC-VOICE-028 → fuzzyMatchCustom — busca segmentos de 3 palavras', () => {
  test('Trigger pequeno encontrado em frase longa', () => {
    // 3 palavras "iniciar gravacao agora" deve match com trigger "iniciar gravacao"
    expect(fuzzyMatchCustom('agora vou iniciar gravacao mesmo', ['iniciar gravacao'])).toBe(true)
  })
})

describe('TC-VOICE-029 → fuzzyMatchCustom — múltiplos triggers, qualquer um casa', () => {
  test('Match em um dos triggers configurados (texto exato)', () => {
    // Texto deve ser próximo ao trigger; "encerrar" sozinho casa exato
    expect(fuzzyMatchCustom('encerrar', ['salvar', 'encerrar', 'finalizar'])).toBe(true)
  })

  test('Match via fuzzy em qualquer trigger longo da lista', () => {
    // Triggers de 1 palavra exigem match exato word-boundary; fuzzy só funciona em triggers >=2 palavras.
    expect(fuzzyMatchCustom('finalisar atendimento', ['salvar dados', 'encerrar consulta', 'finalizar atendimento'])).toBe(true)
  })
})

describe('TC-VOICE-030 → buildWakeRe retorna instância de RegExp', () => {
  test('Tipo correto', () => {
    expect(buildWakeRe()).toBeInstanceOf(RegExp)
    expect(buildStopRe()).toBeInstanceOf(RegExp)
  })
})
