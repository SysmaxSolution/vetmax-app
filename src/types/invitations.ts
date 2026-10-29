// Tipos de `src/lib/actions/invitations.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type InvitationState =
  | { error: string }
  | {
      url: string
      token: string
      /** true = o provedor aceitou o e-mail; false = tentou enviar e falhou (ver emailError); undefined = só gerou o link. */
      emailSent?: boolean
      /** Motivo, no vocabulário do operador, quando emailSent === false. */
      emailError?: string
    }
  | null

/** Lista de módulos a pré-configurar para o convidado no onboarding. */
export type InvitationModuleAccess = Array<{ module_name: string; enabled: boolean }>
