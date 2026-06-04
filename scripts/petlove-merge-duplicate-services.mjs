// petlove-merge-duplicate-services.mjs
// Fix B3 (reunião 04/06/2026): localiza e mescla serviços (stock_items)
// duplicados por nome normalizado (case/acentos/espaços) — criados pelo
// find-or-create do importador Petlove que usava ilike(name).
//
// Para cada grupo de duplicatas na mesma clínica:
//   - Canônico = (1) tem default_insurance_price, senão (2) unit_price > 0,
//     senão (3) o mais antigo (created_at ASC).
//   - Re-aponta FKs dos duplicados → canônico:
//       consultation_services, patient_custom_prices (resolve conflito da
//       UNIQUE clinic+patient+item), petlove_procedure_mappings, sale_items,
//       package_items, purchase_order_items, stock_batches,
//       prescription_template_items, surgery_consumables,
//       stock_item_insurance_providers (resolve conflito), stock_movements,
//       hospitalization_prescriptions, user_commission_rules (item_id)
//   - Duplicado vira archived_at=now() + nome sufixado " [duplicado]"
//     (NUNCA deleta — auditoria preservada; sufixo libera a UNIQUE de nome).
//
// Default = DRY-RUN. Exige --apply para gravar.
//
// Uso:
//   node scripts/petlove-merge-duplicate-services.mjs                  # lista todas as clínicas (dry-run)
//   node scripts/petlove-merge-duplicate-services.mjs --clinic=<uuid>  # só uma clínica
//   node scripts/petlove-merge-duplicate-services.mjs --apply          # grava
//
// ATENÇÃO: a regra de normalização deve ser IDÊNTICA à de
// src/lib/service-name-normalize.ts — alterar lá exige alterar aqui.

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
const m = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, user, pw, host, port, db] = m

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const APPLY  = args.apply === true
const CLINIC = typeof args.clinic === 'string' ? args.clinic : null

