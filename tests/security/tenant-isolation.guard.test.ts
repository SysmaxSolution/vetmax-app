/**
 * Guarda de isolamento multi-tenant.
 *
 * Risco: em SaaS multi-tenant, uma Server Action que (a) usa o admin client
 * (createAdminClient → ignora RLS) e (b) recebe `clinic_id`/`clinicId` como
 * PARÂMETRO do chamador, se não validar esse valor contra a sessão, permite que
 * um usuário da Clínica A leia/altere dados da Clínica B (IDOR cross-tenant).
 *
 * Esta guarda NÃO decide sozinha se cada função é seletiva — ela mantém um
 * BASELINE do conjunto atual de actions que casam o padrão de risco. Qualquer
 * função NOVA que entre no padrão quebra o teste (regressão a revisar). Quando
 * uma função for corrigida (passar a derivar clinic_id da sessão), o teste
 * também quebra, pedindo para removê-la do baseline — assim o baseline só encolhe.
 *
 * Referência: SECURITY_AUDIT_2026-07-09.md (C2, A3, M1, M2).
 */
import { walk, read, isUseServerModule } from './_helpers'
import { basename } from 'path'

/**
 * Confirmadas EXPLORÁVEIS pelos auditores (sem checagem de sessão + clinic_id do
 * cliente). Devem sair do baseline conforme forem corrigidas. NÃO adicionar aqui —
 * é lista de dívida a zerar.
 */
// Vazio: todos os confirmados exploráveis foram corrigidos (C2/A3/M1/M2) —
// passaram a derivar clinic_id da sessão em fix/security-p0 + P1.
const MUST_FIX = new Set<string>([])

/**
 * Baseline: TODAS as actions (arquivo::função) que hoje recebem clinic_id/clinicId
 * como parâmetro num módulo 'use server' que usa admin client. Inclui helpers
 * internos legítimos (recebem um clinic_id já validado da sessão) — ficam aqui
 * apenas para VIGILÂNCIA: o valor da guarda é detectar DELTA, não julgar cada uma.
 * Gerado por scan determinístico em 2026-07-09.
 */
const BASELINE = new Set<string>([
  'appointments.ts::getPetUpcomingAppointments',
  'auth.ts::selectClinic',
  'catalog.ts::seedDefaultCatalog',
  'clinic-status.ts::updateClinicStatus',
  'clinic-switcher.ts::switchClinic',
  'commissions.ts::processAmountCommission',
  'commissions.ts::processCommissions',
  'compliance.ts::logDataAccess',
  'internal-chat.ts::_attachDocumentToEntityChatInternal',
  'internal-chat.ts::attachDocumentToEntityChat',
  'legal.ts::insertLegalAcceptanceRaw',
  // Removidos: corrigidos (derivam clinic_id da sessão) —
  //   sales.ts::launchPendingSale (C2), stock.ts::getLowStockCount (M2),
  //   voice-corrections.ts::getActiveCorrectionsForClinic (M1),
  //   whatsapp-director.ts::getWhatsappDirectorStats (A3)
  'stock.ts::deductStockForMedication',
  'stock.ts::updateStockItemV2',
  'subscription.ts::setSpecializedPrice',
])

function scanActionsTakingClinicId(): Set<string> {
  const found = new Set<string>()
  const files = walk('src/lib/actions', ['.ts'])
  for (const abs of files) {
    const src = read(abs)
    if (!isUseServerModule(src)) continue
    if (!src.includes('createAdminClient')) continue
    const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([\s\S]*?)\)\s*(?::|\{)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const [, name, params] = m
      if (/\bclinic_?[Ii]d\b/.test(params)) found.add(`${basename(abs)}::${name}`)
    }
  }
  return found
}

describe('Isolamento multi-tenant — actions com admin client + clinic_id do cliente', () => {
  const detected = scanActionsTakingClinicId()

  it('não introduz NOVA action que aceita clinic_id do cliente (regressão)', () => {
    const novos = [...detected].filter(x => !BASELINE.has(x)).sort()
    expect(novos).toEqual([]) // se falhar: derive clinic_id da sessão OU adicione ao baseline após revisão
  })

  it('baseline não contém actions já corrigidas/removidas (baseline deve encolher)', () => {
    const sumiram = [...BASELINE].filter(x => !detected.has(x)).sort()
    expect(sumiram).toEqual([]) // se falhar: remova do BASELINE (e do MUST_FIX) as que já foram corrigidas
  })

  // Documenta a dívida crítica. Ativar (remover .skip) conforme forem corrigidas
  // para provar que saíram do padrão de risco — o teste então exige o conserto.
  it.skip('DÍVIDA: actions confirmadas exploráveis já corrigidas (derivam clinic_id da sessão)', () => {
    const aindaVulneraveis = [...MUST_FIX].filter(x => detected.has(x)).sort()
    expect(aindaVulneraveis).toEqual([])
  })
})
