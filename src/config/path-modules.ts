// Mapeamento /dashboard/<segmento> → module key técnica (clinics.active_modules).
// Compartilhado entre src/proxy.ts (edge) e src/app/dashboard/template.tsx
// (enforcement de plano via gatekeeper). Alguns segmentos diferem do moduleKey.

export const PATH_SEGMENT_TO_MODULE: Record<string, string> = {
  reception:       'reception',
  patients:        'patients',
  triage:          'triage',
  vet:             'consultation',
  exams:           'exams',
  hospitalization: 'hospitalization',
  surgery:         'surgery',
  grooming:        'grooming',
  pharmacy:        'pharmacy',
  sales:           'sales',
  cashier:         'cashier',
  registry:        'registry',
  whatsapp:        'whatsapp_intelligent',
  purchases:       'purchases',
  financial:       'financial',
  reports:         'reports',
  billing:         'billing',
  'internal-chat': 'internal_chat',
  appointments:    'reception',  // sub-tela de recepção
}

export function moduleKeyFromPath(pathname: string): string | null {
  const seg = pathname.split('/')[2]
  if (!seg) return null
  return PATH_SEGMENT_TO_MODULE[seg] ?? null
}