// MESMA regra de src/lib/service-name-normalize.ts
function normalizeServiceName(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// (tabela, coluna) que referenciam stock_items — re-apontadas no merge.
// Tabelas com UNIQUE envolvendo o item têm tratamento especial abaixo.
const SIMPLE_FK_TARGETS = [
  ['consultation_services',          'stock_item_id'],
  ['petlove_procedure_mappings',     'internal_stock_item_id'],
  ['sale_items',                     'stock_item_id'],
  ['package_items',                  'item_id'],
  ['purchase_order_items',           'stock_item_id'],
  ['stock_batches',                  'stock_item_id'],
  ['prescription_template_items',    'stock_item_id'],
  ['surgery_consumables',            'stock_item_id'],
  ['stock_movements',                'stock_item_id'],
  ['hospitalization_prescriptions',  'stock_item_id'],
  ['user_commission_rules',          'item_id'],
]

const client = new pg.Client({
  user, password: decodeURIComponent(pw), host, port: +port, database: db,
  ssl: { rejectUnauthorized: false },
})

async function tableExists(table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

;(async () => {
  await client.connect()
  console.log(`Modo: ${APPLY ? 'APPLY (vai gravar)' : 'DRY-RUN'}${CLINIC ? ` · clínica ${CLINIC}` : ' · todas as clínicas'}`)

  // 1) Carrega itens não arquivados (escopo: serviços — caso B3)
  const { rows: items } = await client.query(
    `SELECT id, clinic_id, name, unit_price, default_insurance_price, is_service, created_at
       FROM stock_items
      WHERE archived_at IS NULL
        AND is_service = true
        ${CLINIC ? 'AND clinic_id = $1' : ''}
      ORDER BY clinic_id, created_at ASC`,
    CLINIC ? [CLINIC] : [],
  )

  // 2) Agrupa por (clinic, nome normalizado)
  const groups = new Map()
  for (const it of items) {
    const key = `${it.clinic_id}::${normalizeServiceName(it.name)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  }
  const dupGroups = [...groups.values()].filter(g => g.length > 1)

  if (dupGroups.length === 0) {
    console.log('Nenhuma duplicata encontrada. ✓')
    await client.end()
    return
  }
  console.log(`\n${dupGroups.length} grupo(s) de duplicatas:\n`)

  const fkTargets = []
  for (const [table, col] of SIMPLE_FK_TARGETS) {
    if (await tableExists(table, col)) fkTargets.push([table, col])
  }

  for (const group of dupGroups) {
    // Canônico: default_insurance_price > unit_price>0 > mais antigo
    const canonical =
      group.find(g => g.default_insurance_price !== null) ??
      group.find(g => Number(g.unit_price) > 0) ??
      group[0]
    const dups = group.filter(g => g.id !== canonical.id)

    console.log(`▸ clínica ${canonical.clinic_id}`)
    console.log(`  canônico : ${canonical.id} "${canonical.name}" (unit ${canonical.unit_price}, conv ${canonical.default_insurance_price ?? '—'})`)

    for (const dup of dups) {
      console.log(`  duplicado: ${dup.id} "${dup.name}" (unit ${dup.unit_price}, conv ${dup.default_insurance_price ?? '—'})`)

      if (!APPLY) {
        for (const [table, col] of fkTargets) {
          const { rows } = await client.query(
            `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${col} = $1`, [dup.id],
          )
          if (rows[0].n > 0) console.log(`    → ${table}.${col}: ${rows[0].n} registro(s) seriam re-apontados`)
        }
        const { rows: pcp } = await client.query(
          `SELECT COUNT(*)::int AS n FROM patient_custom_prices WHERE stock_item_id = $1`, [dup.id],
        )
        if (pcp[0].n > 0) console.log(`    → patient_custom_prices: ${pcp[0].n} registro(s) (merge com resolução de conflito)`)
        continue
      }

      await client.query('BEGIN')
      try {
        // a) FKs simples
        for (const [table, col] of fkTargets) {
          await client.query(
            `UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`, [canonical.id, dup.id],
          )
        }

        // b) patient_custom_prices — UNIQUE(clinic_id, patient_id, stock_item_id):
        //    quando o paciente já tem linha no canônico, mantém a mais completa
        //    (com copay/repass) ou a mais recente; apaga a do duplicado.
        await client.query(
          `DELETE FROM patient_custom_prices dup_row
            WHERE dup_row.stock_item_id = $2
              AND EXISTS (
                SELECT 1 FROM patient_custom_prices canon_row
                 WHERE canon_row.clinic_id = dup_row.clinic_id
                   AND canon_row.patient_id = dup_row.patient_id
                   AND canon_row.stock_item_id = $1
                   AND (
                     (canon_row.copay_amount IS NOT NULL AND canon_row.repass_amount IS NOT NULL)
                     OR dup_row.copay_amount IS NULL
                   )
              )`,
          [canonical.id, dup.id],
        )
        // Linha do duplicado mais completa que a do canônico → substitui a do canônico
        await client.query(
          `DELETE FROM patient_custom_prices canon_row
            WHERE canon_row.stock_item_id = $1
              AND EXISTS (
                SELECT 1 FROM patient_custom_prices dup_row
                 WHERE dup_row.clinic_id = canon_row.clinic_id
                   AND dup_row.patient_id = canon_row.patient_id
                   AND dup_row.stock_item_id = $2
              )`,
          [canonical.id, dup.id],
        )
        await client.query(
          `UPDATE patient_custom_prices SET stock_item_id = $1 WHERE stock_item_id = $2`,
          [canonical.id, dup.id],
        )

        // c) stock_item_insurance_providers (0217) — UNIQUE(stock_item_id, provider?):
        //    remove do duplicado o que já existe no canônico, re-aponta o resto.
        if (await tableExists('stock_item_insurance_providers', 'stock_item_id')) {
          await client.query(
            `DELETE FROM stock_item_insurance_providers dup_row
              WHERE dup_row.stock_item_id = $2
                AND EXISTS (
                  SELECT 1 FROM stock_item_insurance_providers canon_row
                   WHERE canon_row.stock_item_id = $1
                     AND canon_row.insurance_provider_id IS NOT DISTINCT FROM dup_row.insurance_provider_id
                )`,
            [canonical.id, dup.id],
          )
          await client.query(
            `UPDATE stock_item_insurance_providers SET stock_item_id = $1 WHERE stock_item_id = $2`,
            [canonical.id, dup.id],
          )
        }

        // d) Herda default_insurance_price/unit_price se o canônico estiver vazio
        await client.query(
          `UPDATE stock_items canon SET
             default_insurance_price = COALESCE(canon.default_insurance_price, dup.default_insurance_price),
             unit_price = CASE WHEN canon.unit_price = 0 THEN dup.unit_price ELSE canon.unit_price END
           FROM stock_items dup
          WHERE canon.id = $1 AND dup.id = $2`,
          [canonical.id, dup.id],
        )

        // e) Arquiva o duplicado (sufixo libera a UNIQUE(clinic_id, name))
        await client.query(
          `UPDATE stock_items
              SET archived_at = now(),
                  name = name || ' [duplicado ' || substring(id::text, 1, 8) || ']'
            WHERE id = $1`,
          [dup.id],
        )

        await client.query('COMMIT')
        console.log(`    ✓ mesclado e arquivado`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`    ✗ ROLLBACK: ${err.message}`)
      }
    }
  }

  console.log(`\n${APPLY ? 'Concluído.' : 'Dry-run concluído — rode com --apply para gravar.'}`)
  await client.end()
})().catch(err => { console.error(err); process.exit(1) })
