/**
 * Canvas Editor — modelo de elementos.
 *
 * Cada CanvasElement vive dentro do CanvasStage (folha A4/A5). Coordenadas
 * em PERCENTUAL da folha (0–100), nunca em pixels — assim o canvas é
 * resolução-independente e a impressão A4 fica perfeita em qualquer DPI.
 *
 * Print fidelity: editor e LaudoPrintable consomem a MESMA estrutura.
 */

export type ElementKind = 'text' | 'image' | 'line' | 'dynamic_tag' | 'dynamic_image' | 'repeater'

/** Posição/tamanho em % do canvas (0-100). 0/0 = canto superior esquerdo. */
export interface ElementBox {
  x: number      // % da largura
  y: number      // % da altura
  w: number      // % da largura
  h: number      // % da altura
}

export type ElementAlign = 'left' | 'center' | 'right' | 'justify'
export type ElementVAlign = 'top' | 'middle' | 'bottom'
export type ElementPin = 'none' | 'header' | 'footer' | 'all_pages'

/** Propriedades de bloco (preenchimento + borda) — comum a vários kinds. */
export interface BlockStyle {
  backgroundColor?: string   // hex/rgba — undefined = transparente
  borderColor?: string       // hex/rgba
  borderWidth?: number       // px
  borderRadius?: number      // px
  paddingX?: number          // px
  paddingY?: number          // px
}

/** Tipografia — comum a text, dynamic_tag, repeater. */
export interface TypographyStyle {
  fontFamily?: string        // 'Inter' | 'Times New Roman' | 'Courier New' | etc.
  fontSize?: number          // pt (impressão) / mapeado p/ px no preview
  fontWeight?: 400 | 600 | 700
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  color?: string
  align?: ElementAlign
  vAlign?: ElementVAlign
  lineHeight?: number        // multiplicador (1.2, 1.4, etc.)
  letterSpacing?: number     // px
}

interface ElementCommon {
  id: string
  kind: ElementKind
  box: ElementBox
  rotation?: number          // graus (0-360)
  zIndex?: number            // ordem de empilhamento
  pin?: ElementPin           // posiciona em todas as páginas / cabeçalho / rodapé
  locked?: boolean           // bloqueia movimento/resize
  block?: BlockStyle
}

// ── Element variants ─────────────────────────────────────────────────────────

export interface TextElement extends ElementCommon {
  kind: 'text'
  content: string            // texto livre (suporta \n)
  typography: TypographyStyle
}

export interface ImageElement extends ElementCommon {
  kind: 'image'
  url: string                // signed URL no bucket
  alt?: string
  objectFit?: 'cover' | 'contain' | 'fill' | 'none'
  storagePath?: string       // caminho no bucket (para revoke/replace)
}

export interface LineElement extends ElementCommon {
  kind: 'line'
  orientation: 'horizontal' | 'vertical'
  thickness: number          // px
  color: string
  dashed?: boolean
}

export interface DynamicTagElement extends ElementCommon {
  kind: 'dynamic_tag'
  tagId: string              // chave do catálogo DYNAMIC_TAGS
  prefix?: string            // ex: "Tutor: "
  suffix?: string            // ex: " kg"
  typography: TypographyStyle
  /** Fallback quando o valor resolvido for vazio/nulo. */
  fallback?: string
}

/**
 * Imagem vinda do banco (logo da clínica, foto do MV, assinatura eletrônica).
 * Diferente de ImageElement (URL fixa), DynamicImageElement resolve a URL
 * em tempo de impressão a partir do tagId (catálogo DYNAMIC_IMAGE_TAGS).
 */
export interface DynamicImageElement extends ElementCommon {
  kind: 'dynamic_image'
  tagId: string              // chave do catálogo DYNAMIC_IMAGE_TAGS
  alt?: string
  objectFit?: 'cover' | 'contain' | 'fill' | 'none'
  /** Mostrado quando a URL não resolve (clínica sem logo, vet sem assinatura). */
  fallbackText?: string
}

/** Repeater — agrupamento dinâmico (medicações, exames, etc.).
 *  Renderiza source array linha-a-linha respeitando container.
 */
export interface RepeaterElement extends ElementCommon {
  kind: 'repeater'
  /** Fonte da lista no banco. Ex: 'prescriptions', 'exam_items'. */
  source: RepeaterSource
  /** Template de cada linha — usa {{field}} para inserir colunas do item. */
  itemTemplate: string       // ex: "{{medication}} — {{dose}} {{frequency}}"
  groupAndEnumerate: boolean // prefixa "1.", "2.", "3."
  maxLines?: number          // corte; resto vai pra próxima página
  lineSpacing?: number       // pt entre linhas
  typography: TypographyStyle

