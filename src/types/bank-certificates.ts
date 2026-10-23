// Tipos do certificado e-CNPJ A1 da integração bancária.
//
// Moram aqui, e não junto das actions, porque `src/lib/actions/bank-certificates.ts`
// é um módulo `'use server'`: exportar tipo de lá derruba as actions em produção
// com 500, sem erro de compilação. Ver [[feedback_use_server_type_reexports]].

export interface CertificadoInfo {
  bank_code:   string
  /** Empresa faturante dona do certificado. Nulo = certificado da clínica. */
  company_id:   string | null
  company_name: string | null
  file_name:   string | null
  subject_cn:  string | null
  cnpj:        string | null
  not_after:   string | null
  /** Dias até vencer; negativo = vencido. Null quando não informado. */
  dias:        number | null
  uploaded_at: string
}

export interface CertificadoAceito {
  ok: true
  subject_cn: string | null
  cnpj:       string | null
  not_after:  string | null
  /**
   * Avisos que não impedem guardar, mas que a tela precisa mostrar — o caso
   * típico é o CNPJ do certificado não bater com o da empresa escolhida.
   */
  avisos:     string[]
}
