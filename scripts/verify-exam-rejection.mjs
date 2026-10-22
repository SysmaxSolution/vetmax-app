// Verificação E2E (banco dev) do Fluxo de Rejeição de Exame.
// Prova, com dados reais da clínica Animais dev, que:
//  A) com a flag DESLIGADA o caminho do dinheiro é IDÊNTICO ao de antes —
//     inclusive uma linha com exam_billing_hold_at preenchido continua sendo
//     absorvida na fatura aberta, exatamente como a 0420 fazia;
//  B) com a flag LIGADA a linha travada NÃO é faturada e a não travada é;
//  C) a recoleta preserva a 1ª coleta (vínculo exam_recollect_of_id).
// Tudo é criado e removido dentro do script (não deixa lixo).
//
// Credencial lida do .env.local — nunca hardcode.
import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })

const CLINIC = 'ad1c3fca-d264-42c3-9a11-4b7ddac52a72'
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0, fail = 0
const ok  = (m) => { pass++; console.log('  OK   ' + m) }
const bad = (m) => { fail++; console.log('  FALHA ' + m) }
const check = (cond, m) => cond ? ok(m) : bad(m)

const created = { consultations: [], invoices: [], cashier: [], services: [], reasons: [] }
const flagBefore = (await c.query(`SELECT flow_config->>'usa_fluxo_rejeicao_exame' AS f FROM clinics WHERE id=$1`, [CLINIC])).rows[0].f

async function setFlag(on) {
  await c.query(
    `UPDATE clinics SET flow_config = jsonb_set(COALESCE(flow_config,'{}'::jsonb),'{usa_fluxo_rejeicao_exame}', $2::jsonb) WHERE id=$1`,
    [CLINIC, on ? 'true' : 'false'])
}

// ── fixtures ────────────────────────────────────────────────────────────────
// Há índice único de 1 atendimento ativo por pet — cada cenário usa um pet.
const pets = (await c.query(
  `SELECT p.id, p.name, p.tutor_id FROM patients p
    WHERE p.clinic_id=$1 AND p.tutor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM consultations k WHERE k.patient_id=p.id
                        AND k.status NOT IN ('completed','cancelled'))
    LIMIT 2`, [CLINIC])).rows
const pat = pets[0]
const examItem = (await c.query(
  `SELECT id, name FROM stock_items WHERE clinic_id=$1 AND category='exam' LIMIT 1`, [CLINIC])).rows[0]
if (pets.length < 2 || !examItem) { console.log('Precisa de 2 pets livres + 1 item de exame na clínica dev — abortando.'); await c.end(); process.exit(1) }
console.log(`Fixtures: pets=${pets.map(p => p.name).join(', ')} · item de exame=${examItem.name}\n`)

let petIdx = 0
async function newScenario(tag) {
  const pat = pets[petIdx++]
  const cons = (await c.query(
    `INSERT INTO consultations (clinic_id, patient_id, status, visit_reason)
     VALUES ($1,$2,'waiting_exam','exam') RETURNING id`, [CLINIC, pat.id])).rows[0]
  created.consultations.push(cons.id)

  const inv = (await c.query(
    `INSERT INTO invoices (clinic_id, consultation_id, patient_id, tutor_id, subtotal, discount, total_amount, status, kind, paid_amount)
     VALUES ($1,$2,$3,$4,0,0,0,'pending','partial',0) RETURNING id`,
    [CLINIC, cons.id, pat.id, pat.tutor_id])).rows[0]
  created.invoices.push(inv.id)

  const cc = (await c.query(
    `INSERT INTO central_cashier (clinic_id, source_module, source_id, amount, status, reason)
     VALUES ($1,'consultation',$2,0,'pending',$3) RETURNING id`,
    [CLINIC, inv.id, `[verify] ${tag}`])).rows[0]
  created.cashier.push(cc.id)

  // 1 linha TRAVADA (exame não realizado) + 1 linha LIVRE
  const held = (await c.query(
    `INSERT INTO consultation_services
       (clinic_id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage,
        exam_state, exam_billing_hold_at)
     VALUES ($1,$2,$3,$4,100,1,'vet','rejected', now()) RETURNING id`,
    [CLINIC, cons.id, examItem.id, '[verify] exame travado'])).rows[0]
  const free = (await c.query(
    `INSERT INTO consultation_services
       (clinic_id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage)
     VALUES ($1,$2,$3,$4,50,1,'vet') RETURNING id`,
    [CLINIC, cons.id, examItem.id, '[verify] exame livre'])).rows[0]
  created.services.push(held.id, free.id)

  return { consId: cons.id, invId: inv.id, ccId: cc.id, heldId: held.id, freeId: free.id }
}

const billed = async (id) =>
  (await c.query(`SELECT billed_in_invoice_id FROM consultation_services WHERE id=$1`, [id])).rows[0].billed_in_invoice_id !== null

// ── A) flag DESLIGADA: comportamento idêntico ao de antes ───────────────────
console.log('A) Flag DESLIGADA — o caminho do dinheiro tem de ser o de sempre')
await setFlag(false)
{
  const s = await newScenario('flag off')
  const r = await c.query(`SELECT * FROM rpc_absorb_services_into_open_invoice($1,$2)`, [CLINIC, s.consId])
  check(r.rows.length === 1, 'a RPC absorveu a fatura aberta')
  check(await billed(s.heldId), 'linha COM exam_billing_hold_at foi faturada (nada mudou para quem não usa a flag)')
  check(await billed(s.freeId), 'linha comum foi faturada')
  const amount = Number((await c.query(`SELECT amount FROM central_cashier WHERE id=$1`, [s.ccId])).rows[0].amount)
  check(amount === 150, `caixa somou os dois serviços (R$ ${amount})`)
}

