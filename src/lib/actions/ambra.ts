'use server'

import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clinicFlowFlag, routineOffError } from '@/lib/clinic/flow-gate'
import { encryptSecret, decryptText } from '@/lib/crypto/segredo'
import { mensagemErro } from '@/lib/errors'
import {
  buscarEstudoPorAccession, criarLinkVisualizacao, registrarWebhook, testarConexao,
  type CredenciaisAmbra,
} from '@/lib/integrations/ambra'

// Configuração e operação manual da integração Ambra.
//
// O caminho normal é automático: a Ambra avisa por webhook quando a imagem
// chega e o link é criado sozinho. O que está aqui é a configuração e os
// caminhos de exceção — testar a conexão, amarrar um estudo que não casou
// sozinho, renovar link vencido.

type Ctx = { userId: string; clinicId: string; role: string }

async function getCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (!(await clinicFlowFlag(createAdminClient(), profile.clinic_id as string, 'usa_imagem'))) {
    return routineOffError('O módulo de Imagem')
  }
  return { userId: user.id, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

function ehGestor(role: string): boolean {
  return ['admin', 'owner', 'manager'].includes(role)
}

async function origem(): Promise<string> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  return `${proto}://${host}`
}

/** Carrega a credencial decifrada. Uso interno. */
async function credenciais(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
): Promise<CredenciaisAmbra | { error: string }> {
  const { data } = await admin
    .from('clinic_ambra_config')
    .select('enabled, base_url, login, password_encrypted, phi_namespace, account_id')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  const cfg = data as {
    enabled: boolean; base_url: string; login: string | null
    password_encrypted: string | null; phi_namespace: string | null; account_id: string | null
  } | null

  if (!cfg || !cfg.enabled) return { error: 'A integração com a Ambra não está ativada para esta clínica.' }
  const senha = decryptText(cfg.password_encrypted)
  if (!cfg.login || !senha) return { error: 'Usuário ou senha da Ambra não configurados (Configurações → Integrações).' }

  return {
    base_url: cfg.base_url,
    login: cfg.login,
    password: senha,
    phi_namespace: cfg.phi_namespace,
    account_id: cfg.account_id,
  }
}

// ─── Configuração ────────────────────────────────────────────────────────────

export interface ConfigAmbraVisivel {
  enabled:            boolean
  base_url:           string
  login:              string | null
  /** Nunca devolvemos a senha; só se existe. */
  tem_senha:          boolean
  phi_namespace:      string | null
  account_id:         string | null
  link_minutes_alive: number
  link_max_hits:      number
  notify_emails:      string | null
  /** URL completa que deve ser cadastrada na Ambra. Contém o segredo. */
  webhook_url:        string | null
  webhook_id:         string | null
}

export async function getConfigAmbra(): Promise<ConfigAmbraVisivel | { error: string }> {
  const c = await getCtx()
  if ('error' in c) return { error: c.error }
  if (!ehGestor(c.role)) return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinic_ambra_config')
    .select('enabled, base_url, login, password_encrypted, phi_namespace, account_id, webhook_secret, webhook_id, link_minutes_alive, link_max_hits, notify_emails')
    .eq('clinic_id', c.clinicId)
    .maybeSingle()

  if (!data) {
    return {
      enabled: false, base_url: 'https://access.ambrahealth.com', login: null,
      tem_senha: false, phi_namespace: null, account_id: null,
      link_minutes_alive: 10080, link_max_hits: 50, notify_emails: null,
      webhook_url: null, webhook_id: null,
    }
  }

  const d = data as Record<string, unknown>
  const segredo = d.webhook_secret as string | null
  return {
    enabled:            d.enabled as boolean,
    base_url:           d.base_url as string,
    login:              (d.login as string) ?? null,
    tem_senha:          !!d.password_encrypted,
    phi_namespace:      (d.phi_namespace as string) ?? null,
    account_id:         (d.account_id as string) ?? null,
    link_minutes_alive: d.link_minutes_alive as number,
    link_max_hits:      d.link_max_hits as number,
    notify_emails:      (d.notify_emails as string) ?? null,
    webhook_url:        segredo ? `${await origem()}/api/webhooks/ambra/${segredo}` : null,
    webhook_id:         (d.webhook_id as string) ?? null,
  }
}

