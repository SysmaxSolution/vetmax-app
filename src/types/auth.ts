// Tipos de `src/lib/actions/auth.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type AuthState =
  | { error: string }
  /** Senha certa, mas o e-mail ainda não foi confirmado: a tela oferece reenviar o link. */
  | { error: string; precisaConfirmar: true; email: string }
  | { selectClinic: true; clinics: { id: string; name: string; role: string }[] }
  | null
