// O núcleo da sincronização com a SEFAZ, compartilhado pela tela e pelo cron.
//
// Vive FORA de `src/lib/actions/dfe.ts` pelo mesmo motivo do DDA: aquele
// arquivo é `'use server'`, e função exportada de lá vira server action que o
// navegador pode chamar. `credencialDaEmpresa` decifra o certificado e-CNPJ —
// expor isso como action seria entregar o caminho da credencial.
//
// E o cron não poderia usar as funções de lá de todo jeito: elas exigem sessão
// de usuário, e rotina automática não tem usuário.
//
// Server-only.

import type { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/integrations/bank-certificate'
import {
  consultarPorNsu, lerDadosDaNota,
  type CredencialSefaz, type DocumentoDfe,
} from './sefaz-dfe'
import { enviarEvento } from './sefaz-evento'
import { decidirConsulta, aplicarResposta } from './dfe-nsu'
import { mensagemErro } from '@/lib/errors'

export async function credencialDaEmpresa(
  admin: ReturnType<typeof createAdminClient>, clinicId: string, companyId: string,
): Promise<CredencialSefaz | { error: string }> {
  const { data: emp } = await admin
    .from('companies').select('cnpj').eq('id', companyId).eq('clinic_id', clinicId).maybeSingle()
  const cnpj = String((emp as { cnpj?: string } | null)?.cnpj ?? '').replace(/\D/g, '')
  if (!cnpj) return { error: 'A empresa não tem CNPJ cadastrado.' }

  // A UF de quem consulta vai no `cUFAutor`. Sem ela a requisição é
  // malformada — e a Receita não diz isso: responde "nenhum documento".
  const { data: cli } = await admin
    .from('clinics').select('state').eq('id', clinicId).maybeSingle()
  const uf = (cli as { state?: string | null } | null)?.state ?? null
  if (!uf) return { error: 'O estado da clínica não está preenchido no cadastro.' }

  // O certificado da empresa; na falta dele, o geral da clínica.
  const base = () => admin.from('clinic_bank_certificates')
    .select('pfx_encrypted, passphrase_encrypted, not_after').eq('clinic_id', clinicId)
  let cert = (await base().eq('company_id', companyId).maybeSingle()).data as Record<string, unknown> | null
  if (!cert) cert = (await base().is('company_id', null).maybeSingle()).data as Record<string, unknown> | null
  if (!cert) return { error: 'Esta empresa não tem certificado digital cadastrado.' }

  const pfx = decryptSecret(cert.pfx_encrypted as string)
  if (!pfx) return { error: 'Não foi possível ler o certificado guardado.' }
  const senha = decryptSecret((cert.passphrase_encrypted as string | null) ?? null)

  const venc = cert.not_after as string | null
  if (venc && new Date(venc).getTime() < Date.now()) {
    return { error: 'O certificado digital desta empresa está vencido.' }
  }

  return {
    ambiente: 'producao',
    pfx,
    passphrase: senha ? senha.toString('utf8') : null,
    cnpj,
    cUF: uf,
  }
}

export async function guardarDocumentos(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string, companyId: string, origem: 'nsu' | 'chave',
  documentos: DocumentoDfe[],
): Promise<{ novas: number; comXml: number }> {
  let novas = 0
  let comXml = 0

  for (const doc of documentos) {
    // Eventos não são notas; interessam só pelo efeito que já registramos.
    if (doc.tipo === 'evento' || doc.tipo === 'resumo_evento') continue
    const dados = lerDadosDaNota(doc.xml, doc.chave)
    if (!dados) continue

    const completo = doc.tipo === 'completo'
    const { data: ja } = await admin.from('dfe_documentos')
      .select('id, xml').eq('clinic_id', clinicId).eq('chave', dados.chave).maybeSingle()

    const campos: Record<string, unknown> = {
      clinic_id: clinicId, company_id: companyId, chave: dados.chave,
      nsu: doc.nsu || null, tipo: doc.tipo, origem,
      emitente_cnpj: dados.emitenteCnpj, emitente_nome: dados.emitenteNome,
      numero: dados.numero, serie: dados.serie, valor: dados.valor,
      emitida_em: dados.emitidaEm, situacao: dados.situacao,
      updated_at: new Date().toISOString(),
    }
    // Só grava o XML quando ele é o completo. Resumo não apaga arquivo.
    if (completo) campos.xml = doc.xml

    if (ja) {
      const tinhaXml = Boolean((ja as { xml?: string | null }).xml)
      await admin.from('dfe_documentos').update(campos).eq('id', (ja as { id: string }).id)
      if (completo && !tinhaXml) comXml++
    } else {
      await admin.from('dfe_documentos').insert(campos)
      novas++
      if (completo) comXml++
    }
  }

  return { novas, comXml }
}

export async function manifestarPendentes(
  admin: ReturnType<typeof createAdminClient>,
  cred: CredencialSefaz, clinicId: string, companyId: string, limite = 20,
): Promise<number> {
  const { data: pendentes } = await admin.from('dfe_documentos')
    .select('id, chave')
    .eq('clinic_id', clinicId).eq('company_id', companyId)
    .is('xml', null).is('manifestado_em', null)
    .order('emitida_em', { ascending: false })
    .limit(limite)

  let feitas = 0
  for (const p of (pendentes ?? []) as { id: string; chave: string }[]) {
    try {
      const r = await enviarEvento(cred, p.chave, '210210')
      if (r.ok) {
        // Duplicidade conta como feita: alguém já manifestou e o XML foi
        // liberado do mesmo jeito.
        await admin.from('dfe_documentos').update({
          manifestado_em: new Date().toISOString(),
          manifestacao: r.duplicado ? '210210:duplicado' : '210210',
          updated_at: new Date().toISOString(),
        }).eq('id', p.id)
        feitas++
      } else if (r.foraDoPrazo) {
        // Passou dos 10 dias: não adianta tentar de novo, e insistir todo dia
        // só gastaria chamada. Marca para não voltar à fila.
        await admin.from('dfe_documentos').update({
          manifestacao: '210210:fora_do_prazo', updated_at: new Date().toISOString(),
        }).eq('id', p.id)
      }
    } catch {
      // Falha numa nota não interrompe as outras.
    }
  }
  return feitas
}

export interface ResultadoSync {
  ok:     boolean
  novas:  number
  comXml: number
  manifestadas: number
  /** Cru, para suporte. Nunca vai para a tela. */
  erro:   string | null
  /** True quando a consulta não pôde ser feita agora. */
  bloqueado: boolean
  /** True quando já estamos em dia — não é erro. */
  emDia:  boolean
}

/**
 * Põe UMA empresa em dia com a SEFAZ.
 *
 * O laço para sozinho em três situações: a Receita diz que não há mais nada,
 * o bloqueio entra em vigor, ou 20 lotes (1000 documentos) foram lidos. O teto
 * existe para que um clique não vire uma espera de minutos — o que sobrar vem
 * na próxima passada.
 */
export async function sincronizarEmpresa(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  companyId: string,
): Promise<ResultadoSync> {
  const vazio: ResultadoSync = {
    ok: true, novas: 0, comXml: 0, manifestadas: 0, erro: null, bloqueado: false, emDia: false,
  }

  const { data: cfg } = await admin.from('company_dfe')
    .select('enabled, auto_ciencia, ult_nsu, max_nsu, bloqueado_ate, bloqueios')
    .eq('company_id', companyId).eq('clinic_id', clinicId).maybeSingle()
  if (!cfg) return { ...vazio, ok: false, erro: 'empresa sem configuração de DF-e' }

  const estado = cfg as unknown as {
    enabled: boolean; auto_ciencia: boolean; ult_nsu: number
    max_nsu: number; bloqueado_ate: string | null; bloqueios: number
  }

  const decisao = decidirConsulta(estado, new Date().toISOString())
  if (!decisao.consultar) {
    return { ...vazio, bloqueado: decisao.motivo === 'bloqueado', emDia: decisao.motivo === 'em_dia' }
  }

  const cred = await credencialDaEmpresa(admin, clinicId, companyId)
  if ('error' in cred) return { ...vazio, ok: false, erro: cred.error }

  let nsu = decisao.aPartirDe
  let novas = 0, comXml = 0, bloqueios = estado.bloqueios

  for (let volta = 0; volta < 20; volta++) {
    let resposta
    try { resposta = await consultarPorNsu(cred, nsu) }
    catch (e) {
      const agora = new Date().toISOString()
      await admin.from('company_dfe').update({
        ultima_consulta: agora, situacao: 'erro',
        erro_tecnico: mensagemErro(e, 'lib/fiscal/dfe-sync.ts'), updated_at: agora,
      }).eq('company_id', companyId)
      return { ...vazio, ok: false, novas, comXml, erro: mensagemErro(e, 'lib/fiscal/dfe-sync.ts') }
    }

    const g = await guardarDocumentos(admin, clinicId, companyId, 'nsu', resposta.documentos)
    novas += g.novas; comXml += g.comXml

    const agora = new Date().toISOString()
    const proximo = aplicarResposta(
      { ...estado, ult_nsu: nsu, max_nsu: resposta.maxNSU },
      { cStat: resposta.cStat, ultNSU: resposta.ultNSU, maxNSU: resposta.maxNSU, documentos: resposta.documentos.length },
      agora)
    nsu = proximo.ult_nsu
    if (proximo.contarBloqueio) bloqueios++
    // Prova direta de outro consumidor vale por tres ocorrencias: e o que
    // faz a tela avisar ja na primeira vez, em vez de esperar o padrao.
    if (proximo.outroConsumidor) bloqueios = Math.max(bloqueios, 3)

    await admin.from('company_dfe').update({
      ult_nsu: proximo.ult_nsu, max_nsu: proximo.max_nsu,
      bloqueado_ate: proximo.bloqueado_ate, bloqueios,
      ultima_consulta: agora, ultimo_sucesso: agora,
      situacao: 'ok', erro_tecnico: null, updated_at: agora,
    }).eq('company_id', companyId)

    if (!proximo.continuar) break
  }

  // A Ciência tem prazo de 10 dias. Rodar junto da sincronização é o que
  // garante que a nota não envelheça esperando alguém abrir a tela.
  let manifestadas = 0
  if (estado.auto_ciencia) {
    manifestadas = await manifestarPendentes(admin, cred, clinicId, companyId)
  }

  return { ok: true, novas, comXml, manifestadas, erro: null, bloqueado: false, emDia: false }
}
