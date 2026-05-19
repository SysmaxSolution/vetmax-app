/**
 * Cria o template "Carteirinha de Vacinação Digital" na clínica Vet Teste
 * com canvas_state pronto inspirado no design roxo do site sysmaxsolutions.com.
 *
 * Layout A5 retrato (14.8 x 21cm). Fundo roxo escuro full-bleed.
 * Elementos:
 *   - Header "SYSVETMAX · CADERNETA"
 *   - Nome do pet (hero, Dynamic Tag)
 *   - Composite: breed · age · sex
 *   - Card "VACINAS EM DIA" com 3 vacinas exemplo (texto fixo até o
 *     repeater 'vaccines' ser conectado às migrations de vacinas)
 *   - Card "PRÓXIMO REFORÇO" com placeholder
 *   - Footer com URL pública
 *
 * Idempotente: se já existir template com mesmo nome+clinic+tipo, atualiza
 * canvas_state em vez de criar duplicata.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)

const conn = env.DATABASE_URL ?? env.POSTGRES_URL
if (!conn) { console.error('FATAL: DATABASE_URL ausente'); process.exit(1) }

// ── Canvas State ────────────────────────────────────────────────────────────

const TEMPLATE_NAME = 'Carteirinha de Vacinação Digital'
const TEMPLATE_TYPE = 'carteirinha'

// Paleta inspirada no mockup do site (roxo dark com acentos violeta)
const COLORS = {
  bg:           '#2D1B69',  // roxo escuro principal
  bgCard:       '#3B2780',  // roxo médio (cards)
  bgAccent:     '#22D3EE',  // ciano vibrante (próximo reforço progress)
  textHero:     '#FFFFFF',  // branco puro (nome do pet)
  textSubtle:   '#C4B5FD',  // violeta claro (subtítulos)
  textMute:     '#A78BFA',  // violeta médio (labels)
  textWhite80:  'rgba(255,255,255,0.85)',
  border:       'rgba(255,255,255,0.15)',
}

function el(id) { return `el_${id}_${Date.now().toString(36)}` }

const canvasState = {
  version: 1,
  page: {
    size: 'A5',
    orientation: 'portrait',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    backgroundImageUrl: null,
    backgroundColor: COLORS.bg,
  },
  elements: [
    // 1. Header — SYSVETMAX · CADERNETA
    {
      id: el('header'),
      kind: 'text',
      box: { x: 7, y: 4.5, w: 86, h: 3 },
      content: 'SYSVETMAX · CADERNETA',
      typography: {
        fontFamily: 'Inter',
        fontSize: 8,
        fontWeight: 700,
        color: COLORS.textMute,
        align: 'left',
        vAlign: 'middle',
        letterSpacing: 2,
      },
      zIndex: 1,
    },

    // 2. Time mock (mockup tipo statusbar mobile) — Diretor decide se mantém
    {
      id: el('time'),
      kind: 'text',
      box: { x: 7, y: 2, w: 86, h: 2.5 },
      content: '9:41',
      typography: {
        fontFamily: 'Inter',
        fontSize: 9,
        fontWeight: 600,
        color: COLORS.textWhite80,
        align: 'left',
        vAlign: 'middle',
      },
      zIndex: 1,
    },

    // 3. Nome do pet (HERO — dynamic tag) — bem grande, bold
    {
      id: el('pet_name'),
      kind: 'dynamic_tag',
      box: { x: 7, y: 9, w: 86, h: 9 },
      tagId: 'patient.name',
      typography: {
        fontFamily: 'Inter',
        fontSize: 42,
        fontWeight: 700,
        color: COLORS.textHero,
        align: 'left',
        vAlign: 'middle',
        lineHeight: 1.0,
      },
      fallback: 'Pet',
      zIndex: 1,
    },

    // 4. Subtítulo composite — raça · idade · sexo
    {
      id: el('pet_meta'),
      kind: 'composite_tag',
      box: { x: 7, y: 18.5, w: 86, h: 3 },
      parts: [
        { tagId: 'patient.breed' },
        { tagId: 'patient.age' },
        { tagId: 'patient.sex' },
      ],
      separator: ' · ',
      hideEmptyParts: true,
      typography: {
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: 400,
        color: COLORS.textSubtle,
        align: 'left',
        vAlign: 'middle',
      },
      zIndex: 1,
    },

    // 5. Divisor sutil
    {
      id: el('divider1'),
      kind: 'line',
      box: { x: 7, y: 24, w: 86, h: 0.15 },
      orientation: 'horizontal',
      thickness: 1,
      color: COLORS.border,
      zIndex: 1,
    },

    // 6. Label "VACINAS EM DIA"
    {
      id: el('label_vacinas'),
      kind: 'text',
      box: { x: 7, y: 26, w: 86, h: 2.8 },
      content: 'VACINAS EM DIA',
      typography: {
        fontFamily: 'Inter',
        fontSize: 9,
        fontWeight: 700,
        color: COLORS.textMute,
        align: 'left',
        vAlign: 'middle',
        letterSpacing: 2,
      },
      zIndex: 1,
    },

    // 7. Card vacinas (block com bg + radius)
    {
      id: el('card_vacinas'),
      kind: 'text',
      box: { x: 7, y: 30, w: 86, h: 19 },
      // 3 linhas — Diretor edita aqui mesmo conforme o pet. Quando o
      // repeater 'vaccines' for plugado em resolveRepeaterSource, isso
      // vira RepeaterElement source='vaccines' itemTemplate='{{vaccine_name}}      {{date_administered}}'
      content: 'V10                                      12/03/2026\nAntirrábica                          12/03/2026\nGiárdia                                04/01/2026',
      typography: {
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: 500,
        color: COLORS.textHero,
        align: 'left',
        vAlign: 'top',
        lineHeight: 1.8,
      },
      block: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 12,
        paddingX: 16,
        paddingY: 14,
      },
      zIndex: 1,
    },

    // 8. Label "PRÓXIMO REFORÇO"
    {
      id: el('label_reforco'),
      kind: 'text',
      box: { x: 7, y: 52, w: 86, h: 2.8 },
      content: 'PRÓXIMO REFORÇO',
      typography: {
        fontFamily: 'Inter',
        fontSize: 9,
        fontWeight: 700,
        color: COLORS.textMute,
        align: 'left',
        vAlign: 'middle',
        letterSpacing: 2,
      },
      zIndex: 1,
    },

    // 9. Card próximo reforço
    {
      id: el('card_reforco'),
      kind: 'text',
      box: { x: 7, y: 56, w: 86, h: 12 },
      content: 'V10 — em 12/03/2027',
      typography: {
        fontFamily: 'Inter',
        fontSize: 20,
        fontWeight: 700,
        color: COLORS.textHero,
        align: 'left',
        vAlign: 'middle',
      },
      block: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 12,
        paddingX: 16,
        paddingY: 18,
      },
      zIndex: 1,
    },

    // 10. Barra de progresso decorativa (próximo reforço)
    {
      id: el('progress_bar'),
      kind: 'line',
      box: { x: 11, y: 65, w: 50, h: 0.6 },
      orientation: 'horizontal',
      thickness: 4,
      color: COLORS.bgAccent,
      zIndex: 2,
    },

    // 11. Footer — link público
    {
      id: el('footer'),
      kind: 'text',
      box: { x: 7, y: 90, w: 86, h: 3 },
      content: 'vermax.app/p/{{patient_id}}',
      typography: {
        fontFamily: 'Inter',
        fontSize: 10,
        fontWeight: 400,
        color: COLORS.textMute,
        align: 'left',
        vAlign: 'middle',
      },
      zIndex: 1,
    },

    // 12. Footer subtitle
    {
      id: el('footer_sub'),
      kind: 'text',
      box: { x: 7, y: 94, w: 86, h: 3 },
      content: 'Compartilhado em 1 clique',
      typography: {
        fontFamily: 'Inter',
        fontSize: 9,
        fontWeight: 400,
        color: COLORS.textSubtle,
        align: 'left',
        vAlign: 'middle',
      },
      zIndex: 1,
    },
  ],
}

// ── DB ──────────────────────────────────────────────────────────────────────

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

console.log('→ Conectando…')
await client.connect()

try {
  // 1. Encontrar clinic_id da Vet Teste
  const { rows: clinics } = await client.query(
    `SELECT id, name FROM clinics
      WHERE name ILIKE '%vet%teste%' OR name ILIKE '%veteste%'
      ORDER BY created_at DESC
      LIMIT 5`
  )
  if (clinics.length === 0) {
    console.error('✗ Nenhuma clínica com nome contendo "Vet Teste" encontrada.')
    process.exit(1)
  }
  console.log(`→ Clínicas candidatas:`)
  clinics.forEach(c => console.log(`    • ${c.name} — ${c.id}`))
  const target = clinics[0]
  console.log(`→ Alvo: ${target.name} (${target.id})`)

  // 2. Verificar se já existe template com mesmo nome
  const { rows: existing } = await client.query(
    `SELECT id FROM document_templates
      WHERE clinic_id = $1 AND name = $2 AND type = $3
      LIMIT 1`,
    [target.id, TEMPLATE_NAME, TEMPLATE_TYPE]
  )

  if (existing.length > 0) {
    // UPDATE
    const { rows } = await client.query(
      `UPDATE document_templates
          SET canvas_state = $1::jsonb,
              updated_at = now()
        WHERE id = $2
        RETURNING id`,
      [JSON.stringify(canvasState), existing[0].id]
    )
    console.log(`✓ Template ATUALIZADO: ${rows[0].id}`)
  } else {
    // INSERT
    const { rows } = await client.query(
      `INSERT INTO document_templates
         (clinic_id, name, type, extracted_fields, canvas_state)
        VALUES ($1, $2, $3, '[]'::jsonb, $4::jsonb)
       RETURNING id`,
      [target.id, TEMPLATE_NAME, TEMPLATE_TYPE, JSON.stringify(canvasState)]
    )
    console.log(`✓ Template CRIADO: ${rows[0].id}`)
  }

  console.log(`\n→ Acesse em: /dashboard/management → Templates → "${TEMPLATE_NAME}"`)
} catch (e) {
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  await client.end()
}
