/**
 * Unit — Parser HL7 (ORU) dos aparelhos de laboratório (Fase 2).
 */
import { parseHL7ORU, flagFromValue } from '@/lib/lab/hl7-parser'

const MSG = [
  'MSH|^~\\&|URIT|LAB|SYSVETMAX|CLINICA|20260907||ORU^R01|1|P|2.3.1',
  'PID|1||PET123||Rex',
  'OBR|1|||HEM^Hemograma^L',
  'OBX|1|NM|718-7^Hemoglobina^LN||13.5|g/dL|12.0-16.0|N|||F',
  'OBX|2|NM|4544-3^Hematocrito^LN||55|%|37-55|H|||F',
  'OBX|3|NM|CREA^Creatinina||0.3|mg/dL|0.5-1.5||||F',
].join('\r')

describe('flagFromValue', () => {
  it('L abaixo, H acima, N dentro', () => {
    expect(flagFromValue('0.3', 0.5, 1.5)).toBe('L')
    expect(flagFromValue('2.0', 0.5, 1.5)).toBe('H')
    expect(flagFromValue('1.0', 0.5, 1.5)).toBe('N')
  })
  it('null quando não numérico ou sem faixa', () => {
    expect(flagFromValue('Positivo', 0, 1)).toBeNull()
    expect(flagFromValue('1.0', null, null)).toBeNull()
  })
})

describe('parseHL7ORU', () => {
  const res = parseHL7ORU(MSG)

  it('extrai o painel do OBR', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.panel).toBe('Hemograma')
  })
  it('extrai um analito por OBX com valor', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.analytes).toHaveLength(3)
    expect(res.analytes[0].name).toBe('Hemoglobina')
    expect(res.analytes[0].value).toBe('13.5')
    expect(res.analytes[0].unit).toBe('g/dL')
  })
  it('usa a flag explícita do OBX quando presente', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.analytes[1].flag).toBe('H')   // Hematocrito 55, flag H no campo
  })
  it('deriva a flag da faixa quando o OBX não traz', () => {
    if ('error' in res) throw new Error(res.error)
    expect(res.analytes[2].flag).toBe('L')   // Creatinina 0.3 < 0.5
    expect(res.analytes[2].ref_low).toBe(0.5)
    expect(res.analytes[2].ref_high).toBe(1.5)
  })
  it('ignora OBX sem valor', () => {
    const r = parseHL7ORU('MSH|^~\\&|A|B|C|D\rOBX|1|NM|X^Vazio||\rOBX|2|NM|Y^Cheio||9|u|')
    if ('error' in r) throw new Error(r.error)
    expect(r.analytes).toHaveLength(1)
    expect(r.analytes[0].name).toBe('Cheio')
  })
  it('rejeita mensagem sem MSH', () => {
    expect(parseHL7ORU('não é hl7')).toHaveProperty('error')
  })
})

describe('BIOBASE BK-200 (Sérium 200) — mensagem real de 01/10/2026', () => {
  // Capturada da fila do agente-ponte na Clínica Animais. Difere do URIT em
  // três pontos que quebrariam o laudo se não fossem tratados.
  const CR = String.fromCharCode(13)
  const MSG = [
    'MSH|^~\&|BIOBASE|BK-200|||20261001111010||ORU^R01|2|P|2.3.1||||0||UTF8|||',
    'PID|2||||BENTO 9S|||O|||||||||||||||||||||||',
    'OBR|7||7|BIOBASE^BK-200|N|20261001111010|20261001111010||||||||soro|1000||||||||||',
    'OBX|0|NM|344|CREAT|0.736809636395488|mg/dL|0.5~1.5|N|||||0.736809636395488|20261001111010||1000||',
    'OBX|1|NM|361|TGP-EB|46.4773518081531|U/L|10~88|N|||||46.4773518081531|20261001111010||1000||',
    'OBX|2|NM|363|UREIA-EB|41.5646525552736|mg/dL|10~56|N|||||41.5646525552736|20261001111010||1000||',
    'OBX|3|NM|371|ALBUMINA|3.01688979110317|mg/dL|2.2~3.9|N|||||3.01688979110317|20261001111010||1000||',
  ].join(CR)

  const parsed = parseHL7ORU(MSG)
  if ('error' in parsed) throw new Error(parsed.error)

  it('lê o nome do analito do OBX-4 quando o OBX-3 é só o id interno', () => {
    // Sem isto os analitos entrariam como "344", "361", "363", "371".
    expect(parsed.analytes.map(a => a.code)).toEqual(['CREAT', 'TGP-EB', 'UREIA-EB', 'ALBUMINA'])
  })

  it('entende a faixa com til, que é como o BK-200 escreve', () => {
    expect(parsed.analytes[0].ref_low).toBe(0.5)
    expect(parsed.analytes[0].ref_high).toBe(1.5)
    expect(parsed.analytes[2].ref_low).toBe(10)
    expect(parsed.analytes[2].ref_high).toBe(56)
  })

  it('pega o nº da amostra no OBR-3 (o PID-3 vem vazio neste aparelho)', () => {
    expect(parsed.sample_id).toBe('7')
  })

  it('traz o tipo de amostra do OBR — vira o "Material" do laudo', () => {
    expect(parsed.specimen).toBe('soro')
  })

  it('não quebra o hemograma: no URIT o código continua vindo do OBX-3', () => {
    const urit = parseHL7ORU([
      'MSH|^~\&|5190Vet|URIT|||20261001120000||ORU^R01|1|P|2.3.1',
      'OBR|1||204457|5190Vet^Hemograma',
      'OBX|1|NM|WBC||6.06|10*9/L|6.0-17.0|N|||F',
    ].join(CR))
    if ('error' in urit) throw new Error(urit.error)
    expect(urit.analytes[0].code).toBe('WBC')
    expect(urit.analytes[0].ref_low).toBe(6)
  })
})
