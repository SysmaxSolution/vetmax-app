/**
 * Fase 1 — hash de autenticidade dos documentos Canvas (sem PDF):
 * JSON canônico (ordem de chaves irrelevante) + SHA-256 do snapshot + conteúdo.
 */

import { canonicalJson, hashCanvasDocument, generateVerifyCode, formatVerifyCode } from '@/lib/portal/laudo-verify'

describe('canonicalJson', () => {
  it('ordena chaves recursivamente e ignora undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, u: undefined }))
      .toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}')
    expect(canonicalJson(null)).toBe('null')
    expect(canonicalJson('x')).toBe('"x"')
  })
})

describe('hashCanvasDocument', () => {
  const snapshot = { version: 1, page: { size: 'A4' }, elements: [{ id: 'a', kind: 'text', content: 'Olá' }] }
  const content = { static_fields: { observacoes: 'ok' }, dynamic_fields: [], fillable_fields: { data: '01/01/2026' } }

  it('é determinístico e independente da ordem das chaves', () => {
    const h1 = hashCanvasDocument(snapshot, content)
    const h2 = hashCanvasDocument(
      { elements: [{ content: 'Olá', kind: 'text', id: 'a' }], page: { size: 'A4' }, version: 1 },
      { fillable_fields: { data: '01/01/2026' }, dynamic_fields: [], static_fields: { observacoes: 'ok' } },
    )
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('muda quando o conteúdo ou o layout mudam', () => {
    const base = hashCanvasDocument(snapshot, content)
    expect(hashCanvasDocument(snapshot, { ...content, fillable_fields: { data: '02/01/2026' } })).not.toBe(base)
    expect(hashCanvasDocument({ ...snapshot, elements: [] }, content)).not.toBe(base)
    expect(hashCanvasDocument(null, content)).not.toBe(base)
  })
})

describe('verify code', () => {
  it('gera 10 caracteres sem ambíguos e formata em blocos', () => {
    const c = generateVerifyCode()
    expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/)
    expect(formatVerifyCode('K7Q2M9XR4T')).toBe('K7Q2M-9XR4T')
  })
})
