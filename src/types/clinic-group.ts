// Tipos do acesso de usuários às clínicas do grupo (Empresas ligadas por CNPJ).
// Fora de 'use server' de propósito: re-export de tipo em action quebra o build.

export interface AcessoClinicaDoGrupo {
  id:        string
  name:      string
  cnpj:      string | null
  /** O usuário tem vínculo (user_clinics) com esta clínica. */
  vinculado: boolean
  /** É a clínica em que o administrador está agora. */
  atual:     boolean
  /** É a clínica ativa do usuário editado (profiles.clinic_id). */
  ativaDoUsuario: boolean
}
