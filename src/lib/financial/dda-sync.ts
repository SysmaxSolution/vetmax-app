// Varredura do DDA: o que o cron e as actions compartilham.
//
// Vive FORA de `src/lib/actions/pagfor.ts` por um motivo de segurança: aquele
// arquivo é `'use server'`, e toda função exportada de um módulo assim vira
// uma server action que o navegador pode chamar. `loadPagamentosRuntime`
// decifra o certificado e-CNPJ da empresa — expor isso como action seria
// entregar o caminho da credencial a quem abrir o DevTools.
//
// O cron também não poderia usar as funções de lá: elas chamam `ctx()`, que
// exige sessão de usuário, e rotina automática não tem usuário.
//
// Server-only.

import type { createAdminClient } from '@/lib/supabase/admin'
import { consultarDDA, type PagamentosRuntime } from '@/lib/integrations/sicoob-pagamentos'
import { digitalDoBoleto } from '@/lib/financial/dda-digital'
import type { DdaBoleto } from '@/types/pagfor'
import { janelasDaVarredura } from './dda-varredura'

export async function loadPagamentosRuntime(admin: ReturnType<typeof createAdminClient>, clinicId: string, bankAccountId?: string): Promise<PagamentosRuntime | { error: string }> {
  // O DDA NAO depende da carteira bancaria. Lia conta/agencia/ambiente de
  // dentro de `boleto_config`, que e a carteira — mas conta e agencia sao
  // dados da CONTA, e a credencial (client_id + certificado) e da clinica.
  // Juntar tudo no boleto_config fazia a varredura do DDA exigir carteira
  // configurada sem necessidade nenhuma.
  //
  // A carteira continua obrigatoria para EMITIR boleto (cobranca), onde o
  // Sicoob precisa saber sob qual carteira registrar o titulo.
  let q = admin.from('bank_accounts').select('id, agency, account, bank_code, is_default, company_id').eq('clinic_id', clinicId)
  q = bankAccountId ? q.eq('id', bankAccountId) : q.eq('bank_code', '756').order('is_default', { ascending: false })
  const { data: acc } = await q.limit(1).maybeSingle()
  if (!acc) return { error: 'Nenhuma conta Sicoob cadastrada (Cadastros → Bancos).' }
  const conta = acc as { id?: string; agency?: string | null; account?: string | null; bank_code?: string | null; company_id?: string | null }

  // Mesma resolucao usada pelo extrato: ambiente, client_id e certificado vem
  // da configuracao da CLINICA, nunca de variavel de ambiente.
  const { resolverConfigSicoob } = await import('@/lib/integrations/sicoob-config')
  const r = await resolverConfigSicoob(admin, clinicId, {
    id: conta.id ?? null, agency: conta.agency ?? null, account: conta.account ?? null,
    bank_code: conta.bank_code ?? null, company_id: conta.company_id ?? null,
  })
  if ('error' in r) return { error: r.error }

  // Numero e agencia como a API quer: so digitos, COM o digito verificador.
  const numeroConta = Number(String(conta.account ?? '').replace(/\D/g, ''))
    || (r.config.environment === 'sandbox' ? 12345 : 0)
  const agencia = Number(String(conta.agency ?? '').replace(/\D/g, ''))
    || (r.config.environment === 'sandbox' ? 4321 : 0)
  if (r.config.environment === 'production' && (!numeroConta || !agencia)) {
    return { error: 'Conta ou agência sem número no cadastro (Cadastros → Bancos).' }
  }

  return { ...r.config, numeroConta, agencia }
}

export async function guardarBoletos(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  boletos: DdaBoleto[],
  bankAccountId?: string | null,
): Promise<number> {
  if (!boletos.length) return 0
  const linhas = boletos.map(b => {
    let cru: unknown = {}
    try { cru = JSON.parse(b.raw) } catch { cru = {} }
    const r = cru as Record<string, unknown>
    return {
      clinic_id:       clinicId,
      bank_account_id: bankAccountId ?? null,
      fingerprint:     digitalDoBoleto(clinicId, b),
      barcode:         b.barcode,
      document:        b.document,
      beneficiary:     b.beneficiary,
      beneficiary_doc: b.beneficiary_doc,
      amount:          b.amount,
      due_date:        b.due_date,
      issue_date:      (r.dataEmissao as string) ?? null,
      situacao:        (r.descricaoSituacaoBoleto as string) ?? null,
      raw:             r,
      imported_at:     new Date().toISOString(),
    }
  })
  // ignoreDuplicates: reimportar o mesmo período NÃO pode sobrescrever o
  // estado do trabalho (lançado, ignorado) que já está gravado na linha.
  const { error } = await admin.from('dda_boletos')
    .upsert(linhas, { onConflict: 'clinic_id,fingerprint', ignoreDuplicates: true })
  if (error) return 0

  // Quem já estava guardado SEM dono passa a ser desta conta — o banco acabou
  // de confirmar que o boleto é dela. `ignoreDuplicates` protege o estado do
  // trabalho, mas por isso mesmo não corrige a linha antiga: sem este passo, o
  // boleto lançado antes do seletor existir ficaria invisível em toda conta.
  if (bankAccountId) {
    await admin.from('dda_boletos')
      .update({ bank_account_id: bankAccountId })
      .eq('clinic_id', clinicId)
      .is('bank_account_id', null)
      .in('fingerprint', linhas.map(l => l.fingerprint))
  }
  return linhas.length
}

export interface ResultadoVarredura {
  ok:          boolean
  encontrados: number
  novos:       number
  /** Cru, para suporte. NUNCA vai para a tela do operador. */
  erro:        string | null
}

/**
 * Varre o DDA de UMA conta, nas duas janelas, e guarda o que vier.
 *
 * Erro numa janela não descarta a outra: metade da lista é melhor do que lista
 * nenhuma, e o motivo fica registrado. Quem chama decide o que mostrar — a
 * tela nunca mostra `erro`.
 */
export async function varrerContaDoDda(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  bankAccountId: string,
  hojeISO: string,
): Promise<ResultadoVarredura> {
  const rt = await loadPagamentosRuntime(admin, clinicId, bankAccountId)
  if ('error' in rt) return { ok: false, encontrados: 0, novos: 0, erro: rt.error }

  let encontrados = 0
  let novos = 0
  const falhas: string[] = []

  for (const janela of janelasDaVarredura(hojeISO)) {
    const res = await consultarDDA(rt, {
      dataInicial: janela.dataInicial,
      dataFinal:   janela.dataFinal,
      situacao:    1,   // a pagar
      tipoData:    1,   // por vencimento
    })
    if (!res.ok) { falhas.push(`${janela.rotulo}: ${res.error}`); continue }

    const boletos = res.boletos as DdaBoleto[]
    encontrados += boletos.length
    novos += await guardarBoletos(admin, clinicId, boletos, bankAccountId)
  }

  // As duas janelas falharam: não houve varredura nenhuma.
  if (falhas.length === 2) {
    return { ok: false, encontrados: 0, novos: 0, erro: falhas.join(' · ') }
  }
  return { ok: true, encontrados, novos, erro: falhas.length ? falhas.join(' · ') : null }
}
