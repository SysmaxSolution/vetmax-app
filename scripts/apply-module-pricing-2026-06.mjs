// Pricing por módulo — matriz atratividade (A, peso 60%) × complexidade (C, peso 40%).
// Score 1-5 → faixa comercial (x9,90). Calibração:
//  - Soma dos 4 módulos do bundle Premium ≈ base Premium (R$299) — coerência interna
//  - Premium + todos os addons (R$1.367,80) vs Enterprise R$899 → ~34% de economia (âncora de upsell)
// Os preços continuam editáveis pelo PricingAdminPanel (SysMax) sem deploy.
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })

// [module_key, atratividade(1-5), complexidade(1-5), preço]
const PRICING = [
  // Bundle Premium (preço individual usado no configurador do Especializado;
  // para o plano Premium continuam inclusos na base)
  ['whatsapp_triggers',       4, 2,  49.90],
  ['sales_pdv',               4, 3,  69.90],
  ['stock_kits',              4, 4,  89.90],
  ['hospitalization_simple',  4, 4,  89.90],
  // Bundle Enterprise (compráveis avulsos pelo Premium)
  ['whatsapp_ai',             5, 5, 149.90],
  ['surgery_advanced',        5, 5, 149.90],
  ['billing_nfse',            5, 4, 119.90],
  ['finance_integrations',    4, 4,  99.90],
  ['tef_integration',         4, 4,  99.90],
  ['purchases_nfe',           3, 4,  89.90],
  ['exams',                   4, 3,  79.90],
  ['petlove',                 3, 3,  69.90],
  ['reports',                 3, 2,  59.90],
  ['triage',                  3, 2,  49.90],
  ['internal_chat',           3, 2,  49.90],
  ['grooming',                3, 2,  49.90],
]

await c.connect()
try {
  const { rows: [cfg] } = await c.query(
    'SELECT premium_base_price, enterprise_base_price, annual_discount_percent FROM subscription_plan_config WHERE id = 1'
  )
  console.log('Bases atuais (ajustadas pelo PO no painel):', JSON.stringify(cfg))

  for (const [key, a, comp, price] of PRICING) {
    const { rowCount } = await c.query(
      'UPDATE subscription_module_catalog SET monthly_price = $2 WHERE module_key = $1',
      [key, price]
    )
    if (rowCount !== 1) console.warn(`AVISO: ${key} → ${rowCount} linhas atualizadas`)
    console.log(`${key.padEnd(24)} A${a} C${comp} → R$ ${price.toFixed(2)}`)
  }

  const { rows: sums } = await c.query(`
    SELECT included_in_plan AS tier, sum(monthly_price) AS soma, count(*)::int AS n
      FROM subscription_module_catalog GROUP BY 1 ORDER BY 1`)
  console.log('\nSomas por bundle:')
  console.table(sums)
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
