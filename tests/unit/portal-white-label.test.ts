/**
 * Unit — White-label do Portal do Tutor.
 *
 * Duas coisas são provadas aqui:
 *   1. o TEMA cai no padrão campo a campo (ninguém fica sem identidade);
 *   2. o CONTEXTO DE CLÍNICA NA URL só restringe — nunca amplia acesso.
 *
 * O item 2 é o que sustenta a promessa de isolamento depois de a URL passar a
 * carregar a clínica: um tutor que digite o slug da clínica alheia tem de ser
 * recusado exatamente como se a clínica não existisse.
 */
import {
  DEFAULT_PORTAL_THEME, resolvePortalTheme, portalThemeCssVars, sanitizeHex,
  sanitizeImageUrl, isHeadingFontId, headingFontStack, slugifyClinicName,
  uniqueClinicSlug, isValidClinicSlug, mixHex, readableOn,
} from '@/lib/portal/theme'
import {
  resolvePortalClinic, linksForClinic, decidePortalEntry, portalClinicPath,
} from '@/lib/portal/clinic-context'
import { canAccessPatient, type LinkRow } from '@/lib/portal/access'

// ── Cenário base: a MESMA pessoa é tutora na clínica A e na clínica B ────────
const C_A = 'clinic-animais'
const C_B = 'clinic-bichos'
const C_X = 'clinic-alheia'          // existe no sistema, mas não é dela
const T_A = 'tutor-na-A'
const T_B = 'tutor-na-B'

const LINKS: LinkRow[] = [
  { tutor_id: T_A, clinic_id: C_A },
  { tutor_id: T_B, clinic_id: C_B },
]

const CLINICS = [
  { id: C_A, portal_slug: 'animais' },
  { id: C_B, portal_slug: 'bichos-felizes' },
  { id: C_X, portal_slug: 'clinica-alheia' },
]

