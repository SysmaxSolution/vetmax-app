// Evolution API v2.2.3 client — self-hosted WhatsApp gateway

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
  // @lid não é um número de telefone — retorna como está para falhar explicitamente no caller
  if (raw.includes('@')) return raw
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits
}

// Tenta resolver um JID @lid para o JID real @s.whatsapp.net via cache de contatos da instância.
// Retorna null se não encontrado — o caller decide o fallback.
export async function evolutionFetchContactByLid(
  creds: EvolutionCreds,
  lidJid: string,
): Promise<string | null> {
  try {
    const url = `${creds.apiUrl}/chat/findContacts/${creds.instanceId}`
    const res = await fetch(url, {
      method:  'POST',
      headers: buildHeaders(creds.apiKey),
      body:    JSON.stringify({ where: { remoteJid: lidJid } }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const contacts: Record<string, unknown>[] = Array.isArray(data) ? data : []
    // Procura um JID real (não @lid) para o mesmo contato
    for (const c of contacts) {
      const id = c.id as string | undefined
      if (id && id.endsWith('@s.whatsapp.net')) return id
      const phone = c.phone as string | undefined
      if (phone) return phone.includes('@') ? phone : `${phone}@s.whatsapp.net`
    }
    return null
  } catch {
    return null
  }
}

export async function evolutionSendText(
  creds: EvolutionCreds,
  phone: string,
  message: string,
): Promise<void> {
  const number = formatPhone(phone)
  const url    = `${creds.apiUrl}/message/sendText/${creds.instanceId}`
  // v2.x: campo "text" direto (v1.x usava textMessage: { text })
  const body   = JSON.stringify({ number, text: message })

  console.info(`[Evolution] sendText → number="${number}" | ${url}`)

  const res          = await fetch(url, { method: 'POST', headers: buildHeaders(creds.apiKey), body })
  const responseText = await res.text()

  if (!res.ok) {
    console.error(`[Evolution] sendText FAILED ${res.status}: ${responseText}`)
    throw new Error(`Evolution API [sendText] ${res.status}: ${responseText}`)
  }

  console.info(`[Evolution] sendText OK ${res.status}: ${responseText.substring(0, 200)}`)
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
  // v2.x: integration obrigatório; webhook configurado separadamente via /webhook/set
  const body: Record<string, unknown> = {
    instanceName: params.instanceName,
    integration:  'WHATSAPP-BAILEYS',
    qrcode:       true,
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
