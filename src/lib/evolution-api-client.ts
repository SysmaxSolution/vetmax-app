// Evolution API v1.8.4 client — self-hosted WhatsApp gateway

export type EvolutionCreds = {
  apiUrl:     string   // e.g. http://localhost:8080
  instanceId: string   // instance name, e.g. SysVetMax
  apiKey:     string   // global API key configured in the container
}

export type EvolutionConnectionState = 'open' | 'close' | 'connecting' | 'not_created'

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey':       apiKey,
  }
}

function formatPhone(raw: string): string {
  // Se já é um JID completo (contém @), usa como está (ex: 5511...@s.whatsapp.net ou @lid)
  if (raw.includes('@')) return raw
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits
}

export async function evolutionSendText(
  creds: EvolutionCreds,
  phone: string,
  message: string,
): Promise<void> {
  // Para @lid, tenta resolver o JID real via contact store da Evolution API
  let resolved = phone
  if (phone.includes('@lid')) {
    const realJid = await resolveJidFromLid(creds, phone)
    if (realJid) {
      resolved = realJid.replace('@s.whatsapp.net', '')
    }
  }

  const number = formatPhone(resolved)
  const url    = `${creds.apiUrl}/message/sendText/${creds.instanceId}`
  // Evolution API v1.8.x expects { number, textMessage: { text } }
  const body   = JSON.stringify({ number, textMessage: { text: message } })

  console.info(`[Evolution] sendText → number="${number}" (raw="${phone}") | ${url}`)

  const res          = await fetch(url, { method: 'POST', headers: buildHeaders(creds.apiKey), body })
  const responseText = await res.text()

  if (!res.ok) {
    console.error(`[Evolution] sendText FAILED ${res.status}: ${responseText}`)
    throw new Error(`Evolution API [sendText] ${res.status}: ${responseText}`)
  }

  console.info(`[Evolution] sendText OK ${res.status}: ${responseText.substring(0, 200)}`)
}

// Tenta obter o JID @s.whatsapp.net de um contato identificado por @lid.
// O Baileys mantém esse mapeamento internamente; tentamos várias formas de consultá-lo.
async function resolveJidFromLid(creds: EvolutionCreds, lid: string): Promise<string | null> {
  const headers   = buildHeaders(creds.apiKey)
  const base      = creds.apiUrl
  const inst      = creds.instanceId
  const lidNumber = lid.replace('@lid', '')  // Algumas versões gravam sem o sufixo

  // Estratégia 1: GET /contact/findContacts com variações de campo e valor
  const queries = [
    { remoteJid: lid },
    { id:        lid },
    { lid:       lid },
    { lid:       lidNumber },
  ]
  for (const where of queries) {
    try {
      const enc = encodeURIComponent(JSON.stringify(where))
      const res = await fetch(`${base}/contact/findContacts/${inst}?where=${enc}`, { headers })
      if (res.ok) {
        const raw      = await res.json()
        const contacts = (Array.isArray(raw) ? raw : (raw?.data ?? raw?.contacts ?? [])) as Record<string, unknown>[]
        for (const c of contacts) {
          const jid = (c.remoteJid ?? c.jid ?? c.id) as string | undefined
          if (jid?.includes('@s.whatsapp.net')) {
            console.info(`[Evolution] @lid ${lid} → ${jid} (findContacts where=${JSON.stringify(where)})`)
            return jid
          }
        }
      }
    } catch { /* tenta próxima variação */ }
  }

  // Estratégia 2: GET /contact/fetchContacts — todos os contatos, busca por campo lid
  try {
    const res = await fetch(`${base}/contact/fetchContacts/${inst}`, { headers })
    if (res.ok) {
      const raw      = await res.json()
      const contacts = (Array.isArray(raw) ? raw : (raw?.data ?? raw?.contacts ?? [])) as Record<string, unknown>[]
      for (const c of contacts) {
        if (c.lid === lid || c.lid === lidNumber || c.remoteJid === lid) {
          const jid = (c.remoteJid ?? c.jid ?? c.id) as string | undefined
          if (jid?.includes('@s.whatsapp.net')) {
            console.info(`[Evolution] @lid ${lid} → ${jid} (fetchContacts by lid)`)
            return jid
          }
        }
      }
    }
  } catch { /* ignora */ }

  console.warn(`[Evolution] @lid ${lid} (${lidNumber}) — JID real não encontrado`)
  return null
}