// ── B) flag LIGADA: exame travado sai da cobrança ───────────────────────────
console.log('\nB) Flag LIGADA — exame não realizado NÃO pode virar título')
await setFlag(true)
{
  const s = await newScenario('flag on')
  const r = await c.query(`SELECT * FROM rpc_absorb_services_into_open_invoice($1,$2)`, [CLINIC, s.consId])
  check(r.rows.length === 1, 'a RPC absorveu a fatura aberta')
  check(!(await billed(s.heldId)), 'linha do exame não realizado NÃO foi faturada')
  check(await billed(s.freeId), 'linha realizada foi faturada normalmente')
  const amount = Number((await c.query(`SELECT amount FROM central_cashier WHERE id=$1`, [s.ccId])).rows[0].amount)
  check(amount === 50, `caixa cobrou só o exame realizado (R$ ${amount}, sem os R$ 100 do rejeitado)`)

  // C) recoleta preserva a 1ª coleta
  console.log('\nC) Recoleta — a primeira coleta é preservada e vinculada')
  const reason = (await c.query(
    `INSERT INTO exam_rejection_reasons (clinic_id, code, label) VALUES ($1,'verify_lipemica','[verify] Amostra lipêmica')
     ON CONFLICT (clinic_id, code) DO UPDATE SET label=EXCLUDED.label RETURNING id`, [CLINIC])).rows[0]
  created.reasons.push(reason.id)
  await c.query(
    `UPDATE consultation_services SET exam_rejection_reason_id=$2, exam_rejected_at=now(), exam_attempt_no=1 WHERE id=$1`,
    [s.heldId, reason.id])

  const re = (await c.query(
    `INSERT INTO consultation_services
       (clinic_id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage,
        exam_state, exam_attempt_no, exam_recollect_of_id, exam_billing_hold_at)
     SELECT clinic_id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage,
            'pending', 2, id, now()
       FROM consultation_services WHERE id=$1 RETURNING id`, [s.heldId])).rows[0]
  created.services.push(re.id)
  await c.query(
    `UPDATE consultation_services SET exam_state='recollect_requested', exam_client_decision='recollect',
        exam_decided_at=now(), exam_decided_by_kind='partner', exam_decided_by_label='[verify] Clínica Parceira' WHERE id=$1`,
    [s.heldId])

  const first = (await c.query(
    `SELECT exam_state, exam_rejection_reason_id, exam_client_decision FROM consultation_services WHERE id=$1`, [s.heldId])).rows[0]
  check(first.exam_rejection_reason_id === reason.id, 'a 1ª coleta continua existindo com o motivo da rejeição')
  check(first.exam_client_decision === 'recollect', 'a decisão do cliente ficou registrada na 1ª coleta')

  const link = (await c.query(
    `SELECT exam_recollect_of_id, exam_attempt_no, exam_billing_hold_at FROM consultation_services WHERE id=$1`, [re.id])).rows[0]
  check(link.exam_recollect_of_id === s.heldId, 'a recoleta aponta para a 1ª coleta')
  check(Number(link.exam_attempt_no) === 2, 'a recoleta é a 2ª tentativa')
  check(link.exam_billing_hold_at !== null, 'a recoleta nasce travada (só cobra quando for realizada)')

  // A recoleta ainda travada não pode entrar na fatura.
  await c.query(`SELECT * FROM rpc_absorb_services_into_open_invoice($1,$2)`, [CLINIC, s.consId])
  check(!(await billed(re.id)), 'recoleta ainda não realizada NÃO entrou na fatura')

  // Liberar o resultado (solta a trava) → aí sim entra.
  await c.query(`UPDATE consultation_services SET exam_state='performed', exam_billing_hold_at=NULL WHERE id=$1`, [re.id])
  await c.query(`SELECT * FROM rpc_absorb_services_into_open_invoice($1,$2)`, [CLINIC, s.consId])
  check(await billed(re.id), 'ao liberar o exame, a recoleta passa a ser faturada (cobrança única)')
  const amount2 = Number((await c.query(`SELECT amount FROM central_cashier WHERE id=$1`, [s.ccId])).rows[0].amount)
  check(amount2 === 150, `caixa: R$ ${amount2} = exame realizado + recoleta realizada; o rejeitado nunca entrou`)
}

// ── limpeza ─────────────────────────────────────────────────────────────────
await c.query(`DELETE FROM invoice_items WHERE invoice_id = ANY($1::uuid[])`, [created.invoices])
await c.query(`DELETE FROM financial_entries WHERE cashier_entry_id = ANY($1::uuid[])`, [created.cashier])
await c.query(`DELETE FROM central_cashier WHERE id = ANY($1::uuid[])`, [created.cashier])
await c.query(`DELETE FROM consultation_services WHERE id = ANY($1::uuid[])`, [created.services])
await c.query(`DELETE FROM invoices WHERE id = ANY($1::uuid[])`, [created.invoices])
// O prontuário NÃO pode ser apagado (Resolução CFMV 1321/2020 — trava no banco);
// cancelamos o atendimento de teste, que é o que a própria clínica faria.
await c.query(
  `UPDATE consultations SET status='cancelled', cancellation_reason='[verify] cenário de teste do fluxo de rejeição'
    WHERE id = ANY($1::uuid[])`, [created.consultations])
await c.query(`DELETE FROM exam_rejection_reasons WHERE id = ANY($1::uuid[])`, [created.reasons])
await setFlag(flagBefore === 'true')
console.log(`\nLimpeza feita. Flag restaurada para: ${flagBefore ?? '(ausente)'}`)
console.log(`\n${pass} verificações OK · ${fail} falhas`)
await c.end()
process.exit(fail === 0 ? 0 : 1)
