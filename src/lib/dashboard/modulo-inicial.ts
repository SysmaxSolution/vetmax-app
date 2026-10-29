// Escolha do módulo em que o usuário pousa ao abrir /dashboard — função pura.
//
// Regras (as mesmas do layout do dashboard, decisão de PO de 2026-05-22):
//  • admin e SysMax enxergam todos os módulos ativos da clínica. Linhas
//    enabled=false em user_module_access só mudam a PREFERÊNCIA de pouso do
//    admin (não abre um módulo que ele mesmo desmarcou), nunca o bloqueiam.
//  • demais papéis só pousam em módulo com enabled=true.
//  • nunca devolve um módulo que a clínica não tem ativo.
//  • null = nada liberado: a página mostra orientação em vez de redirecionar.
//
// Por que existe: até 29/10/2026 o pouso era um destino fixo por papel
// (admin → /dashboard/reception). Quando esse módulo estava bloqueado, o gate
// do proxy devolvia para o mesmo destino → ERR_TOO_MANY_REDIRECTS (Animais).

const PREFERENCIA_POR_PAPEL: Record<string, string[]> = {
  receptionist: ['reception', 'patients'],
  assistant:    ['triage', 'patients'],
  pharmacist:   ['pharmacy', 'sales'],
  vet:          ['consultation', 'patients'],
  admin:        ['reception', 'patients', 'financial'],
}

export interface AcessoDeModulo {
  module_name: string
  enabled: boolean | null
}

export interface EntradaModuloInicial {
  role: string | null | undefined
  isSysmax?: boolean
  /** clinics.active_modules */
  clinicModules: string[]
  /** linhas de user_module_access do usuário NA clínica ativa */
  acessos: AcessoDeModulo[]
}

export function escolherModuloInicial(e: EntradaModuloInicial): string | null {
  const ativos = e.clinicModules.filter(Boolean)
  if (ativos.length === 0) return null

  const liberados  = new Set(e.acessos.filter(a => a.enabled === true).map(a => a.module_name))
  const bloqueados = new Set(e.acessos.filter(a => a.enabled === false).map(a => a.module_name))
  const amplo = e.role === 'admin' || e.isSysmax === true

  const permitidos = amplo ? ativos : ativos.filter(m => liberados.has(m))
  if (permitidos.length === 0) return null

  const preferencia = PREFERENCIA_POR_PAPEL[e.role ?? ''] ?? PREFERENCIA_POR_PAPEL.admin
  const ordem = [...preferencia, ...permitidos]
  const escolhido = ordem.find(m => permitidos.includes(m) && !bloqueados.has(m))
  // Admin que desmarcou tudo para si mesmo ainda entra: o menu mostra tudo a ele.
  return escolhido ?? (amplo ? permitidos[0] : null)
}