// ─── Instance Management ──────────────────────────────────────────────────────

export async function evolutionGetQrCode(
  creds: EvolutionCreds,
): Promise<{ base64: string } | null> {
  // v1.8.4: GET /instance/connect/{name} retorna QR base64 quando desconectado
  const url = `${creds.apiUrl}/instance/connect/${creds.instanceId}`
  try {
    const res = await fetch(url, { headers: buildHeaders(creds.apiKey) })
    if (!res.ok) return null
    const data = await res.json()
    const base64 = data?.base64 ?? data?.qrcode?.base64 ?? null
    return base64 ? { base64 } : null
  } catch {
    return null
  }
}

export async function evolutionGetConnectionState(
  creds: EvolutionCreds,
): Promise<EvolutionConnectionState> {
  const url = `${creds.apiUrl}/instance/connectionState/${creds.instanceId}`
  try {
    const res = await fetch(url, { headers: buildHeaders(creds.apiKey) })
    if (res.status === 404) return 'not_created'
    if (!res.ok) return 'close'
    const data = await res.json()
    return (data?.instance?.state ?? 'close') as EvolutionConnectionState
  } catch {
    return 'close'
  }
}

export async function evolutionCreateInstance(params: {
  apiUrl:       string
  apiKey:       string
  instanceName: string
  webhookUrl?:  string
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  // v1.8.4: webhook aceita string (URL) no create; eventos configurados via /webhook/set depois
  const body: Record<string, unknown> = {
    instanceName: params.instanceName,
    qrcode:       true,
  }
  if (params.webhookUrl) {
    body.webhook = params.webhookUrl
  }
  try {
    const res = await fetch(`${params.apiUrl}/instance/create`, {
      method:  'POST',
      headers: buildHeaders(params.apiKey),
      body:    JSON.stringify(body),
    })
    if (res.ok) return { ok: true }
    const text = await res.text().catch(() => '(sem corpo)')
    return { ok: false, status: res.status, body: text }
  } catch (err) {
    return { ok: false, status: 0, body: String(err) }
  }
}

export async function evolutionSetWebhook(params: {
  creds:      EvolutionCreds
  webhookUrl: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${params.creds.apiUrl}/webhook/set/${params.creds.instanceId}`, {
      method:  'POST',
      headers: buildHeaders(params.creds.apiKey),
      body: JSON.stringify({
        enabled: true,
        url:     params.webhookUrl,
        events:  ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Message Sending ──────────────────────────────────────────────────────────

export async function evolutionSendMedia(
  creds: EvolutionCreds,
  phone: string,
  params: {
    mediaUrl:  string
    fileName:  string
    mimeType:  string
    caption?:  string
  },
): Promise<void> {
  const mediatype =
    params.mimeType.startsWith('image/') ? 'image' :
    params.mimeType.startsWith('video/') ? 'video' :
    'document'

  const url = `${creds.apiUrl}/message/sendMedia/${creds.instanceId}`
  const body = JSON.stringify({
    number:    formatPhone(phone),
    mediatype,
    mimetype:  params.mimeType,
    caption:   params.caption ?? '',
    media:     params.mediaUrl,
    fileName:  params.fileName,
  })

  const res = await fetch(url, { method: 'POST', headers: buildHeaders(creds.apiKey), body })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution API [sendMedia/${mediatype}] ${res.status}: ${text}`)
  }
}