export async function salvarConfigAmbra(params: {
  enabled:            boolean
  base_url?:          string
  login?:             string
  /** Só envie quando o usuário digitou uma senha nova. */
  password?:          string
  phi_namespace?:     string
  account_id?:        string
  link_minutes_alive?: number
  link_max_hits?:     number
  notify_emails?:     string
}): Promise<{ ok: true } | { error: string }> {
  const c = await getCtx()
  if ('error' in c) return { error: c.error }
  if (!ehGestor(c.role)) return { error: 'Sem permissão.' }

  const minutos = params.link_minutes_alive ?? 10080
  const acessos = params.link_max_hits ?? 50
  if (minutos < 5 || minutos > 525600) return { error: 'A validade do link deve ficar entre 5 minutos e 1 ano.' }
  if (acessos < 1 || acessos > 10000) return { error: 'O número máximo de acessos deve ficar entre 1 e 10.000.' }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = {
    clinic_id: c.clinicId,
    enabled: params.enabled,
    base_url: (params.base_url || 'https://access.ambrahealth.com').replace(/\/+$/, ''),
    login: params.login?.trim() || null,
    phi_namespace: params.phi_namespace?.trim() || null,
    account_id: params.account_id?.trim() || null,
    link_minutes_alive: minutos,
    link_max_hits: acessos,
    notify_emails: params.notify_emails?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  // Senha só é tocada quando veio preenchida — senão salvar a tela limparia a
  // senha de quem não quis mudá-la.
  if (params.password?.trim()) patch.password_encrypted = encryptSecret(params.password.trim())

  // O segredo do webhook nasce aqui e não muda sozinho: ele está cadastrado do
  // lado da Ambra, e regerar a cada save quebraria a integração em silêncio.
  const { data: atual } = await admin
    .from('clinic_ambra_config').select('webhook_secret').eq('clinic_id', c.clinicId).maybeSingle()
  if (!(atual as { webhook_secret?: string } | null)?.webhook_secret) {
    patch.webhook_secret = randomBytes(24).toString('base64url')
  }

  const { error } = await admin.from('clinic_ambra_config').upsert(patch, { onConflict: 'clinic_id' })
  if (error) return { error: mensagemErro(error, 'lib/actions/ambra.ts') }

  revalidatePath('/dashboard/management')
  return { ok: true }
}

export async function testarConexaoAmbra(): Promise<{ ok: true; estudosVisiveis: number } | { error: string }> {
  const c = await getCtx()
  if ('error' in c) return { error: c.error }
  if (!ehGestor(c.role)) return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const cred = await credenciais(admin, c.clinicId)
  if ('error' in cred) return { error: cred.error }

  const r = await testarConexao(cred)
  return r.ok ? { ok: true, estudosVisiveis: r.estudosVisiveis } : { error: r.erro }
}

/**
 * Registra na Ambra o webhook que nos avisa da chegada da imagem.
 *
 * Guarda o id devolvido para não registrar duas vezes. Se o usuário de
 * integração não tiver permissão de `/webhook/add`, a Ambra recusa e a
 * mensagem orienta a pedir o cadastro a eles.
 */
export async function registrarWebhookAmbra(
  regexAccession?: string,
): Promise<{ ok: true; webhook_id: string } | { error: string }> {
  const c = await getCtx()
  if ('error' in c) return { error: c.error }
  if (!ehGestor(c.role)) return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const cred = await credenciais(admin, c.clinicId)
  if ('error' in cred) return { error: cred.error }

  const { data } = await admin
    .from('clinic_ambra_config').select('webhook_secret, webhook_id').eq('clinic_id', c.clinicId).maybeSingle()
  const cfg = data as { webhook_secret: string | null; webhook_id: string | null } | null
  if (!cfg?.webhook_secret) return { error: 'Salve a configuração antes de registrar o webhook.' }
  if (cfg.webhook_id) return { ok: true, webhook_id: cfg.webhook_id }

  const destino = `${await origem()}/api/webhooks/ambra/${cfg.webhook_secret}`
  if (!destino.startsWith('https://')) {
    return { error: 'A Ambra só aceita webhook em https. Registre a partir do ambiente publicado, não do localhost.' }
  }

  try {
    const id = await registrarWebhook(cred, {
      nome: 'SYSVETMAX — imagem disponível',
      urlDestino: destino,
      evento: 'STUDY_FIRST_IMAGE',
      regexAccession,
    })
    await admin.from('clinic_ambra_config').update({ webhook_id: id }).eq('clinic_id', c.clinicId)
    return { ok: true, webhook_id: id }
  } catch (e) {
    return { error: mensagemErro(e, 'lib/actions/ambra.ts') }
  }
}

// ─── Operação manual (caminhos de exceção) ───────────────────────────────────

/**
 * Procura o estudo na Ambra pelo accession e amarra ao estudo daqui.
 *
 * Usado quando o webhook não chegou, quando o exame é anterior à integração,
 * ou quando o operador corrigiu o accession depois.
 */
export async function vincularEstudoAmbra(
  studyId: string,
  accession?: string,
): Promise<{ ok: true; url: string; expiraEm: string } | { error: string }> {
  const c = await getCtx()
  if ('error' in c) return { error: c.error }

  const admin = createAdminClient()
  const cred = await credenciais(admin, c.clinicId)
  if ('error' in cred) return { error: cred.error }

  const { data: est } = await admin
    .from('imaging_studies')
    .select('id, accession_number, ambra_study_uuid')
    .eq('clinic_id', c.clinicId).eq('id', studyId).maybeSingle()
  const estudo = est as { id: string; accession_number: string | null; ambra_study_uuid: string | null } | null
  if (!estudo) return { error: 'Estudo não encontrado.' }

  const chave = (accession ?? estudo.accession_number ?? '').trim()
  if (!chave && !estudo.ambra_study_uuid) {
    return { error: 'Informe o accession do exame para localizá-lo na Ambra.' }
  }

  const { data: cfgRow } = await admin
    .from('clinic_ambra_config').select('link_minutes_alive, link_max_hits, notify_emails')
    .eq('clinic_id', c.clinicId).single()
  const cfg = cfgRow as { link_minutes_alive: number; link_max_hits: number; notify_emails: string | null }

  try {
    let uuid = estudo.ambra_study_uuid
    if (!uuid) {
      const achado = await buscarEstudoPorAccession(cred, chave)
      if (!achado) return { error: `Nenhum estudo com o accession "${chave}" foi encontrado na Ambra.` }
      uuid = achado.uuid
    }

    const link = await criarLinkVisualizacao(cred, uuid, {
      minutosDeVida: cfg.link_minutes_alive,
      maxAcessos:    cfg.link_max_hits,
      notificar:     cfg.notify_emails,
    })

    await admin.from('imaging_studies').update({
      accession_number:      chave || estudo.accession_number,
      ambra_study_uuid:      uuid,
      ambra_link_url:        link.url,
      ambra_link_expires_at: link.expiraEm.toISOString(),
      ambra_synced_at:       new Date().toISOString(),
    }).eq('id', studyId).eq('clinic_id', c.clinicId)

    revalidatePath('/dashboard')
    return { ok: true, url: link.url, expiraEm: link.expiraEm.toISOString() }
  } catch (e) {
    return { error: mensagemErro(e, 'lib/actions/ambra.ts') }
  }
}

export interface EventoAmbraPendente {
  id:               string
  event:            string
  accession_number: string | null
  received_at:      string
  error:            string | null
}

/**
 * Eventos que chegaram e não casaram com estudo nenhum.
 *
 * Sem esta lista, imagem que chega com accession errado some em silêncio — e
 * ninguém descobre até o tutor cobrar o exame.
 */
export async function listarEventosAmbraPendentes(
  limite = 50,
): Promise<EventoAmbraPendente[] | { error: string }> {
  const c = await getCtx()
  if ('error' in c) return { error: c.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ambra_webhook_events')
    .select('id, event, accession_number, received_at, error')
    .eq('clinic_id', c.clinicId)
    .is('study_id', null)
    .order('received_at', { ascending: false })
    .limit(Math.min(limite, 200))

  if (error) return { error: mensagemErro(error, 'lib/actions/ambra.ts') }
  return (data ?? []) as EventoAmbraPendente[]
}
