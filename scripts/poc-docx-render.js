/**
 * Sanity check fora do Next.js: roda o engine direto em Node nativo
 * usando os arquivos compilados/TS.
 */
const path = require('path');
const fs = require('fs');

// Como o motor usa ESM/TS, vamos compilar inline com tsx/ts-node?
// Atalho: replicar minimamente o pipeline em JS puro para validar pizzip+docxtemplater.

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const DOCX = process.argv[2] || 'C:/Users/djham/Downloads/Modelo Receituario.docx';
const OUT  = process.argv[3] || 'C:/Users/djham/Downloads/preview-Modelo Receituario.docx';

// ============== known tags (mirror src/lib/docx/known-tags.ts) ==============
const STATIC_TAGS = [
  ['Custom_nome_profissional', 'professional_name'],
  ['Custom_cargo_funcao', 'professional_role'],
  ['Code_crmv', 'professional_crmv'],
  ['Custom_patient', 'patient_name'],
  ['Custom_tutor', 'tutor_name'],
  ['Custom_especie', 'patient_species'],
  ['Custom_raca', 'patient_breed'],
  ['Custom_idade', 'patient_age'],
  ['Custom_peso', 'patient_weight'],
  ['Patient_is_male', 'patient_is_male'],
  ['Patient_is_famale_is_male', 'patient_sex_label'],
  ['Cidade_da_clinica', 'clinic_city'],
  ['sigla_estado_clinica', 'clinic_uf'],
  ['Dia_atendimento', 'today_dia'],
  ['mes_atendimento', 'today_mes'],
  ['ano_atendimento', 'today_ano'],
  ['Medicaments_via_uso', 'medicamento_via_uso'],
];
const MAX = 10;
for (let i = 1; i <= MAX; i++) {
  STATIC_TAGS.push(
    [`Medicamento${i}_posologia`, `medicamento_${i}_posologia`],
    [`medicamento${i}_posologia`, `medicamento_${i}_posologia`],
    [`Custom_indicações_medicamento${i}`, `medicamento_${i}_indicacoes`],
    [`Custom_indicacoes_medicamento${i}`, `medicamento_${i}_indicacoes`],
    [`Custom_medicamento${i}_nome`, `medicamento_${i}_nome`],
    [`Medicamento${i}_nome`, `medicamento_${i}_nome`],
  );
}

// ============== preprocess ==============
function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function decode(s) { return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'); }
function encode(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }

function wrapKnownTags(text) {
  let wrapped = text;
  let found = false;
  const sorted = STATIC_TAGS.map(t => t[0]).sort((a,b) => b.length - a.length);
  for (const lit of sorted) {
    if (!wrapped.includes(lit)) continue;
    found = true;
    wrapped = wrapped.replace(new RegExp(escapeReg(lit), 'g'), `{${lit}}`);
  }
  wrapped = wrapped.replace(/(\{[^{}]+\})\1/g, '$1');
  return { wrapped, found };
}

function processParagraph(p) {
  const textMatches = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
  if (textMatches.length === 0) return p;
  const combined = textMatches.map(m => decode(m[1])).join('');
  const { wrapped, found } = wrapKnownTags(combined);
  if (!found) return p;

  const firstRunMatch = p.match(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/);
  const rPrMatch = firstRunMatch?.[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch?.[0] ?? '';
  const newRun = '<w:r>' + rPr + '<w:t xml:space="preserve">' + encode(wrapped) + '</w:t></w:r>';

  const pPrMatch = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch?.[0] ?? '';
  const openTagMatch = p.match(/^<w:p\b[^>]*>/);
  const openTag = openTagMatch?.[0] ?? '<w:p>';
  return openTag + pPr + newRun + '</w:p>';
}

function preprocess(xml) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, processParagraph);
}

// ============== main ==============
const buf = fs.readFileSync(DOCX);
const zip0 = new PizZip(buf);
const xml0 = zip0.file('word/document.xml').asText();
const xml1 = preprocess(xml0);
zip0.file('word/document.xml', xml1);
const buf1 = zip0.generate({ type: 'nodebuffer' });

// Verifica delimitadores
const tagsInjected = [...xml1.matchAll(/\{([A-Za-z0-9_çãéíóúáàâ]+)\}/g)].map(m => m[1]);
console.log('=== TAGS INJETADAS ===');
console.log([...new Set(tagsInjected)].sort().join('\n'));

// Renderiza
const MOCK = {};
const M = {
  professional_name: 'Dra. Lais Helena Camargo',
  professional_role: 'Médica Veterinária',
  professional_crmv: 'CRMV-SP 38.792',
  patient_name: 'Toby',
  tutor_name: 'João da Silva',
  patient_species: 'Canino',
  patient_breed: 'Golden Retriever',
  patient_age: '4 anos',
  patient_weight: '32,5 kg',
  patient_is_male: 'M',
  patient_sex_label: 'Macho',
  clinic_city: 'Ribeirão Preto',
  clinic_uf: 'SP',
  today_dia: '16',
  today_mes: 'MAIO',
  today_ano: '2026',
  medicamento_via_uso: 'USO ORAL',
  medicamento_1_nome: 'Amoxicilina + Clavulanato 250mg',
  medicamento_1_posologia: '1 comprimido a cada 12h, por 10 dias',
  medicamento_1_indicacoes: 'Administrar com alimento. Concluir o tratamento mesmo com melhora dos sintomas.',
  medicamento_2_nome: 'Meloxicam 2mg',
  medicamento_2_posologia: '1 comprimido ao dia, por 5 dias',
  medicamento_2_indicacoes: 'Administrar após a refeição.',
  medicamento_3_nome: '',
  medicamento_3_posologia: '',
  medicamento_3_indicacoes: '',
  medicamento_4_nome: '',
  medicamento_4_posologia: '',
  medicamento_4_indicacoes: '',
  medicamento_5_nome: '',
  medicamento_5_posologia: '',
  medicamento_5_indicacoes: '',
};
for (const [lit, can] of STATIC_TAGS) {
  if (M[can] !== undefined) MOCK[lit] = M[can];
}

const zip = new PizZip(buf1);
const doc = new Docxtemplater(zip, {
  delimiters: { start: '{', end: '}' },
  paragraphLoop: true,
  linebreaks: true,
  nullGetter: () => '',
});
doc.render(MOCK);
const out = doc.getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync(OUT, out);
console.log('\nOK -> ' + OUT);
