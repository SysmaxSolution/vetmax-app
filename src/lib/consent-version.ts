// Versão única do Termo de Consentimento LGPD (fonte da verdade).
// Importada tanto pelo ConsentModal (client) quanto por recordConsent (server)
// para evitar drift entre o texto exibido e a versão registrada em consent_history.
//
// Histórico:
//   1.0 — termo inicial (dados, finalidade, retenção, direitos, compartilhamento).
//   1.1 — cláusula de Registro por Voz e Inteligência Artificial (Frente 1 / council
//         2026-06-24): cobre a captação da voz do tutor e o processamento por IA
//         para preenchimento do prontuário.
export const CONSENT_VERSION = '1.1'

// Consentimento desatualizado: tutor nunca consentiu, ou consentiu numa versão
// anterior do termo (ex.: aceitou 1.0 antes da cláusula de voz/IA). Usado para
// exigir re-consentimento na próxima visita (recepção) e para avisar o MV no
// Consultório quando a gravação por voz não está coberta pelo termo vigente.
export function isConsentStale(
  consentGiven: boolean | null | undefined,
  consentVersion: string | null | undefined,
): boolean {
  return !consentGiven || consentVersion !== CONSENT_VERSION
}
