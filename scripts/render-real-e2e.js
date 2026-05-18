const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')
const fs = require('fs')

const KNOWN = [
  'Custom_nome_profissional','Custom_cargo_funcao','Code_crmv',
  'Custom_patient','Custom_tutor','Custom_especie','Custom_raca','Custom_idade','Custom_peso',
  'Patient_is_male','Patient_is_famale_is_male',
  'Cidade_da_clinica','sigla_estado_clinica','Dia_atendimento','mes_atendimento','ano_atendimento','Medicaments_via_uso',
]
for (let i = 1; i <= 10; i++) {
  KNOWN.push(
    `Medicamento${i}_posologia`,
    `medicamento${i}_posologia`,
    `Custom_indicações_medicamento${i}`,
    `Custom_indicacoes_medicamento${i}`,
    `Custom_medicamento${i}_nome`,
    `Medicamento${i}_nome`,
  )
}
const KSET = new Set(KNOWN)
function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function dec(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') }
function enc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function repair(text) {
  let prev = '', out = text, safety = 5
  while (prev !== out && safety-- > 0) {
    prev = out
    out = out.replace(
      /\{\{([A-Za-z0-9_çãéíóúáàâêôõ]+)\}\}([A-Za-z0-9_çãéíóúáàâêôõ]*)/g,
      (full, p, s) => {
        if (KSET.has(p)) return full
        for (let cut = s.length; cut >= 1; cut--) {
          const c = p + s.slice(0, cut)
          if (KSET.has(c)) return '{{' + c + '}}' + s.slice(cut)
        }
        return full
      },
    )
  }
  return out
}
function wrap(text) {
  let w = text, found = false
  const s = KNOWN.slice().sort((a, b) => b.length - a.length)
  for (const lit of s) {
    if (!w.includes(lit)) continue
    found = true
    w = w.replace(new RegExp('(?<!\\{\\{)' + escapeReg(lit) + '(?!\\}\\})', 'g'), '{{' + lit + '}}')
  }
  return { wrapped: w, found }
}
function processP(p) {
  const tms = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
  if (tms.length === 0) return p
  const raw = tms.map(m => dec(m[1])).join('')
  const combined = repair(raw)
  const { wrapped, found } = wrap(combined)
  const hasFrag = combined.includes('{{') && tms.some(m => /^\{\{$|^\}\}$/.test(m[1]))
  if (!found && !hasFrag && combined === raw) return p
  const fr = p.match(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/)
  const rPr = (fr?.[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0]
  const open = (p.match(/^<w:p\b[^>]*>/) || ['<w:p>'])[0]
  return open + pPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + enc(wrapped) + '</w:t></w:r></w:p>'
}

const buf = fs.readFileSync('scripts/uploaded-template.docx')
const zip0 = new PizZip(buf)
const xml0 = zip0.file('word/document.xml').asText()
const xml1 = xml0.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, processP)
zip0.file('word/document.xml', xml1)

const MOCK = {
  Custom_patient: 'Toby',
  Custom_tutor: 'João da Silva',
  Custom_nome_profissional: 'Dra. Lais Helena Camargo',
  Code_crmv: 'CRMV-SP 38.792',
  Custom_cargo_funcao: 'Médica Veterinária',
  Custom_especie: 'Canino',
  Custom_raca: 'Golden Retriever',
  Custom_idade: '4 anos',
  Custom_peso: '32,5 kg',
  Cidade_da_clinica: 'Ribeirão Preto',
  sigla_estado_clinica: 'SP',
  Dia_atendimento: '18',
  mes_atendimento: 'MAIO',
  ano_atendimento: '2026',
  Medicaments_via_uso: 'USO ORAL',
  medicamento1_posologia: 'Amoxicilina 1cp 12/12h por 10 dias',
  Custom_indicações_medicamento1: 'Administrar com alimento',
}

const zip = new PizZip(zip0.generate({ type: 'nodebuffer' }))
const doc = new Docxtemplater(zip, {
  delimiters: { start: '{{', end: '}}' },
  paragraphLoop: true,
  linebreaks: true,
  nullGetter: () => '',
})
doc.render(MOCK)
const out = doc.getZip().generate({ type: 'nodebuffer' })
fs.writeFileSync('scripts/render-real-output.docx', out)

const xmlOut = new PizZip(out).file('word/document.xml').asText()
console.log('Toby:', xmlOut.includes('Toby'))
console.log('João:', xmlOut.includes('João'))
console.log('Lais:', xmlOut.includes('Lais'))
console.log('Amoxicilina:', xmlOut.includes('Amoxicilina'))
console.log('USO ORAL:', xmlOut.includes('USO ORAL'))
console.log('Ribeirão Preto:', xmlOut.includes('Ribeirão Preto'))
console.log('MAIO:', xmlOut.includes('MAIO'))
console.log('Custom_idade no XML (deve ser false):', xmlOut.includes('Custom_idade'))
console.log('{{ residual (deve ser false):', xmlOut.includes('{{'))
