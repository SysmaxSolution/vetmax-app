// URL de exibição da assinatura eletrônica do médico veterinário.
//
// O bucket `user-signatures` é PRIVADO (migration 0499). Antes era público e
// o caminho é previsível — `<clinic_id>/<user_id>/signature.png` —, então a
// imagem da assinatura de um MV saía do ar sem autenticação nenhuma. Assinatura
// de MV fecha receita, laudo e prontuário; copiada, assina em nome de outra
// pessoa.
//
// Quem renderiza chama `urlAssinatura` e recebe uma URL assinada de vida curta.
// Não guarde o retorno em banco nem em cache longo: ele expira.

import { createAdminClient } from '@/lib/supabase/admin'

export const BUCKET_ASSINATURAS = 'user-signatures'

/** 10 minutos: tempo de sobra para renderizar e imprimir, curto para vazar. */
const VALIDADE_PADRAO_SEGUNDOS = 600

/** O que o helper precisa de um perfil. Aceita a linha crua do banco. */
export interface PerfilComAssinatura {
  electronic_signature_path?: string | null
  /** Legado: URL pública gravada antes da 0499. */
  electronic_signature_url?:  string | null
}

/**
 * URL para exibir a assinatura, ou `null` se a pessoa não tem assinatura.
 *
 * Com caminho gravado, assina na hora. Sem caminho, devolve a URL legada — há
 * ambientes que subiram assinatura antes da 0499, e engolir isso apagaria a
 * assinatura de laudos que hoje funcionam.
 */
export async function urlAssinatura(
  perfil:   PerfilComAssinatura | null | undefined,
  segundos: number = VALIDADE_PADRAO_SEGUNDOS,
): Promise<string | null> {
  if (!perfil) return null

  const caminho = perfil.electronic_signature_path?.trim()
  if (!caminho) return perfil.electronic_signature_url?.trim() || null

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(BUCKET_ASSINATURAS)
    .createSignedUrl(caminho, segundos)

  if (error || !data?.signedUrl) {
    // Documento sem assinatura é melhor que documento que não abre: o laudo
    // sai com o nome e o CRMV, e o erro fica no log do servidor.
    console.error('[assinatura] falha ao assinar URL', {
      caminho, message: error?.message ?? 'sem signedUrl',
    })
    return null
  }
  return data.signedUrl
}

/** Caminho canônico. Um arquivo por pessoa, sobrescrito a cada upload. */
export function caminhoAssinatura(clinicId: string, userId: string, extensao: string): string {
  const ext = extensao.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  return `${clinicId}/${userId}/signature.${ext}`
}