describe('tema — o padrão nunca deixa ninguém feio', () => {
  it('sem linha no banco → tema padrão inteiro', () => {
    expect(resolvePortalTheme(null)).toEqual(DEFAULT_PORTAL_THEME)
    expect(resolvePortalTheme(undefined)).toEqual(DEFAULT_PORTAL_THEME)
  })

  it('fallback é campo a campo: o que a clínica configurou vale, o resto é padrão', () => {
    const t = resolvePortalTheme({ primary_color: '#1B4D9B', accent_color: null })
    expect(t.primaryColor).toBe('#1B4D9B')
    expect(t.accentColor).toBe(DEFAULT_PORTAL_THEME.accentColor)
    expect(t.bgColor).toBe(DEFAULT_PORTAL_THEME.bgColor)
  })

  it('valor inválido não vira CSS — cai no padrão', () => {
    const t = resolvePortalTheme({
      primary_color: 'red; background:url(http://mau)',
      bg_color: 'javascript:alert(1)',
      heading_font: 'Comic Sans',
      cover_image_url: 'javascript:alert(1)',
    })
    expect(t.primaryColor).toBe(DEFAULT_PORTAL_THEME.primaryColor)
    expect(t.bgColor).toBe(DEFAULT_PORTAL_THEME.bgColor)
    expect(t.headingFont).toBe(DEFAULT_PORTAL_THEME.headingFont)
    expect(t.coverImageUrl).toBeNull()
  })

  it('hex de 3 dígitos é expandido e normalizado', () => {
    expect(sanitizeHex('#abc', '#000000')).toBe('#AABBCC')
    expect(sanitizeHex('nada', '#112233')).toBe('#112233')
  })

  it('capa só aceita http(s)', () => {
    expect(sanitizeImageUrl('https://cdn.exemplo/capa.jpg')).toBe('https://cdn.exemplo/capa.jpg')
    expect(sanitizeImageUrl('data:image/png;base64,AAA')).toBeNull()
    expect(sanitizeImageUrl('  ')).toBeNull()
  })

  it('fonte só do conjunto seguro', () => {
    expect(isHeadingFontId('fraunces')).toBe(true)
    expect(isHeadingFontId('papyrus')).toBe(false)
    expect(headingFontStack('inter')).toContain('--font-pt-inter')
  })

  it('variáveis CSS saem completas e com as derivações calculadas', () => {
    const vars = portalThemeCssVars(DEFAULT_PORTAL_THEME)
    expect(vars['--pt-primary']).toBe('#17624A')
    expect(vars['--pt-accent-soft']).toMatch(/^rgba\(/)
    expect(vars['--pt-primary-mid']).toBe(mixHex('#0E3B2E', '#17624A', 0.5))
    expect(vars['--pt-heading-font']).toContain('--font-pt-fraunces')
  })

  it('texto sobre a cor é legível em fundo claro e escuro', () => {
    expect(readableOn('#0E3B2E')).toBe('#FFFFFF')
    expect(readableOn('#F6F5F1')).toBe('#16221C')
  })
})

describe('slug da clínica', () => {
  it('nome com acento e símbolo vira slug limpo', () => {
    expect(slugifyClinicName('Animais Clínica Veterinária')).toBe('animais-clinica-veterinaria')
    expect(slugifyClinicName('  Pet & Cia!!  ')).toBe('pet-cia')
    expect(slugifyClinicName('')).toBe('clinica')
  })

  it('colisão ganha sufixo numérico, não sobrescreve', () => {
    expect(uniqueClinicSlug('Animais', [])).toBe('animais')
    expect(uniqueClinicSlug('Animais', ['animais'])).toBe('animais-2')
    expect(uniqueClinicSlug('Animais', ['animais', 'animais-2'])).toBe('animais-3')
  })

  it('valida o formato aceito na URL', () => {
    expect(isValidClinicSlug('animais')).toBe(true)
    expect(isValidClinicSlug('animais-2')).toBe(true)
    expect(isValidClinicSlug('Animais')).toBe(false)
    expect(isValidClinicSlug('animais--2')).toBe(false)
    expect(isValidClinicSlug('a')).toBe(false)
    expect(isValidClinicSlug('../etc/passwd')).toBe(false)
  })

  it('monta o caminho canônico', () => {
    expect(portalClinicPath('animais')).toBe('/portal/c/animais')
    expect(portalClinicPath('animais', 'pet/1')).toBe('/portal/c/animais/pet/1')
  })
})

describe('contexto de clínica na URL — SÓ RESTRINGE', () => {
  it('slug da clínica A resolve para a clínica A', () => {
    expect(resolvePortalClinic('animais', CLINICS, LINKS)).toEqual({ ok: true, clinicId: C_A })
  })

  it('slug da clínica B resolve para a clínica B (mesma pessoa, outro contexto)', () => {
    expect(resolvePortalClinic('bichos-felizes', CLINICS, LINKS)).toEqual({ ok: true, clinicId: C_B })
  })

  it('PROVA DE ISOLAMENTO: slug de clínica NÃO vinculada é recusado', () => {
    // A clínica existe no sistema e o slug está correto — mesmo assim, recusa.
    expect(resolvePortalClinic('clinica-alheia', CLINICS, LINKS)).toEqual({ ok: false, reason: 'unknown' })
  })

  it('clínica inexistente e clínica alheia dão a MESMA resposta (a URL não é oráculo)', () => {
    const alheia = resolvePortalClinic('clinica-alheia', CLINICS, LINKS)
    const inexistente = resolvePortalClinic('nao-existe-mesmo', CLINICS, LINKS)
    expect(alheia).toEqual(inexistente)
  })

  it('slug malformado é recusado antes de qualquer consulta', () => {
    expect(resolvePortalClinic('../../etc', CLINICS, LINKS).ok).toBe(false)
    expect(resolvePortalClinic('', CLINICS, LINKS)).toEqual({ ok: false, reason: 'invalid' })
    expect(resolvePortalClinic(null, CLINICS, LINKS)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('sem vínculo nenhum, nenhum slug abre', () => {
    expect(resolvePortalClinic('animais', CLINICS, []).ok).toBe(false)
  })
})

describe('filtro de vínculos por contexto', () => {
  it('no contexto da A, só o vínculo da A sobrevive', () => {
    expect(linksForClinic(LINKS, C_A)).toEqual([{ tutor_id: T_A, clinic_id: C_A }])
  })

  it('PROVA DE ISOLAMENTO: dentro do contexto da A, o pet da B fica inacessível', () => {
    const scoped = linksForClinic(LINKS, C_A)
    // pet da clínica A, tutor A → passa
    expect(canAccessPatient(T_A, C_A, scoped)).toBe(true)
    // pet da clínica B, tutor B → MESMA pessoa, mas fora do contexto → recusa
    expect(canAccessPatient(T_B, C_B, scoped)).toBe(false)
    // cruzamento tutor da A com clínica da B → recusa (regra original, intacta)
    expect(canAccessPatient(T_A, C_B, scoped)).toBe(false)
    expect(canAccessPatient(T_B, C_A, scoped)).toBe(false)
  })

  it('o contexto NUNCA amplia: clínica não vinculada zera os vínculos', () => {
    const scoped = linksForClinic(LINKS, C_X)
    expect(scoped).toEqual([])
    expect(canAccessPatient(T_A, C_X, scoped)).toBe(false)
  })
})

describe('retrocompatibilidade do link antigo /portal', () => {
  it('tutor de UMA clínica é levado direto ao contexto dela', () => {
    expect(decidePortalEntry([{ tutor_id: T_A, clinic_id: C_A }]))
      .toEqual({ kind: 'redirect', clinicId: C_A })
  })

  it('tutor de DUAS clínicas vai ao seletor', () => {
    expect(decidePortalEntry(LINKS)).toEqual({ kind: 'select', clinicIds: [C_A, C_B] })
  })

  it('vários vínculos na MESMA clínica ainda contam como uma só', () => {
    expect(decidePortalEntry([
      { tutor_id: T_A, clinic_id: C_A },
      { tutor_id: 'outro-tutor', clinic_id: C_A },
    ])).toEqual({ kind: 'redirect', clinicId: C_A })
  })

  it('sem vínculo visível, fica onde está', () => {
    expect(decidePortalEntry([])).toEqual({ kind: 'empty' })
  })
})
