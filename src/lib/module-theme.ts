export const MODULE_THEME = {
  reception:       { bg: 'bg-blue-50',     bgIntense: 'bg-blue-100',     active: 'bg-blue-600',    hover: 'hover:bg-blue-100 hover:text-blue-700' },
  patients:        { bg: 'bg-cyan-50',     bgIntense: 'bg-cyan-100',     active: 'bg-cyan-600',    hover: 'hover:bg-cyan-100 hover:text-cyan-700' },
  triage:          { bg: 'bg-amber-50',    bgIntense: 'bg-amber-100',    active: 'bg-amber-500',   hover: 'hover:bg-amber-100 hover:text-amber-700' },
  vet:             { bg: 'bg-indigo-50',   bgIntense: 'bg-indigo-100',   active: 'bg-indigo-600',  hover: 'hover:bg-indigo-100 hover:text-indigo-700' },
  exams:           { bg: 'bg-violet-50',   bgIntense: 'bg-violet-100',   active: 'bg-violet-600',  hover: 'hover:bg-violet-100 hover:text-violet-700' },
  hospitalization: { bg: 'bg-pink-50',     bgIntense: 'bg-pink-100',     active: 'bg-pink-600',    hover: 'hover:bg-pink-100 hover:text-pink-700' },
  surgery:         { bg: 'bg-red-50',      bgIntense: 'bg-red-100',      active: 'bg-red-600',     hover: 'hover:bg-red-100 hover:text-red-700' },
  grooming:        { bg: 'bg-rose-50',     bgIntense: 'bg-rose-100',     active: 'bg-rose-500',    hover: 'hover:bg-rose-100 hover:text-rose-700' },
  pharmacy:        { bg: 'bg-orange-50',   bgIntense: 'bg-orange-100',   active: 'bg-orange-600',  hover: 'hover:bg-orange-100 hover:text-orange-700' },
  sales:           { bg: 'bg-emerald-50',  bgIntense: 'bg-emerald-100',  active: 'bg-emerald-600', hover: 'hover:bg-emerald-100 hover:text-emerald-700' },
  cashier:         { bg: 'bg-green-50',    bgIntense: 'bg-green-100',    active: 'bg-green-600',   hover: 'hover:bg-green-100 hover:text-green-700' },
  registry:        { bg: 'bg-slate-100',   bgIntense: 'bg-slate-200',    active: 'bg-slate-600',   hover: 'hover:bg-slate-200 hover:text-slate-700' },
  management:      { bg: 'bg-slate-200',   bgIntense: 'bg-slate-300',    active: 'bg-slate-700',   hover: 'hover:bg-slate-300 hover:text-slate-800' },
  whatsapp:        { bg: 'bg-green-50',    bgIntense: 'bg-green-100',    active: 'bg-green-500',   hover: 'hover:bg-green-100 hover:text-green-600' },
  internal_chat:   { bg: 'bg-purple-50',  bgIntense: 'bg-purple-100',   active: 'bg-purple-600',  hover: 'hover:bg-purple-100 hover:text-purple-700' },
  purchases:       { bg: 'bg-purple-50',  bgIntense: 'bg-purple-100',   active: 'bg-purple-600',  hover: 'hover:bg-purple-100 hover:text-purple-700' },
  financial:       { bg: 'bg-teal-50',    bgIntense: 'bg-teal-100',     active: 'bg-teal-600',    hover: 'hover:bg-teal-100 hover:text-teal-700' },
  reports:         { bg: 'bg-violet-50',  bgIntense: 'bg-violet-100',   active: 'bg-violet-600',  hover: 'hover:bg-violet-100 hover:text-violet-700' },
} as const

export type ModuleKey = keyof typeof MODULE_THEME
export type ModuleTheme = (typeof MODULE_THEME)[ModuleKey]

const PATH_TO_MODULE: Record<string, ModuleKey> = {
  '/dashboard/reception':       'reception',
  '/dashboard/patients':        'patients',
  '/dashboard/triage':          'triage',
  '/dashboard/vet':             'vet',
  '/dashboard/exams':           'exams',
  '/dashboard/hospitalization': 'hospitalization',
  '/dashboard/surgery':         'surgery',
  '/dashboard/grooming':        'grooming',
  '/dashboard/pharmacy':        'pharmacy',
  '/dashboard/sales':           'sales',
  '/dashboard/cashier':         'cashier',
  '/dashboard/registry':        'registry',
  '/dashboard/management':      'management',
  '/dashboard/whatsapp':        'whatsapp',
  '/dashboard/internal-chat':  'internal_chat',
  '/dashboard/purchases':       'purchases',
  '/dashboard/financial':       'financial',
  '/dashboard/reports':         'reports',
}

export function getModuleFromPath(pathname: string): ModuleKey | null {
  for (const [prefix, key] of Object.entries(PATH_TO_MODULE)) {
    if (pathname.startsWith(prefix)) return key
  }
  return null
}

export function getTabTheme(href: string): { bg: string; active: string; hover: string } {
  const key = getModuleFromPath(href)
  return key ? MODULE_THEME[key] : { bg: 'bg-slate-50', active: 'bg-slate-900', hover: 'hover:text-slate-900' }
}
