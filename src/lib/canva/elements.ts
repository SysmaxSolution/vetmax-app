/**
 * Canvas Editor — modelo de elementos.
 *
 * Cada CanvasElement vive dentro do CanvasStage (folha A4/A5). Coordenadas
 * em PERCENTUAL da folha (0–100), nunca em pixels — assim o canvas é
 * resolução-independente e a impressão A4 fica perfeita em qualquer DPI.
 *
 * Print fidelity: editor e LaudoPrintable consomem a MESMA estrutura.
 */

export type ElementKind = 'text' | 'image' | 'line' | 'dynamic_tag' | 'composite_tag' | 'dynamic_image' | 'repeater' | 'brush_stroke' | 'fillable_field'

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

export type TextListStyle = 'none' | 'decimal' | 'bullet' | 'dash' | 'arrow' | 'check' | 'custom'

export interface TextElement extends ElementCommon {
  kind: 'text'
  content: string            // texto livre (suporta \n)
  typography: TypographyStyle
  /** Quando setado, cada linha não-vazia de content vira um tópico
   *  com prefixo automático (número, bullet, emoji etc.). */
  listStyle?: TextListStyle
  /** Caractere/emoji usado quando listStyle === 'custom' (ex: '🐾'). */
  listChar?: string
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

/** Parte de uma CompositeTagElement. Pode ser:
 *    - Uma resolução de tag dinâmica (tagId preenchido)
 *    - Um texto estático (staticText preenchido, tagId vazio)
 *  Permite mesclar text livre, dynamic_tag e composite_tag num único bloco.
 */
export interface CompositeTagPart {
  tagId: string         // vazio quando é parte estática
  /** Texto literal (usado quando tagId === ''). Suporta multilinhas. */
  staticText?: string
  /** Texto antes da resolução desse campo (ex: "Tutor: "). */
  prefix?: string
  /** Texto depois (ex: " kg"). */
  suffix?: string
}

/**
 * Composite Tag — mescla 2+ Dynamic Tags num único elemento.
 * Útil para gerar linhas como "Tutor: João Silva · CPF: 123.456.789-00".
 * Cada parte pode ter prefix/suffix próprios; entre partes vai o separator.
 */
export interface CompositeTagElement extends ElementCommon {
  kind: 'composite_tag'
  parts: CompositeTagPart[]
  /** Texto entre as partes (padrão " · "). */
  separator: string
  typography: TypographyStyle
  /** Mostrado quando TODAS as partes resolvem para vazio. */
  fallback?: string
  /** Se true, oculta partes vazias (em vez de manter o separator duplicado). */
  hideEmptyParts?: boolean
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
/** Uma linha visual dentro de cada item do Repeater. Permite layout
 *  multi-linha por medicamento (linha 1: nome+dose+tipo com leader dots,
 *  linha 2: posologia, linha 3: OBS, etc.). */
export interface RepeaterItemLine {
  /** Template da linha. {{field}} insere coluna do item.
   *  Token especial {{LEADER}} (apenas quando leaderDots=true): divide a
   *  linha em ANTES/DEPOIS e estica uma régua pontilhada no meio até o
   *  texto depois encostar à borda direita. Ex:
   *  "{{medication}} {{dose}}{{LEADER}}{{type}}" → "Gabapentina 150mg........Cáp" */
  template: string
  /** Tipografia opcional desta linha (sobrepõe a default do repeater). */
  style?: Partial<TypographyStyle>
  /** Quando true, processa o token {{LEADER}} expandindo pontilhado. */
  leaderDots?: boolean
  /** Esconde a linha quando todos os campos referenciados estão vazios.
   *  Útil para linha "OBS:" que só aparece se houver observações. */
  hideIfEmpty?: boolean
  /** Espaço extra (pt) abaixo desta linha — separa visualmente blocos
   *  (ex: 4pt depois da linha de OBS para separar do próximo item). */
  marginBottom?: number
}

export interface RepeaterElement extends ElementCommon {
  kind: 'repeater'
  /** Fonte da lista no banco. Ex: 'prescriptions', 'exam_items'. */
  source: RepeaterSource
  /** Template de cada linha — usa {{field}} para inserir colunas do item.
   *  LEGADO: se itemTemplateLines estiver setado, ele tem precedência. */
  itemTemplate: string       // ex: "{{medication}} — {{dose}} {{frequency}}"
  /** Layout multi-linha por item — substitui itemTemplate quando setado.
   *  Cada elemento do array vira uma linha visual dentro do item. */
  itemTemplateLines?: RepeaterItemLine[]
  groupAndEnumerate: boolean // prefixa "1.", "2.", "3."
  maxLines?: number          // corte; resto vai pra próxima página
  /** Máximo de itens por página. Quando setado e o número total de itens
   *  exceder, o LaudoPrintable gera páginas virtuais extras na hora de
   *  imprimir (página 2 = slice [N..2N-1] + elementos pinados, etc.). */
  maxItemsPerPage?: number
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
  /** Tipografia opcional da numeração ("1.", "2.", "3."). Falls back para
   *  typography com fontWeight=600. */
  enumerationTypography?: TypographyStyle

  /** Campo bool do item para destacar visualmente (ex: "is_controlled"). */
  highlightField?: string
  /** Cor de fundo aplicada na linha quando highlightField é true.
   *  Default: '#dbeafe' (Receituário Azul). */
  highlightColor?: string
  /** Rótulo prefixado nas linhas destacadas (ex: "[CONTROLADO]"). */
  highlightBadge?: string

