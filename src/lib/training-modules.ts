// Constantes dos módulos da Academia SYSVETMAX (sem 'use server' — uso em client e server).

export type TrainingModuleDef = { key: string; name: string; icon: string }

export const TRAINING_MODULES: TrainingModuleDef[] = [
  { key: 'recepcao',    name: 'Recepção',              icon: '🏠' },
  { key: 'triagem',     name: 'Triagem',               icon: '🩺' },
  { key: 'consultorio', name: 'Consultório',           icon: '🐕' },
  { key: 'exames',      name: 'Exames',                icon: '🧪' },
  { key: 'imagem',      name: 'Imagem',                icon: '📷' },
  { key: 'internacao',  name: 'Internação',            icon: '🛏️' },
  { key: 'cirurgia',    name: 'Centro Cirúrgico',      icon: '🔬' },
  { key: 'estoque',     name: 'Estoque / Farmácia',    icon: '📦' },
  { key: 'compras',     name: 'Compras',               icon: '🚚' },
  { key: 'caixa',       name: 'Caixa',                 icon: '💵' },
  { key: 'financeiro',  name: 'Financeiro',            icon: '💰' },
  { key: 'faturamento', name: 'Faturamento',           icon: '🧾' },
  { key: 'relatorios',  name: 'Relatórios (BI)',       icon: '📊' },
  { key: 'gestao',      name: 'Gestão',                icon: '⚙️' },
  { key: 'whatsapp',    name: 'WhatsApp Inteligente',  icon: '💬' },
  { key: 'transversal', name: 'Transversais',          icon: '⭐' },
]

export const TRAINING_MODULE_NAME: Record<string, string> =
  Object.fromEntries(TRAINING_MODULES.map(m => [m.key, m.name]))
export const TRAINING_MODULE_ICON: Record<string, string> =
  Object.fromEntries(TRAINING_MODULES.map(m => [m.key, m.icon]))

// Frases motivacionais (fim de vídeo e acerto de quiz).
export const TRAINING_CHEERS: string[] = [
  'Mandou bem! Cada aula te deixa mais no controle do sistema. 🚀',
  'Isso aí! Você está dominando o SYSVETMAX passo a passo. 💪',
  'Excelente! O conhecimento de hoje é a agilidade de amanhã. ⭐',
  'Boa! Quanto mais você treina, mais a clínica funciona sozinha. 🐾',
  'Perfeito! Você está transformando teoria em prática. 👏',
  'Show! Mais um passo rumo a virar especialista no sistema. 🏆',
]
export const TRAINING_QUIZ_CORRECT: string[] = [
  'Acertou! Você entendeu direitinho. ✅',
  'Isso mesmo! Conceito fixado. 🎯',
  'Correto! Pode aplicar isso no dia a dia com confiança. 💚',
  'Certíssimo! Seu aprendizado está sólido. 🌟',
]
export const TRAINING_QUIZ_WRONG =
  'Quase! Reveja esse trecho do vídeo e tente de novo — errar faz parte de aprender. 💡'
