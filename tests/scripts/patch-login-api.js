/**
 * patch-login-api.js
 * Substitui a função loginAs baseada em UI por chamada a loginViaApi (API Supabase)
 * em todos os spec files E2E.
 *
 * Uso: node tests/scripts/patch-login-api.js
 */

const fs = require('fs');
const path = require('path');

const SPEC_DIR = path.join(__dirname, '..', 'e2e');
const IMPORT_LINE = "import { loginViaApi } from '../helpers/session'";

// Padrão exato da função loginAs UI-based (variações: aspas simples ou backtick, ; ou sem)
const LOGIN_AS_PATTERNS = [
  // Padrão mais comum: goto('/login')
  /async function loginAs\(page: Page, email: string, password: string\) \{[\s\S]*?await page\.goto\(['`].*?\/login.*?['`][);]*\)[\s\S]*?\n\}/g,
];

const LOGIN_AS_REPLACEMENT = `async function loginAs(page: Page, email: string, password: string) {
  await loginViaApi(page, email, password)
}`;

// loginAsAdmin com corpo UI-based (mentor-module-process.spec.ts)
const LOGIN_AS_ADMIN_PATTERN = /async function loginAsAdmin\(page: Page\) \{[\s\S]*?await page\.goto\(.*?\/login.*?\)[\s\S]*?\n\}/g;
const LOGIN_AS_ADMIN_REPLACEMENT = `async function loginAsAdmin(page: Page) {
  await loginViaApi(page, ADMIN.email, ADMIN.password)
}`;

const files = fs.readdirSync(SPEC_DIR)
  .filter(f => f.endsWith('.spec.ts') && !f.includes('mobile') && !f.includes('responsive'));

let patchedCount = 0;

for (const file of files) {
  const filePath = path.join(SPEC_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Skip se já foi patched
  if (content.includes("'../helpers/session'") || content.includes('"../helpers/session"')) {
    console.log(`SKIP (já patched): ${file}`);
    continue;
  }

  // Verifica se tem loginAs UI-based
  const hasLoginAs = content.includes("async function loginAs(page: Page, email: string, password: string)");
  const hasLoginAsAdmin = content.includes("async function loginAsAdmin(page: Page)");

  if (!hasLoginAs && !hasLoginAsAdmin) {
    console.log(`SKIP (sem loginAs): ${file}`);
    continue;
  }

  // Substitui loginAs
  if (hasLoginAs) {
    const before = content;
    for (const pattern of LOGIN_AS_PATTERNS) {
      content = content.replace(pattern, LOGIN_AS_REPLACEMENT);
    }
    if (content !== before) changed = true;
  }

  // Substitui loginAsAdmin
  if (hasLoginAsAdmin) {
    const before = content;
    content = content.replace(LOGIN_AS_ADMIN_PATTERN, LOGIN_AS_ADMIN_REPLACEMENT);
    if (content !== before) changed = true;
  }

  if (!changed) {
    console.log(`WARN (padrão não casou): ${file}`);
    continue;
  }

  // Adiciona import após a primeira linha de import do playwright
  const importRegex = /^(import \{[^}]+\} from '@playwright\/test'.*\n)/m;
  if (importRegex.test(content)) {
    content = content.replace(importRegex, `$1${IMPORT_LINE}\n`);
  } else {
    // Fallback: adiciona no início
    content = `${IMPORT_LINE}\n${content}`;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`PATCHED: ${file}`);
  patchedCount++;
}

console.log(`\nTotal patched: ${patchedCount}/${files.length} arquivos`);