  /** Filtro de itens da fonte. Ex.: Receita de Controle Especial mostra
   *  apenas {field:'is_controlled', equals:true}; Receituário simples usa
   *  negate:true para excluir controlados (Port. SVS/MS 344/98). */
  filter?: { field: string; equals: string | number | boolean; negate?: boolean }
}

export type RepeaterSource = 'prescriptions' | 'exam_items' | 'vaccines' | 'dynamic_fields'

/** Traço livre do pincel. points em % do canvas (0-100). Renderizado
 *  como SVG polyline com linecap round. Permanece editável (cor/espessura)
 *  após criado via PropertiesPanel. */
export interface BrushStrokeElement extends ElementCommon {
  kind: 'brush_stroke'
  points: Array<{ x: number; y: number }>
  strokeColor: string
  strokeWidth: number  // px no canvas (renderizado proporcionalmente)
  opacity?: number     // 0-1
}

export type FillableInputType = 'text' | 'date' | 'number' | 'textarea'

/**
 * Campo preenchível na consulta — o admin coloca no template (ex: "Data
 * para retirada dos pontos:"), e o vet preenche durante o atendimento.
 * Se required=true e não preenchido, o sistema bloqueia a geração do
 * laudo até o vet preencher.
 *
 * O VALOR final fica em patient_documents.content_json.fillable_fields[fieldKey].
 * O template tem apenas a definição do campo (label, placeholder, tipo).
 */
export interface FillableFieldElement extends ElementCommon {
  kind: 'fillable_field'
  /** Identificador único do campo dentro do template (snake_case).
   *  Ex: "data_retirada_pontos". */
  fieldKey: string
  /** Rótulo mostrado antes do valor preenchido. Ex: "Data: ". */
  label: string
  /** Placeholder mostrado no editor e quando vazio em runtime.
   *  Ex: "DD/MM/AAAA". */
  placeholder?: string
  /** Bloqueia geração do laudo se não preenchido. */
  required?: boolean
  /** Valor padrão pré-preenchido (admin sugere; vet pode trocar). */
  defaultValue?: string
  /** Tipo de input mostrado ao vet. */
  inputType?: FillableInputType
  typography: TypographyStyle
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | LineElement
  | DynamicTagElement
  | CompositeTagElement
  | DynamicImageElement
  | RepeaterElement
  | BrushStrokeElement
  | FillableFieldElement

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
  const { typography: overrideTypography, ...restOverrides } = overrides ?? {}
  return {
    id: nextElementId('text'),
    kind: 'text',
    box: { ...DEFAULT_BOX },
    content: 'Texto livre',
    zIndex: 1,
    ...restOverrides,
    // Mescla typography (não substitui) — útil em macros que setam só fontSize
    typography: { ...DEFAULT_TYPOGRAPHY, ...overrideTypography },
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

export function makeLineElement(
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  overrides?: Partial<LineElement>,
): LineElement {
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
    ...overrides,
  }
}

export function makeDynamicTagElement(tagId: string, overrides?: Partial<DynamicTagElement>): DynamicTagElement {
  return {
    id: nextElementId('dynamic_tag'),
    kind: 'dynamic_tag',
    box: { ...DEFAULT_BOX },
    tagId,
    typography: { ...DEFAULT_TYPOGRAPHY },
    zIndex: 1,
    ...overrides,
  }
}

export function makeCompositeTagElement(
  parts: CompositeTagPart[],
  overrides?: Partial<CompositeTagElement>,
): CompositeTagElement {
  return {
    id: nextElementId('composite_tag'),
    kind: 'composite_tag',
    box: { ...DEFAULT_BOX, w: 80 },
    parts,
    separator: ' · ',
    typography: { ...DEFAULT_TYPOGRAPHY },
    hideEmptyParts: true,
    zIndex: 1,
    ...overrides,
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

export function makeFillableFieldElement(
  fieldKey: string,
  label: string,
  overrides?: Partial<FillableFieldElement>,
): FillableFieldElement {
  return {
    id: nextElementId('fillable_field'),
    kind: 'fillable_field',
    box: { x: 10, y: 10, w: 60, h: 5 },
    fieldKey,
    label,
    placeholder: '____________________',
    required: false,
    inputType: 'text',
    typography: { ...DEFAULT_TYPOGRAPHY },
    zIndex: 1,
    ...overrides,
  }
}

export function makeBrushStrokeElement(
  points: Array<{ x: number; y: number }>,
  strokeColor: string,
  strokeWidth: number,
): BrushStrokeElement {
  return {
    id: nextElementId('brush_stroke'),
    kind: 'brush_stroke',
    box: { x: 0, y: 0, w: 100, h: 100 },  // cobre o canvas; clique seleciona via stroke
    points,
    strokeColor,
    strokeWidth,
    locked: true,  // não arrastável; só editável via PropertiesPanel ou delete
    zIndex: 2,     // por cima do papel timbrado, junto com elementos normais
  }
}

export function makeRepeaterElement(source: RepeaterSource, overrides?: Partial<RepeaterElement>): RepeaterElement {
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
      // Border real do bloco — aparece tanto no editor quanto no PDF/print.
      // Sem isso, a "caixa" violeta do canvas é apenas guide do editor e
      // some no PDF (confusão comum entre outline de seleção e border).
      block: {
        borderColor: '#0f172a',
        borderWidth: 1,
        borderRadius: 6,
        paddingX: 12,
        paddingY: 8,
      },
      ...overrides,
    }
  }
  return { ...base, ...overrides }
}
