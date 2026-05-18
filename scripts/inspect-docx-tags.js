/**
 * Inspeciona texto cru do DOCX para descobrir delimitadores/tags reais.
 */
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const docxPath = process.argv[2] || 'C:/Users/djham/Downloads/Modelo Receituario.docx';

const buf = fs.readFileSync(docxPath);
const zip = new PizZip(buf);

const xml = zip.file('word/document.xml').asText();

// Junta tokens consecutivos <w:t>...</w:t> em fluxo legivel
const tokens = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
const flat = tokens.join('');

console.log('=== TEXTO CRU ===');
console.log(flat);
console.log('\n=== TOKENS ISOLADOS ===');
console.log(tokens.filter(t => t.trim()).map(t => `[${t}]`).join(' '));
