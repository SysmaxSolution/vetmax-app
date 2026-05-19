/**
 * Catálogo de emojis e símbolos voltados para Veterinária e Estética Pet.
 * Usado no EmojiPicker dentro dos campos de texto livre do editor.
 *
 * Cada item tem `kw` (keywords PT-BR e EN para busca). Tudo unicode puro
 * — sem dependência de bibliotecas externas, funciona em qualquer browser
 * que renderize emoji nativo (todos modernos).
 */

export type EmojiCategoryId =
  | 'animais'
  | 'saude'
  | 'estetica'
  | 'simbolos'
  | 'documentos'
  | 'avisos'
  | 'fluxo'

export interface EmojiCategory {
  id: EmojiCategoryId
  label: string
  icon: string
}

export interface EmojiDef {
  emoji: string
  kw: string[]   // keywords lowercase pra busca
  cat: EmojiCategoryId
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: 'animais',    label: 'Animais',          icon: '🐶' },
  { id: 'saude',      label: 'Saúde Veterinária', icon: '🩺' },
  { id: 'estetica',   label: 'Estética Pet',     icon: '🛁' },
  { id: 'simbolos',   label: 'Símbolos médicos', icon: '⚕️' },
  { id: 'avisos',     label: 'Avisos / Status',  icon: '⚠️' },
  { id: 'documentos', label: 'Documentos',       icon: '📄' },
  { id: 'fluxo',      label: 'Setas / Itens',    icon: '→' },
]

