/**
 * Unit — MLLP + construção HL7 (agente-ponte de laboratório, Fase 2).
 */
import { frameMLLP, extractMLLP, VT, FS, CR } from '@/lib/lab/mllp'
import { messageControlId, parseQryBarcode, buildAck, buildDsr } from '@/lib/lab/hl7-build'

describe('MLLP', () => {
  it('frameMLLP envolve com VT…FS CR', () => {
    expect(frameMLLP('ABC')).toBe(VT + 'ABC' + FS + CR)
  })
  it('extractMLLP extrai mensagem completa e mantém o resto', () => {
    const buf = frameMLLP('MSG1') + VT + 'PARCIAL'
    const { messages, rest } = extractMLLP(buf)
    expect(messages).toEqual(['MSG1'])
    expect(rest).toBe(VT + 'PARCIAL')
  })
  it('extrai duas mensagens de uma vez', () => {
    const { messages } = extractMLLP(frameMLLP('A') + frameMLLP('B'))
    expect(messages).toEqual(['A', 'B'])
  })
  it('sem terminador → nada extraído', () => {
    expect(extractMLLP(VT + 'incompleta').messages).toHaveLength(0)
  })
})

describe('HL7 build', () => {
  const qry = ['MSH|^~\\&|URIT|LAB|SYSVETMAX|CLINICA|20260908||QRY^Q02|555|P|2.3.1', 'QRD|20260908|R|D|Q1|||1^RD|204457|OTH', 'QRF|LAB'].join('\r')

  it('messageControlId lê MSH-10', () => {
    expect(messageControlId(qry)).toBe('555')
  })
  it('parseQryBarcode lê o código do tubo (QRD-8)', () => {
    expect(parseQryBarcode(qry)).toBe('204457')
  })
  it('parseQryBarcode null quando não há QRD', () => {
    expect(parseQryBarcode('MSH|^~\\&|A')).toBeNull()
  })
  it('buildAck monta MSH+MSA com AA', () => {
    const ack = buildAck('555')
    expect(ack).toContain('MSA|AA|555')
    expect(ack.split('\r')[0]).toContain('ACK')
  })
  it('buildDsr inclui MSA/QAK e um DSP por exame com o barcode', () => {
    const dsr = buildDsr('555', { barcode: '204457', patient_name: 'Rex', exams: [{ name: 'Hemograma' }, { name: 'Creatinina' }] })
    const segs = dsr.split('\r')
    expect(segs[0]).toContain('DSR^Q03')
    expect(dsr).toContain('MSA|AA|555')
    expect(dsr).toContain('QAK|555|OK')
    const dsps = segs.filter(s => s.startsWith('DSP'))
    expect(dsps).toHaveLength(2)
    expect(dsps[0]).toContain('204457')
    expect(dsps[0]).toContain('Hemograma')
  })
  it('buildDsr sem exames gera DSP SEM_EXAMES', () => {
    const dsr = buildDsr('9', { barcode: 'X', exams: [] })
    expect(dsr).toContain('SEM_EXAMES')
  })
})