  /** Campo do item para agrupar (ex: "route_of_administration",
   *  "prescription_type"). Itens com mesmo valor caem sob um header. */
  groupBy?: string
  /** Template do cabeçalho de grupo. {{group}} = valor agrupador.
   *  Default: "{{group}}". */
  groupHeaderTemplate?: string
  /** Tipografia opcional do cabeçalho de grupo. Falls back para typography. */
  groupHeaderTypography?: TypographyStyle

  /** Campo bool do item para destacar visualmente (ex: "is_controlled"). */
  highlightField?: string
  /** Cor de fundo aplicada na linha quando highlightField é true.
   *  Default: '#dbeafe' (Receituário Azul). */
  highlightColor?: string
  /** Rótulo prefixado nas linhas destacadas (ex: "[CONTROLADO]"). */
  highlightBadge?: string
}

export type RepeaterSource = 'prescriptions' | 'exam_items' | 'vaccines' | 'dynamic_fields'

export type CanvasElement =
  | TextElement
  | ImageElement
  | LineElement
  | DynamicTagElement
  | DynamicImageElement
  | RepeaterElement

// ── Factory helpers ──────────────────────────────────────────────────────────

let _idSeq = 0
export function nextElementId(kind: ElementKind): string {
  _idSeq += 1
  return `el_${kind}_${Date.now().toString(36)}_${_idSeq}`
}

export const DEFAULT_BOX: ElementBox = { x: 10, y: 10, w: 40, h: 8 }

export const DEFAULT_TYPOGRAPHY: TypographyStyle = {
  fontFamily: 'Inter',
  fontSize: 11,
  fontWeight: 400,
  color: '#0f172a',
  align: 'left',
  vAlign: 'top',
  lineHeight: 1.35,
}

export function makeTextElement(overrides?: Partial<TextElement>): TextElement {
  return {
    id: nextElementId('text'),
    kind: 'text',
    box: { ...DEFAULT_BOX },
    typography: { ...DEFAULT_TYPOGRAPHY },
    content: 'Texto livre',
    zIndex: 1,
    ...overrides,
  }
}

export function makeImageElement(overrides?: Partial<ImageElement>): ImageElement {
  return {
    id: nextElementId('image'),
    kind: 'image',
    box: { x: 10, y: 5, w: 25, h: 10 },
    url: '',
    objectFit: 'contain',
    zIndex: 1,
    ...overrides,
  }
}

export function makeLineElement(orientation: 'horizontal' | 'vertical' = 'horizontal'): LineElement {
  return {
    id: nextElementId('line'),
    kind: 'line',
    box: orientation === 'horizontal'
      ? { x: 10, y: 30, w: 80, h: 0.3 }
      : { x: 30, y: 10, w: 0.3, h: 60 },
    orientation,
    thickness: 1,
    color: '#0f172a',
    zIndex: 1,
  }
}

export function makeDynamicTagElement(tagId: string): DynamicTagElement {
  return {
    id: nextElementId('dynamic_tag'),
    kind: 'dynamic_tag',
    box: { ...DEFAULT_BOX },
    tagId,
    typography: { ...DEFAULT_TYPOGRAPHY },
    zIndex: 1,
  }
}

export function makeDynamicImageElement(tagId: string): DynamicImageElement {
  return {
    id: nextElementId('dynamic_image'),
    kind: 'dynamic_image',
    box: { x: 5, y: 3, w: 18, h: 8 },  // logo no canto sup. esq. por default
    tagId,
    objectFit: 'contain',
    zIndex: 1,
  }
}

export function makeRepeaterElement(source: RepeaterSource): RepeaterElement {
  const base: RepeaterElement = {
    id: nextElementId('repeater'),
    kind: 'repeater',
    box: { x: 10, y: 40, w: 80, h: 25 },
    source,
    itemTemplate: '{{name}}',
    groupAndEnumerate: true,
    lineSpacing: 4,
    typography: { ...DEFAULT_TYPOGRAPHY, fontSize: 10 },
    zIndex: 1,
  }
  // Defaults clínicos por source
  if (source === 'prescriptions') {
    return {
      ...base,
      itemTemplate: '{{medication}} — {{dose}} · {{frequency}} · {{duration_days}} dias',
      groupBy: 'route_of_administration',
      groupHeaderTemplate: 'Uso {{group}}',
      groupHeaderTypography: { ...DEFAULT_TYPOGRAPHY, fontSize: 10, fontWeight: 700 },
      highlightField: 'is_controlled',
      highlightColor: '#dbeafe',  // azul claro — Receituário Azul
      highlightBadge: '★ CONTROLADO',
    }
  }
  return base
}