export const VET_EMOJIS: EmojiDef[] = [
  // ── Animais ──────────────────────────────────────────────────────────────
  { emoji: '🐶', cat: 'animais', kw: ['cao', 'cachorro', 'dog', 'canino', 'puppy'] },
  { emoji: '🐕', cat: 'animais', kw: ['cao', 'dog', 'canino', 'caes'] },
  { emoji: '🦮', cat: 'animais', kw: ['cao guia', 'service dog'] },
  { emoji: '🐕‍🦺', cat: 'animais', kw: ['cao servico'] },
  { emoji: '🐩', cat: 'animais', kw: ['poodle', 'caniche'] },
  { emoji: '🐱', cat: 'animais', kw: ['gato', 'cat', 'felino'] },
  { emoji: '🐈', cat: 'animais', kw: ['gato', 'cat', 'felino'] },
  { emoji: '🐈‍⬛', cat: 'animais', kw: ['gato preto', 'black cat'] },
  { emoji: '🐰', cat: 'animais', kw: ['coelho', 'rabbit', 'bunny'] },
  { emoji: '🐇', cat: 'animais', kw: ['coelho', 'rabbit'] },
  { emoji: '🐹', cat: 'animais', kw: ['hamster', 'roedor'] },
  { emoji: '🐭', cat: 'animais', kw: ['rato', 'mouse', 'roedor'] },
  { emoji: '🐀', cat: 'animais', kw: ['rato', 'rat', 'roedor'] },
  { emoji: '🐦', cat: 'animais', kw: ['passaro', 'ave', 'bird'] },
  { emoji: '🦜', cat: 'animais', kw: ['papagaio', 'ave', 'parrot'] },
  { emoji: '🦅', cat: 'animais', kw: ['aguia', 'eagle', 'ave de rapina'] },
  { emoji: '🐢', cat: 'animais', kw: ['tartaruga', 'turtle', 'reptil', 'jabuti'] },
  { emoji: '🦎', cat: 'animais', kw: ['lagarto', 'iguana', 'reptil'] },
  { emoji: '🐍', cat: 'animais', kw: ['cobra', 'snake', 'serpente', 'reptil'] },
  { emoji: '🐠', cat: 'animais', kw: ['peixe', 'fish', 'aquario'] },
  { emoji: '🐟', cat: 'animais', kw: ['peixe', 'fish'] },
  { emoji: '🐴', cat: 'animais', kw: ['cavalo', 'horse', 'equino'] },
  { emoji: '🐮', cat: 'animais', kw: ['boi', 'vaca', 'cow', 'bovino'] },
  { emoji: '🐷', cat: 'animais', kw: ['porco', 'pig', 'suino'] },
  { emoji: '🐑', cat: 'animais', kw: ['ovelha', 'sheep', 'ovino'] },
  { emoji: '🐐', cat: 'animais', kw: ['cabra', 'bode', 'goat'] },
  { emoji: '🦔', cat: 'animais', kw: ['ouriço', 'hedgehog'] },
  { emoji: '🐿️', cat: 'animais', kw: ['esquilo', 'squirrel'] },

  // ── Saúde Veterinária ────────────────────────────────────────────────────
  { emoji: '🩺', cat: 'saude', kw: ['estetoscopio', 'exame', 'consulta'] },
  { emoji: '💊', cat: 'saude', kw: ['medicamento', 'remedio', 'comprimido', 'capsula'] },
  { emoji: '💉', cat: 'saude', kw: ['injecao', 'seringa', 'vacina', 'aplicacao'] },
  { emoji: '🧴', cat: 'saude', kw: ['solucao', 'frasco', 'liquido', 'gotas'] },
  { emoji: '🌡️', cat: 'saude', kw: ['termometro', 'temperatura', 'febre'] },
  { emoji: '🩹', cat: 'saude', kw: ['curativo', 'bandagem', 'ferimento'] },
  { emoji: '🩸', cat: 'saude', kw: ['sangue', 'hemograma', 'coleta'] },
  { emoji: '🔬', cat: 'saude', kw: ['microscopio', 'laboratorio', 'exame'] },
  { emoji: '⚗️', cat: 'saude', kw: ['manipulacao', 'formula', 'farmacia'] },
  { emoji: '🧪', cat: 'saude', kw: ['tubo de ensaio', 'exame', 'laboratorio'] },
  { emoji: '🧫', cat: 'saude', kw: ['placa de petri', 'cultura', 'microbiologia'] },
  { emoji: '🧬', cat: 'saude', kw: ['dna', 'genetica', 'cromossomo'] },
  { emoji: '🦠', cat: 'saude', kw: ['virus', 'bacteria', 'micro-organismo', 'patogeno'] },
  { emoji: '🏥', cat: 'saude', kw: ['hospital', 'clinica', 'pronto socorro'] },
  { emoji: '🚑', cat: 'saude', kw: ['ambulancia', 'emergencia'] },
  { emoji: '🦷', cat: 'saude', kw: ['dente', 'odontologia', 'periodontia'] },
  { emoji: '🦴', cat: 'saude', kw: ['osso', 'ortopedia', 'fratura', 'radiografia'] },
  { emoji: '🧠', cat: 'saude', kw: ['cerebro', 'neurologia'] },
  { emoji: '🫁', cat: 'saude', kw: ['pulmao', 'respiratorio', 'pneumologia'] },
  { emoji: '🫀', cat: 'saude', kw: ['coracao', 'cardiologia'] },
  { emoji: '👁️', cat: 'saude', kw: ['olho', 'oftalmologia'] },
  { emoji: '👂', cat: 'saude', kw: ['ouvido', 'otologia', 'otite'] },

  // ── Estética Pet ─────────────────────────────────────────────────────────
  { emoji: '🛁', cat: 'estetica', kw: ['banho', 'bath', 'banheira'] },
  { emoji: '🚿', cat: 'estetica', kw: ['ducha', 'chuveiro', 'shower', 'lavagem'] },
  { emoji: '✂️', cat: 'estetica', kw: ['tesoura', 'tosa', 'corte', 'scissors'] },
  { emoji: '🪮', cat: 'estetica', kw: ['pente', 'comb', 'desembaracar'] },
  { emoji: '🧴', cat: 'estetica', kw: ['shampoo', 'condicionador', 'frasco'] },
  { emoji: '🧼', cat: 'estetica', kw: ['sabao', 'sabonete', 'soap'] },
  { emoji: '🪥', cat: 'estetica', kw: ['escova', 'dental', 'higiene'] },
  { emoji: '💅', cat: 'estetica', kw: ['unha', 'manicure', 'corte de unha'] },
  { emoji: '🌸', cat: 'estetica', kw: ['flor', 'spa', 'aroma'] },
  { emoji: '💐', cat: 'estetica', kw: ['buque', 'spa', 'cuidado'] },
  { emoji: '🕯️', cat: 'estetica', kw: ['vela', 'aroma', 'spa'] },
  { emoji: '✨', cat: 'estetica', kw: ['brilho', 'limpo', 'novo', 'fresh'] },
  { emoji: '💆', cat: 'estetica', kw: ['massagem', 'relaxamento'] },
  { emoji: '🐾', cat: 'estetica', kw: ['patinhas', 'paw', 'pegadas'] },

  // ── Símbolos médicos ─────────────────────────────────────────────────────
  { emoji: '⚕️', cat: 'simbolos', kw: ['caduceu', 'medicina', 'saude'] },
  { emoji: '✚', cat: 'simbolos', kw: ['cruz', 'saude', 'hospital'] },
  { emoji: '➕', cat: 'simbolos', kw: ['mais', 'adicionar', 'plus'] },
  { emoji: '☤', cat: 'simbolos', kw: ['caduceu', 'medicina'] },
  { emoji: '❤️', cat: 'simbolos', kw: ['coracao', 'amor', 'saude'] },
  { emoji: '💙', cat: 'simbolos', kw: ['coracao azul', 'receituario azul', 'controlado'] },
  { emoji: '💚', cat: 'simbolos', kw: ['coracao verde', 'natural', 'saude'] },
  { emoji: '💛', cat: 'simbolos', kw: ['coracao amarelo', 'receituario amarelo'] },
  { emoji: '🟦', cat: 'simbolos', kw: ['azul', 'quadrado', 'tarja'] },
  { emoji: '🟨', cat: 'simbolos', kw: ['amarelo', 'quadrado', 'tarja'] },
  { emoji: '🟩', cat: 'simbolos', kw: ['verde', 'quadrado'] },
  { emoji: '🟥', cat: 'simbolos', kw: ['vermelho', 'quadrado', 'alerta'] },
  { emoji: '🔴', cat: 'simbolos', kw: ['vermelho', 'circulo', 'urgente'] },
  { emoji: '🟢', cat: 'simbolos', kw: ['verde', 'circulo', 'ok'] },
  { emoji: '🟡', cat: 'simbolos', kw: ['amarelo', 'circulo', 'atencao'] },
  { emoji: '🔵', cat: 'simbolos', kw: ['azul', 'circulo'] },
  { emoji: '⚫', cat: 'simbolos', kw: ['preto', 'circulo', 'bullet'] },
  { emoji: '⚪', cat: 'simbolos', kw: ['branco', 'circulo'] },

  // ── Avisos / Status ──────────────────────────────────────────────────────
  { emoji: '⚠️', cat: 'avisos', kw: ['atencao', 'alerta', 'warning'] },
  { emoji: '❗', cat: 'avisos', kw: ['exclamacao', 'importante', 'urgente'] },
  { emoji: '❌', cat: 'avisos', kw: ['x', 'errado', 'nao', 'cancelar'] },
  { emoji: '✅', cat: 'avisos', kw: ['check', 'ok', 'aprovado', 'sim'] },
  { emoji: '✔️', cat: 'avisos', kw: ['check', 'ok', 'feito'] },
  { emoji: '☑️', cat: 'avisos', kw: ['checkbox', 'marcado'] },
  { emoji: '⭐', cat: 'avisos', kw: ['estrela', 'destaque', 'controlado'] },
  { emoji: '★', cat: 'avisos', kw: ['estrela', 'destaque'] },
  { emoji: '☆', cat: 'avisos', kw: ['estrela vazia'] },
  { emoji: '🚫', cat: 'avisos', kw: ['proibido', 'nao', 'block'] },
  { emoji: '⛔', cat: 'avisos', kw: ['nao entre', 'proibido'] },
  { emoji: '🔒', cat: 'avisos', kw: ['cadeado', 'bloqueado', 'controlado'] },
  { emoji: '🔓', cat: 'avisos', kw: ['cadeado aberto', 'liberado'] },

  // ── Documentos ───────────────────────────────────────────────────────────
  { emoji: '📄', cat: 'documentos', kw: ['documento', 'pagina', 'folha'] },
  { emoji: '📋', cat: 'documentos', kw: ['prancheta', 'lista', 'checklist'] },
  { emoji: '📝', cat: 'documentos', kw: ['anotacao', 'nota', 'memo'] },
  { emoji: '✏️', cat: 'documentos', kw: ['lapis', 'editar', 'escrever'] },
  { emoji: '🖊️', cat: 'documentos', kw: ['caneta', 'assinar'] },
  { emoji: '📑', cat: 'documentos', kw: ['marcador', 'separador'] },
  { emoji: '📁', cat: 'documentos', kw: ['pasta', 'arquivo'] },
  { emoji: '📂', cat: 'documentos', kw: ['pasta aberta', 'arquivos'] },
  { emoji: '📅', cat: 'documentos', kw: ['calendario', 'data', 'agendamento'] },
  { emoji: '📆', cat: 'documentos', kw: ['calendario', 'data'] },
  { emoji: '🕐', cat: 'documentos', kw: ['relogio', 'hora', 'tempo'] },
  { emoji: '📞', cat: 'documentos', kw: ['telefone', 'contato', 'ligacao'] },
  { emoji: '✉️', cat: 'documentos', kw: ['envelope', 'email', 'mensagem'] },
  { emoji: '🏷️', cat: 'documentos', kw: ['etiqueta', 'tag', 'label'] },
  { emoji: '📌', cat: 'documentos', kw: ['alfinete', 'fixar', 'pin'] },
  { emoji: '🖨️', cat: 'documentos', kw: ['impressora', 'printer'] },
  { emoji: '🗂️', cat: 'documentos', kw: ['arquivo', 'pasta divisoria'] },

  // ── Setas / itens de lista ───────────────────────────────────────────────
  { emoji: '→', cat: 'fluxo', kw: ['seta direita', 'arrow', 'fluxo'] },
  { emoji: '←', cat: 'fluxo', kw: ['seta esquerda'] },
  { emoji: '↑', cat: 'fluxo', kw: ['seta cima'] },
  { emoji: '↓', cat: 'fluxo', kw: ['seta baixo'] },
  { emoji: '➜', cat: 'fluxo', kw: ['seta', 'fluxo'] },
  { emoji: '▶', cat: 'fluxo', kw: ['triangulo', 'play', 'lista'] },
  { emoji: '•', cat: 'fluxo', kw: ['bullet', 'lista', 'ponto'] },
  { emoji: '◦', cat: 'fluxo', kw: ['bullet vazio'] },
  { emoji: '–', cat: 'fluxo', kw: ['traco', 'hifen', 'dash'] },
  { emoji: '—', cat: 'fluxo', kw: ['em dash', 'traco longo'] },
  { emoji: '·', cat: 'fluxo', kw: ['ponto medio', 'middot', 'separador'] },
  { emoji: '§', cat: 'fluxo', kw: ['paragrafo', 'secao'] },
  { emoji: '¶', cat: 'fluxo', kw: ['paragrafo'] },
  { emoji: '°', cat: 'fluxo', kw: ['grau', 'temperatura'] },
  { emoji: '×', cat: 'fluxo', kw: ['multiplicacao', 'vezes', 'dose'] },
  { emoji: '÷', cat: 'fluxo', kw: ['divisao'] },
  { emoji: '±', cat: 'fluxo', kw: ['mais ou menos', 'tolerancia'] },
  { emoji: '≈', cat: 'fluxo', kw: ['aproximadamente'] },
  { emoji: '≤', cat: 'fluxo', kw: ['menor ou igual'] },
  { emoji: '≥', cat: 'fluxo', kw: ['maior ou igual'] },
]

export function emojisByCategory(cat: EmojiCategoryId): EmojiDef[] {
  return VET_EMOJIS.filter(e => e.cat === cat)
}

export function searchEmojis(query: string): EmojiDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return VET_EMOJIS.filter(e =>
    e.kw.some(k => k.includes(q)) || e.emoji === q
  )
}
