'use client'

/**
 * PropertiesPanel — painel direito contextual. Mostra controles do
 * elemento selecionado: posição/tamanho, rotação, z-index, pin (header/
 * footer/all_pages), tipografia (text|dynamic_tag|repeater), bloco
 * (background + border + radius + padding), e parâmetros específicos
 * de Repeater (source, itemTemplate, groupAndEnumerate, maxLines).
 */

import { useRef } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, AlignJustify,
  ArrowDownToLine, ArrowUpFromLine, ChevronsDown, ChevronsUp,
  Lock, Trash2, Bold, Italic, Underline,
  ArrowDown, ArrowUp, ArrowLeftRight,
} from 'lucide-react'
import type {
  CanvasElement, TextElement, ImageElement, LineElement,
  DynamicTagElement, CompositeTagElement,
  DynamicImageElement, RepeaterElement, RepeaterItemLine, BrushStrokeElement,
  FillableFieldElement, FillableInputType, ElementPin,
  TypographyStyle,
} from '@/lib/canva/elements'
import { findImageTag, findTag } from '@/lib/canva/dynamic-tags'
import { wrapTextareaSelection } from '@/lib/canva/text-format'
import type { TextListStyle } from '@/lib/canva/elements'
import EmojiPicker from './EmojiPicker'
import { Strikethrough } from 'lucide-react'

interface Props {
  element: CanvasElement | null
  onPatch: (patch: Partial<CanvasElement>) => void
  onDelete: () => void
  onMoveZ: (dir: 'front' | 'back' | 'forward' | 'backward') => void
}

export default function PropertiesPanel({ element, onPatch, onDelete, onMoveZ }: Props) {
  if (!element) {
    return (
      <aside className="min-w-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">
        <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-500">
          Selecione um elemento no canvas para editar suas propriedades.
          <span className="mt-2 block text-[10px] text-slate-400">
            Dica: com nada selecionado, o botão Pintar aplica cor na folha inteira.
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="min-w-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">
      <header className="mb-2 flex items-center justify-between sticky top-0 -mt-3 -mx-3 px-3 py-2 bg-slate-50 z-10 border-b border-slate-200">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 truncate">
            {kindLabel(element.kind)}
          </h3>
          <p className="text-[10px] text-slate-500 truncate">id: {element.id.slice(-8)}</p>
        </div>
        <button
          onClick={onDelete}
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
          title="Excluir elemento"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </header>

      <BoxSection element={element} onPatch={onPatch} />
      <TransformSection element={element} onPatch={onPatch} onMoveZ={onMoveZ} />
      <PinSection element={element} onPatch={onPatch} />

      {element.kind === 'text' && <TextSection element={element} onPatch={onPatch} />}
      {element.kind === 'dynamic_tag' && <DynamicTagSection element={element} onPatch={onPatch} />}
      {element.kind === 'composite_tag' && <CompositeTagSection element={element} onPatch={onPatch} />}
      {element.kind === 'dynamic_image' && <DynamicImageSection element={element} onPatch={onPatch} />}
      {element.kind === 'repeater' && <RepeaterSection element={element} onPatch={onPatch} />}
      {element.kind === 'image' && <ImageSection element={element} onPatch={onPatch} />}
      {element.kind === 'line' && <LineSection element={element} onPatch={onPatch} />}
      {element.kind === 'brush_stroke' && <BrushStrokeSection element={element} onPatch={onPatch} />}
      {element.kind === 'fillable_field' && <FillableFieldSection element={element} onPatch={onPatch} />}

      {element.kind !== 'line' && element.kind !== 'image'
        && element.kind !== 'dynamic_image' && element.kind !== 'brush_stroke' && (
        <BlockSection element={element} onPatch={onPatch} />
      )}
    </aside>
  )
}

// ── Section: Fillable Field (preenchido na consulta) ─────────────────────────

function FillableFieldSection({
  element, onPatch,
}: { element: FillableFieldElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Campo Preenchível">
      <p className="text-[11px] text-slate-600 leading-snug mb-2">
        O <strong>veterinário</strong> preenche este campo durante a consulta.
        Se marcado como obrigatório e não preenchido, o sistema bloqueia a
        geração do laudo.
      </p>

      <label className="block">
        <span className="text-[10px] text-slate-600">Identificador do campo (snake_case)</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
          value={element.fieldKey}
          placeholder="ex: data_retirada_pontos"
          onChange={e => onPatch({
            fieldKey: e.target.value.toLowerCase().replace(/[^\w]/g, '_'),
          } as Partial<CanvasElement>)}
        />
        <span className="text-[10px] text-slate-400">
          Único dentro do template. Não muda se já tem laudos preenchidos.
        </span>
      </label>

      <label className="block mt-2">
        <span className="text-[10px] text-slate-600">Rótulo (antes do valor)</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.label}
          placeholder='ex: "Data para retirada dos pontos: "'
          onChange={e => onPatch({ label: e.target.value } as Partial<CanvasElement>)}
        />
      </label>

      <label className="block mt-2">
        <span className="text-[10px] text-slate-600">Placeholder (quando vazio)</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.placeholder ?? ''}
          placeholder="ex: DD/MM/AAAA"
          onChange={e => onPatch({ placeholder: e.target.value } as Partial<CanvasElement>)}
        />
      </label>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="block">
          <span className="text-[10px] text-slate-600">Tipo de entrada</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.inputType ?? 'text'}
            onChange={e => onPatch({ inputType: e.target.value as FillableInputType } as Partial<CanvasElement>)}
          >
            <option value="text">Texto curto</option>
            <option value="textarea">Texto longo</option>
            <option value="date">Data</option>
            <option value="number">Número</option>
          </select>
        </label>
        <label className="flex items-end gap-1.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={!!element.required}
            onChange={e => onPatch({ required: e.target.checked } as Partial<CanvasElement>)}
          />
          <span>Obrigatório <span className="text-red-500">*</span></span>
        </label>
      </div>

      <label className="block mt-2">
        <span className="text-[10px] text-slate-600">Valor padrão (opcional)</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.defaultValue ?? ''}
          placeholder="ex: 10 dias"
          onChange={e => onPatch({ defaultValue: e.target.value } as Partial<CanvasElement>)}
        />
      </label>

      <TypographyControls element={element as unknown as TextElement} onPatch={onPatch} />
    </Section>
  )
}

// ── Section: Composite Tag (mescla de tags) ──────────────────────────────────

function CompositeTagSection({
  element, onPatch,
}: { element: CompositeTagElement; onPatch: Props['onPatch'] }) {
  function updatePart(idx: number, patch: Partial<{ prefix: string; suffix: string }>) {
    const next = element.parts.map((p, i) => i === idx ? { ...p, ...patch } : p)
    onPatch({ parts: next } as Partial<CanvasElement>)
  }
  function movePart(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= element.parts.length) return
    const next = [...element.parts]
    const [removed] = next.splice(idx, 1)
    next.splice(target, 0, removed)
    onPatch({ parts: next } as Partial<CanvasElement>)
  }
  function removePart(idx: number) {
    if (element.parts.length <= 1) return
    onPatch({ parts: element.parts.filter((_, i) => i !== idx) } as Partial<CanvasElement>)
  }

  return (
    <Section title="Tags Mescladas">
      <p className="text-[11px] text-slate-500 mb-2">
        {element.parts.length} partes · separador <code className="font-mono text-[10px]">{JSON.stringify(element.separator)}</code>
      </p>

      <ol className="space-y-2">
        {element.parts.map((p, i) => {
          const def = findTag(p.tagId)
          return (
            <li key={i} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-violet-700">
                  {i + 1}. {def?.label ?? p.tagId}
                </span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => movePart(i, -1)} disabled={i === 0}
                    title="Mover para cima"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                  >↑</button>
                  <button
                    onClick={() => movePart(i, +1)} disabled={i === element.parts.length - 1}
                    title="Mover para baixo"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                  >↓</button>
                  <button
                    onClick={() => removePart(i)} disabled={element.parts.length <= 1}
                    title="Remover esta parte"
                    className="rounded p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                  >×</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <span className="text-[10px] text-slate-600">Antes</span>
                  <input
                    className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    value={p.prefix ?? ''}
                    placeholder='ex: "Tutor: "'
                    onChange={e => updatePart(i, { prefix: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-slate-600">Depois</span>
                  <input
                    className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    value={p.suffix ?? ''}
                    placeholder='ex: " kg"'
                    onChange={e => updatePart(i, { suffix: e.target.value })}
                  />
                </label>
              </div>
            </li>
          )
        })}
      </ol>

      <label className="block mt-3">
        <span className="text-[10px] text-slate-600">Separador entre as partes</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
          value={element.separator}
          placeholder=" · "
          onChange={e => onPatch({ separator: e.target.value } as Partial<CanvasElement>)}
        />
      </label>

      <label className="block mt-2">
        <span className="text-[10px] text-slate-600">Texto se tudo vazio</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.fallback ?? ''}
          placeholder='ex: "Não informado"'
          onChange={e => onPatch({ fallback: e.target.value } as Partial<CanvasElement>)}
        />
      </label>

      <label className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-700">
        <input
          type="checkbox"
          checked={!!element.hideEmptyParts}
          onChange={e => onPatch({ hideEmptyParts: e.target.checked } as Partial<CanvasElement>)}
        />
        Ocultar partes vazias na impressão
      </label>

      <TypographyControls element={element} onPatch={onPatch} />
    </Section>
  )
}

// ── Section: Brush Stroke ────────────────────────────────────────────────────

function BrushStrokeSection({
  element, onPatch,
}: { element: BrushStrokeElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Pincel">
      <p className="text-[11px] text-slate-500 mb-2">
        {element.points.length} pontos · livre
      </p>
      <ColorField
        label="Cor"
        value={element.strokeColor}
        onChange={v => onPatch({ strokeColor: v } as Partial<CanvasElement>)}
      />
      <div className="mt-2">
        <label className="block">
          <span className="flex items-center justify-between text-[10px] text-slate-600">
            <span>Espessura</span>
            <span className="tabular-nums font-semibold text-slate-700">{element.strokeWidth}px</span>
          </span>
          <input
            type="range" min={1} max={40} step={1}
            value={element.strokeWidth}
            onChange={e => onPatch({ strokeWidth: parseInt(e.target.value, 10) } as Partial<CanvasElement>)}
            className="canva-slider w-full"
          />
        </label>
      </div>
      <div className="mt-2">
        <label className="block">
          <span className="flex items-center justify-between text-[10px] text-slate-600">
            <span>Opacidade</span>
            <span className="tabular-nums font-semibold text-slate-700">{Math.round((element.opacity ?? 1) * 100)}%</span>
          </span>
          <input
            type="range" min={0.1} max={1} step={0.05}
            value={element.opacity ?? 1}
            onChange={e => onPatch({ opacity: parseFloat(e.target.value) } as Partial<CanvasElement>)}
            className="canva-slider w-full"
          />
        </label>
      </div>
    </Section>
  )
}

// ── Section: Box (posição & tamanho %) ───────────────────────────────────────

function BoxSection({ element, onPatch }: { element: CanvasElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Posição e Tamanho">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X (%)" value={element.box.x} step={0.5}
          onChange={v => onPatch({ box: { ...element.box, x: v } } as Partial<CanvasElement>)} />
        <NumField label="Y (%)" value={element.box.y} step={0.5}
          onChange={v => onPatch({ box: { ...element.box, y: v } } as Partial<CanvasElement>)} />
        <NumField label="Largura (%)" value={element.box.w} step={0.5}
          onChange={v => onPatch({ box: { ...element.box, w: v } } as Partial<CanvasElement>)} />
        <NumField label="Altura (%)" value={element.box.h} step={0.5}
          onChange={v => onPatch({ box: { ...element.box, h: v } } as Partial<CanvasElement>)} />
      </div>
    </Section>
  )
}

// ── Section: Transform (rotation + z-index + lock) ───────────────────────────

function TransformSection({
  element, onPatch, onMoveZ,
}: { element: CanvasElement; onPatch: Props['onPatch']; onMoveZ: Props['onMoveZ'] }) {
  return (
    <Section title="Transformação">
      <NumField label="Rotação (°)" value={element.rotation ?? 0} step={5}
        onChange={v => onPatch({ rotation: v } as Partial<CanvasElement>)} />
      <div className="grid grid-cols-4 gap-1 mt-2">
        <IconBtn title="Atrás de tudo"     onClick={() => onMoveZ('back')}     icon={<ChevronsDown className="w-3.5 h-3.5" />} />
        <IconBtn title="Trás"               onClick={() => onMoveZ('backward')} icon={<ArrowDown className="w-3.5 h-3.5" />} />
        <IconBtn title="Frente"             onClick={() => onMoveZ('forward')}  icon={<ArrowUp className="w-3.5 h-3.5" />} />
        <IconBtn title="Frente de tudo"     onClick={() => onMoveZ('front')}    icon={<ChevronsUp className="w-3.5 h-3.5" />} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-slate-600">z-index: {element.zIndex ?? 1}</span>
        <label className="flex items-center gap-1 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={!!element.locked}
            onChange={e => onPatch({ locked: e.target.checked } as Partial<CanvasElement>)}
          />
          <Lock className="w-3 h-3" /> Bloquear
        </label>
      </div>
    </Section>
  )
}

// ── Section: Pin (header/footer/all_pages) ───────────────────────────────────

function PinSection({ element, onPatch }: { element: CanvasElement; onPatch: Props['onPatch'] }) {
  const opts: Array<{ value: ElementPin; label: string; hint: string }> = [
    { value: 'none',       label: 'Livre',           hint: 'Aparece só na página 1' },
    { value: 'header',     label: 'Cabeçalho',       hint: 'Repete no topo de todas as páginas' },
    { value: 'footer',     label: 'Rodapé',          hint: 'Repete no fim de todas as páginas' },
    { value: 'all_pages',  label: 'Todas as páginas', hint: 'Posição livre, em todas as páginas' },
  ]
  return (
    <Section title="Repetição em páginas">
      <select
        value={element.pin ?? 'none'}
        onChange={e => onPatch({ pin: e.target.value as ElementPin } as Partial<CanvasElement>)}
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
      >
        {opts.map(o => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
      </select>
    </Section>
  )
}

// ── Section: Text ────────────────────────────────────────────────────────────

function TextSection({ element, onPatch }: { element: TextElement; onPatch: Props['onPatch'] }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /** Aplica markdown inline (B/I/U/S) na seleção atual do textarea. */
  function applyInline(prefix: string, suffix: string) {
    const ta = textareaRef.current
    if (!ta) return
    const next = wrapTextareaSelection(ta, prefix, suffix)
    onPatch({ content: next.value } as Partial<CanvasElement>)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(next.selectionStart, next.selectionEnd)
    })
  }

  return (
    <Section title="Texto">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-600">Conteúdo</span>
          <EmojiPicker
            onPick={emoji => {
              const ta = textareaRef.current
              const value = element.content
              if (!ta) {
                onPatch({ content: value + emoji } as Partial<CanvasElement>)
                return
              }
              const start = ta.selectionStart ?? value.length
              const end = ta.selectionEnd ?? value.length
              const next = value.slice(0, start) + emoji + value.slice(end)
              onPatch({ content: next } as Partial<CanvasElement>)
              requestAnimationFrame(() => {
                ta.focus()
                const pos = start + emoji.length
                ta.setSelectionRange(pos, pos)
              })
            }}
          />
        </div>

        {/* Toolbar de formatação inline parcial (markdown leve) */}
        <div className="flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
          <span className="text-[9px] uppercase tracking-wider text-slate-500 mr-1">Selecione e:</span>
          <ToggleBtn active={false} title="Negrito ao redor da seleção (**texto**)"
            onClick={() => applyInline('**', '**')}
            icon={<Bold className="w-3.5 h-3.5" />} />
          <ToggleBtn active={false} title="Itálico (*texto*)"
            onClick={() => applyInline('*', '*')}
            icon={<Italic className="w-3.5 h-3.5" />} />
          <ToggleBtn active={false} title="Sublinhado (__texto__)"
            onClick={() => applyInline('__', '__')}
            icon={<Underline className="w-3.5 h-3.5" />} />
          <ToggleBtn active={false} title="Tachado (~~texto~~)"
            onClick={() => applyInline('~~', '~~')}
            icon={<Strikethrough className="w-3.5 h-3.5" />} />
        </div>

        <textarea
          ref={textareaRef}
          className="w-full resize-y rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-900 focus:outline-none"
          rows={4}
          value={element.content}
          onChange={e => onPatch({ content: e.target.value } as Partial<CanvasElement>)}
        />

        <p className="text-[9px] text-slate-400 leading-snug">
          Sintaxe: <code>**negrito**</code> · <code>*itálico*</code> ·{' '}
          <code>__sublinhado__</code> · <code>~~tachado~~</code>
        </p>
      </div>

      <TextListControls element={element} onPatch={onPatch} />
      <TypographyControls element={element} onPatch={onPatch} />
    </Section>
  )
}

/** Controles de lista (enumera tópicos por linha). */
function TextListControls({
  element, onPatch,
}: { element: TextElement; onPatch: Props['onPatch'] }) {
  const current = element.listStyle ?? 'none'
  const styles: Array<{ id: TextListStyle; label: string; preview: string }> = [
    { id: 'none',    label: 'Sem lista',   preview: '—' },
    { id: 'decimal', label: 'Numerado',    preview: '1.' },
    { id: 'bullet',  label: 'Bullet',      preview: '•' },
    { id: 'dash',    label: 'Traço',       preview: '–' },
    { id: 'arrow',   label: 'Seta',        preview: '→' },
    { id: 'check',   label: 'Check',       preview: '✓' },
    { id: 'custom',  label: 'Custom',      preview: element.listChar?.trim() || '🐾' },
  ]
  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700">
        Lista de Tópicos
        {current !== 'none' && (
          <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
            {styles.find(s => s.id === current)?.preview}
          </span>
        )}
      </summary>
      <div className="px-3 pb-3 pt-2 space-y-2">
        <p className="text-[10px] text-slate-500">
          Cada linha do texto vira um tópico com prefixo automático.
        </p>
        <div className="grid grid-cols-4 gap-1">
          {styles.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPatch({ listStyle: s.id } as Partial<CanvasElement>)}
              title={s.label}
              className={`flex flex-col items-center justify-center rounded border px-1 py-1.5 transition ${
                current === s.id
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              <span className="text-base leading-none">{s.preview}</span>
              <span className="text-[9px] mt-0.5">{s.label}</span>
            </button>
          ))}
        </div>
        {current === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              value={element.listChar ?? ''}
              placeholder="🐾"
              maxLength={4}
              onChange={e => onPatch({ listChar: e.target.value } as Partial<CanvasElement>)}
            />
            <EmojiPicker
              onPick={emoji => onPatch({ listChar: emoji } as Partial<CanvasElement>)}
              align="right"
            />
          </div>
        )}
      </div>
    </details>
  )
}

// ── Section: Dynamic Tag ─────────────────────────────────────────────────────

function DynamicTagSection({ element, onPatch }: { element: DynamicTagElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Tag Dinâmica">
      <p className="text-[11px] text-slate-500">Identificador: <code className="text-violet-700">{element.tagId}</code></p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600">Prefixo</span>
            <EmojiPicker onPick={emoji => onPatch({ prefix: (element.prefix ?? '') + emoji } as Partial<CanvasElement>)} />
          </div>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.prefix ?? ''}
            placeholder='ex: "Tutor: "'
            onChange={e => onPatch({ prefix: e.target.value } as Partial<CanvasElement>)}
          />
        </label>
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600">Sufixo</span>
            <EmojiPicker onPick={emoji => onPatch({ suffix: (element.suffix ?? '') + emoji } as Partial<CanvasElement>)} />
          </div>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.suffix ?? ''}
            placeholder='ex: " kg"'
            onChange={e => onPatch({ suffix: e.target.value } as Partial<CanvasElement>)}
          />
        </label>
      </div>
      <label className="block mt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-600">Fallback (quando vazio)</span>
          <EmojiPicker onPick={emoji => onPatch({ fallback: (element.fallback ?? '') + emoji } as Partial<CanvasElement>)} />
        </div>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.fallback ?? ''}
          placeholder='ex: "Não informado"'
          onChange={e => onPatch({ fallback: e.target.value } as Partial<CanvasElement>)}
        />
      </label>
      <TypographyControls element={element} onPatch={onPatch} />
    </Section>
  )
}

// ── Section: Dynamic Image (logo, avatar, assinatura) ───────────────────────

function DynamicImageSection({
  element, onPatch,
}: { element: DynamicImageElement; onPatch: Props['onPatch'] }) {
  const def = findImageTag(element.tagId)
  return (
    <Section title="Imagem do Banco">
      <p className="text-[11px] text-slate-500">
        {def?.label ?? element.tagId}
      </p>
      <p className="text-[10px] text-slate-400 mt-0.5">
        Identificador: <code className="text-violet-700">{element.tagId}</code>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block col-span-2">
          <span className="text-[10px] text-slate-600">Ajuste de imagem</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.objectFit ?? 'contain'}
            onChange={e => onPatch({ objectFit: e.target.value as DynamicImageElement['objectFit'] } as Partial<CanvasElement>)}
          >
            <option value="contain">Conter (sem cortar)</option>
            <option value="cover">Cobrir (corta excesso)</option>
            <option value="fill">Esticar (distorce)</option>
            <option value="none">Tamanho real</option>
          </select>
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] text-slate-600">Texto se imagem não cadastrada</span>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.fallbackText ?? ''}
            placeholder='ex: "Logo da Clínica"'
            onChange={e => onPatch({ fallbackText: e.target.value } as Partial<CanvasElement>)}
          />
        </label>
      </div>
      <div className="mt-2 rounded bg-violet-50 border border-violet-200 px-2 py-1.5 text-[10px] text-violet-700 leading-snug">
        {def?.group === 'clinica'
          ? 'Cadastre o logo em Gestão > Aparência ou Gestão > Clínica.'
          : 'Cadastre foto/assinatura em Gestão > Usuários > Editar perfil.'}
      </div>
    </Section>
  )
}

// ── Section: Image ───────────────────────────────────────────────────────────

function ImageSection({ element, onPatch }: { element: ImageElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Imagem">
      <label className="block">
        <span className="text-[10px] text-slate-600">Ajuste</span>
        <select
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.objectFit ?? 'contain'}
          onChange={e => onPatch({ objectFit: e.target.value as ImageElement['objectFit'] } as Partial<CanvasElement>)}
        >
          <option value="contain">Conter (sem cortar)</option>
          <option value="cover">Cobrir (corta excesso)</option>
          <option value="fill">Esticar (distorce)</option>
          <option value="none">Tamanho real</option>
        </select>
      </label>
      <label className="block mt-2">
        <span className="text-[10px] text-slate-600">URL / signed URL</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-[10px] font-mono"
          value={element.url}
          onChange={e => onPatch({ url: e.target.value } as Partial<CanvasElement>)}
        />
      </label>
    </Section>
  )
}

// ── Section: Line ────────────────────────────────────────────────────────────

function LineSection({ element, onPatch }: { element: LineElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Linha">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-slate-600">Orientação</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.orientation}
            onChange={e => onPatch({ orientation: e.target.value as LineElement['orientation'] } as Partial<CanvasElement>)}
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </label>
        <NumField label="Espessura (px)" value={element.thickness} step={0.5}
          onChange={v => onPatch({ thickness: v } as Partial<CanvasElement>)} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <ColorField label="Cor" value={element.color}
          onChange={v => onPatch({ color: v } as Partial<CanvasElement>)} />
        <label className="flex items-end gap-1 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={!!element.dashed}
            onChange={e => onPatch({ dashed: e.target.checked } as Partial<CanvasElement>)}
          />
          Tracejada
        </label>
      </div>
    </Section>
  )
}

// ── Section: Repeater ────────────────────────────────────────────────────────

function RepeaterSection({ element, onPatch }: { element: RepeaterElement; onPatch: Props['onPatch'] }) {
  const isPresc = element.source === 'prescriptions'
  const fieldOptions = REPEATER_FIELDS_BY_SOURCE[element.source] ?? []

  return (
    <Section title="Lista Repetível">
      <label className="block">
        <span className="text-[10px] text-slate-600">Fonte</span>
        <select
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={element.source}
          onChange={e => onPatch({ source: e.target.value as RepeaterElement['source'] } as Partial<CanvasElement>)}
        >
          <option value="prescriptions">Medicações</option>
          <option value="exam_items">Itens de Exame</option>
          <option value="vaccines">Vacinas</option>
          <option value="dynamic_fields">Campos Dinâmicos</option>
        </select>
      </label>

      <label className="block mt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-600">Template da linha</span>
          <EmojiPicker onPick={emoji => onPatch({ itemTemplate: element.itemTemplate + emoji } as Partial<CanvasElement>)} />
        </div>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
          value={element.itemTemplate}
          placeholder={isPresc ? '{{medication}} — {{dose}}' : '{{name}}'}
          onChange={e => onPatch({ itemTemplate: e.target.value } as Partial<CanvasElement>)}
        />
        {fieldOptions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {fieldOptions.map(f => (
              <button
                key={f.field}
                type="button"
                onClick={() => {
                  const ins = `{{${f.field}}}`
                  onPatch({ itemTemplate: `${element.itemTemplate}${element.itemTemplate.endsWith(' ') ? '' : ' '}${ins}` } as Partial<CanvasElement>)
                }}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 hover:bg-violet-100 hover:text-violet-700"
                title={`Adicionar ${f.label}`}
              >
                {`{{${f.field}}}`}
              </button>
            ))}
          </div>
        )}
      </label>

      {/* Layout estruturado (multi-linha + leader dots) — quando setado,
          tem precedência sobre o "Template da linha" acima. */}
      <ItemTemplateLinesEditor
        lines={element.itemTemplateLines}
        fieldOptions={fieldOptions}
        onChange={lines => onPatch({ itemTemplateLines: lines } as Partial<CanvasElement>)}
      />

      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={element.groupAndEnumerate}
            onChange={e => onPatch({ groupAndEnumerate: e.target.checked } as Partial<CanvasElement>)}
          />
          Numerar (1, 2, 3…)
        </label>
        <NumField label="Espaçamento (pt)" value={element.lineSpacing ?? 4} step={1}
          onChange={v => onPatch({ lineSpacing: v } as Partial<CanvasElement>)} />
      </div>

      <NumField label="Máx. linhas (resto vai p/ próxima página)" value={element.maxLines ?? 0} step={1}
        onChange={v => onPatch({ maxLines: v || undefined } as Partial<CanvasElement>)} />

      <NumField
        label="Máx. itens por página (auto-paginação)"
        value={element.maxItemsPerPage ?? 0}
        step={1}
        onChange={v => onPatch({ maxItemsPerPage: v || undefined } as Partial<CanvasElement>)}
      />
      <span className="block text-[10px] text-slate-400 -mt-1">
        Quando passar desse total, o sistema gera páginas extras automaticamente.
        Elementos com pin <strong>todas as páginas</strong> repetem em cada uma.
      </span>

      {/* Agrupamento */}
      <div className="mt-3 border-t border-slate-200 pt-2 space-y-2">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agrupar por</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.groupBy ?? ''}
            onChange={e => onPatch({ groupBy: e.target.value || undefined } as Partial<CanvasElement>)}
          >
            <option value="">— Sem agrupamento —</option>
            {fieldOptions.filter(f => f.groupable).map(f => (
              <option key={f.field} value={f.field}>{f.label}</option>
            ))}
          </select>
        </label>
        {element.groupBy && (
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-600">Texto do cabeçalho de grupo</span>
              <EmojiPicker onPick={emoji => onPatch({ groupHeaderTemplate: (element.groupHeaderTemplate ?? '{{group}}') + emoji } as Partial<CanvasElement>)} />
            </div>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
              value={element.groupHeaderTemplate ?? '{{group}}'}
              placeholder="Ex: Uso {{group}}"
              onChange={e => onPatch({ groupHeaderTemplate: e.target.value } as Partial<CanvasElement>)}
            />
            <span className="block text-[10px] text-slate-400 mt-0.5">
              <code>{'{{group}}'}</code> = valor do agrupador (traduzido para PT-BR).
            </span>
          </label>
        )}
      </div>

      {/* Destaque visual de linhas */}
      {isPresc && (
        <div className="mt-3 border-t border-slate-200 pt-2 space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Destaque visual</span>
          <label className="block">
            <span className="text-[10px] text-slate-600">Campo de destaque (bool)</span>
            <select
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
              value={element.highlightField ?? ''}
              onChange={e => onPatch({ highlightField: e.target.value || undefined } as Partial<CanvasElement>)}
            >
              <option value="">— Nenhum —</option>
              <option value="is_controlled">Medicamento Controlado</option>
              <option value="requires_receipt">Requer Receituário</option>
            </select>
          </label>
          {element.highlightField && (
            <>
              <ColorField label="Cor do destaque"
                value={element.highlightColor ?? '#dbeafe'}
                onChange={v => onPatch({ highlightColor: v } as Partial<CanvasElement>)} />
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">Selo na linha (badge)</span>
                  <EmojiPicker onPick={emoji => onPatch({ highlightBadge: (element.highlightBadge ?? '') + emoji } as Partial<CanvasElement>)} />
                </div>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={element.highlightBadge ?? ''}
                  placeholder="ex: ★ CONTROLADO"
                  onChange={e => onPatch({ highlightBadge: e.target.value } as Partial<CanvasElement>)}
                />
              </label>
            </>
          )}
        </div>
      )}

      {/* Tipografia por sub-parte — permite centralizar APENAS o cabeçalho
          de grupo (Uso Oral), manter conteúdo à esquerda, etc. */}
      <div className="mt-3 border-t border-slate-200 pt-2 space-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
          Tipografia por parte
        </span>

        <details className="rounded border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
            Cabeçalho de Grupo (ex: &quot;Uso Oral&quot;)
            {element.groupHeaderTypography?.align && element.groupHeaderTypography.align !== element.typography.align && (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
                personalizado
              </span>
            )}
          </summary>
          <div className="px-2 py-2 bg-white border-t border-slate-200">
            {!element.groupBy && (
              <p className="mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                Defina &quot;Agrupar por&quot; acima para ver o cabeçalho na lista.
              </p>
            )}
            <TypographyEditor
              compact
              value={element.groupHeaderTypography ?? { ...element.typography, fontWeight: 700 }}
              onChange={next => onPatch({ groupHeaderTypography: next } as Partial<CanvasElement>)}
            />
            {element.groupHeaderTypography && (
              <button
                onClick={() => onPatch({ groupHeaderTypography: undefined } as Partial<CanvasElement>)}
                className="mt-2 text-[10px] text-slate-500 hover:text-red-600 hover:underline"
              >
                Reset (herdar do conteúdo)
              </button>
            )}
          </div>
        </details>

        <details className="rounded border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
            Numeração (1, 2, 3…)
          </summary>
          <div className="px-2 py-2 bg-white border-t border-slate-200">
            {!element.groupAndEnumerate && (
              <p className="mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                Ative &quot;Numerar&quot; acima para ver os números nas linhas.
              </p>
            )}
            <TypographyEditor
              compact
              value={element.enumerationTypography ?? { ...element.typography, fontWeight: 600 }}
              onChange={next => onPatch({ enumerationTypography: next } as Partial<CanvasElement>)}
            />
            {element.enumerationTypography && (
              <button
                onClick={() => onPatch({ enumerationTypography: undefined } as Partial<CanvasElement>)}
                className="mt-2 text-[10px] text-slate-500 hover:text-red-600 hover:underline"
              >
                Reset (herdar do conteúdo)
              </button>
            )}
          </div>
        </details>

        <details open className="rounded border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
            Conteúdo da linha
          </summary>
          <div className="px-2 py-2 bg-white border-t border-slate-200">
            <TypographyEditor
              compact
              value={element.typography}
              onChange={next => onPatch({ typography: next } as Partial<CanvasElement>)}
            />
          </div>
        </details>
      </div>
    </Section>
  )
}

/** Campos disponíveis por source — usados nos chips do template e no
 *  seletor de Agrupamento. Cada source mantém só os campos que existem
 *  no schema do banco. */
const REPEATER_FIELDS_BY_SOURCE: Record<RepeaterElement['source'], Array<{ field: string; label: string; groupable?: boolean }>> = {
  prescriptions: [
    { field: 'medication',              label: 'Medicamento' },
    { field: 'dose',                    label: 'Dose' },
    { field: 'frequency',               label: 'Frequência' },
    { field: 'duration_days',           label: 'Duração (dias)' },
    { field: 'route_of_administration', label: 'Tipo de Uso (via)', groupable: true },
    { field: 'prescription_type',       label: 'Tipo de Medicamento',  groupable: true },
    { field: 'is_controlled',           label: 'Controlado?' },
    { field: 'orientation',             label: 'Orientação' },
    { field: 'prescriber_crmv',         label: 'CRMV do Prescritor' },
  ],
  exam_items: [
    { field: 'name',    label: 'Nome' },
    { field: 'urgency', label: 'Urgência', groupable: true },
  ],
  vaccines: [
    { field: 'name', label: 'Vacina' },
    { field: 'date', label: 'Data' },
    { field: 'next', label: 'Próxima' },
  ],
  dynamic_fields: [
    { field: 'name', label: 'Nome' },
  ],
}

// ── Tipografia (compartilhada — reusável em sub-partes do Repeater) ──────────

/** Versão "primitiva" que recebe a typography direto. Permite editar
 *  qualquer fatia tipográfica isolada (ex: groupHeaderTypography, enum). */
function TypographyEditor({
  value, onChange, compact,
}: {
  value: TypographyStyle | undefined
  onChange: (next: TypographyStyle) => void
  compact?: boolean
}) {
  const t = value ?? {}
  const patch = (partial: Partial<TypographyStyle>) => onChange({ ...t, ...partial })

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-slate-600">Fonte</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={t.fontFamily ?? 'Inter'}
            onChange={e => patch({ fontFamily: e.target.value })}
          >
            <option value="Inter">Inter</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Georgia">Georgia</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Courier New">Courier New</option>
            <option value="Roboto">Roboto</option>
          </select>
        </label>
        <NumField label="Tamanho (pt)" value={t.fontSize ?? 11} step={0.5}
          onChange={v => patch({ fontSize: v })} />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <ToggleBtn active={t.fontWeight === 700} title="Negrito"
          onClick={() => patch({ fontWeight: t.fontWeight === 700 ? 400 : 700 })}
          icon={<Bold className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.fontStyle === 'italic'} title="Itálico"
          onClick={() => patch({ fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' })}
          icon={<Italic className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.textDecoration === 'underline'} title="Sublinhado"
          onClick={() => patch({ textDecoration: t.textDecoration === 'underline' ? 'none' : 'underline' })}
          icon={<Underline className="w-3.5 h-3.5" />} />
        <span className="mx-1 w-px h-5 bg-slate-300" />
        <ToggleBtn active={t.align === 'left'}    title="Esquerda" onClick={() => patch({ align: 'left' })}    icon={<AlignLeft    className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.align === 'center'}  title="Centro"   onClick={() => patch({ align: 'center' })}  icon={<AlignCenter  className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.align === 'right'}   title="Direita"  onClick={() => patch({ align: 'right' })}   icon={<AlignRight   className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.align === 'justify'} title="Justificado" onClick={() => patch({ align: 'justify' })} icon={<AlignJustify className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Cor"
          value={t.color ?? '#0f172a'}
          onChange={v => patch({ color: v })} />
        {!compact && (
          <label className="block">
            <span className="text-[10px] text-slate-600">Alinh. vertical</span>
            <select
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
              value={t.vAlign ?? 'top'}
              onChange={e => patch({ vAlign: e.target.value as 'top' | 'middle' | 'bottom' })}
            >
              <option value="top">Acima</option>
              <option value="middle">Meio</option>
              <option value="bottom">Abaixo</option>
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

/** Wrapper para Text/DynamicTag/Composite/Repeater — edita element.typography
 *  via onPatch. Mantém a API antiga das sections; só repassa pro TypographyEditor. */
function TypographyControls({
  element, onPatch,
}: {
  element: TextElement | DynamicTagElement | CompositeTagElement | RepeaterElement
  onPatch: Props['onPatch']
}) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <TypographyEditor
        value={element.typography}
        onChange={next => onPatch({ typography: next } as Partial<CanvasElement>)}
      />
    </div>
  )
}

// ── Section: Block (background + border + radius) ────────────────────────────

function BlockSection({ element, onPatch }: { element: CanvasElement; onPatch: Props['onPatch'] }) {
  const b = element.block ?? {}
  return (
    <Section title="Bloco (fundo + borda)">
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Preenchimento" value={b.backgroundColor ?? '#ffffff00'}
          onChange={v => onPatch({ block: { ...b, backgroundColor: v } } as Partial<CanvasElement>)} />
        <ColorField label="Cor da borda" value={b.borderColor ?? '#0f172a'}
          onChange={v => onPatch({ block: { ...b, borderColor: v } } as Partial<CanvasElement>)} />
        <NumField label="Borda (px)" value={b.borderWidth ?? 0} step={0.5}
          onChange={v => onPatch({ block: { ...b, borderWidth: v } } as Partial<CanvasElement>)} />
        <NumField label="Raio (px)" value={b.borderRadius ?? 0} step={1}
          onChange={v => onPatch({ block: { ...b, borderRadius: v } } as Partial<CanvasElement>)} />
        <NumField label="Padding X (px)" value={b.paddingX ?? 0} step={1}
          onChange={v => onPatch({ block: { ...b, paddingX: v } } as Partial<CanvasElement>)} />
        <NumField label="Padding Y (px)" value={b.paddingY ?? 0} step={1}
          onChange={v => onPatch({ block: { ...b, paddingY: v } } as Partial<CanvasElement>)} />
      </div>
    </Section>
  )
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="mb-2 rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 select-none">
        {title}
      </summary>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </details>
  )
}

function ItemTemplateLinesEditor({
  lines, fieldOptions, onChange,
}: {
  lines: RepeaterItemLine[] | undefined
  fieldOptions: Array<{ field: string; label: string; groupable?: boolean }>
  onChange: (lines: RepeaterItemLine[] | undefined) => void
}) {
  const active = !!lines && lines.length > 0
  const list = lines ?? []

  function setAt(idx: number, patch: Partial<RepeaterItemLine>) {
    const next = list.map((l, i) => i === idx ? { ...l, ...patch } : l)
    onChange(next)
  }
  function add() {
    onChange([...list, { template: '', leaderDots: false }])
  }
  function remove(idx: number) {
    const next = list.filter((_, i) => i !== idx)
    onChange(next.length > 0 ? next : undefined)
  }
  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= list.length) return
    const next = [...list]
    const [removed] = next.splice(idx, 1)
    next.splice(target, 0, removed)
    onChange(next)
  }
  function insertToken(idx: number, token: string) {
    const cur = list[idx]?.template ?? ''
    setAt(idx, { template: `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}${token}` })
  }
  function applyPreset() {
    // Usa apenas campos reais da tabela prescriptions. O lado direito do
    // pontilhado fica livre (digite "Cáp"/"Pomada" após o {{LEADER}} ou
    // crie o campo de forma farmacêutica). Linha 2 monta a posologia a
    // partir de frequency+duration; linha 3 mostra OBS só se houver.
    onChange([
      { template: '{{medication}} {{dose}}{{LEADER}}', leaderDots: true, style: { fontWeight: 700 } },
      { template: '{{frequency}}, durante {{duration_days}} dias consecutivos.', marginBottom: 0 },
      { template: 'OBS: {{orientation}}', style: { fontStyle: 'italic' }, hideIfEmpty: true, marginBottom: 6 },
    ])
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Layout multi-linha do item
          {active && <span className="ml-1 text-violet-600">(ativo)</span>}
        </span>
        <div className="flex items-center gap-1">
          {!active && (
            <button
              type="button"
              onClick={applyPreset}
              className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-200"
              title="Pré-carrega o layout Almavet: medicamento + tipo (pontilhado), posologia, OBS"
            >
              Preset Almavet
            </button>
          )}
          <button
            type="button"
            onClick={add}
            className="rounded bg-white border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
          >
            + Linha
          </button>
          {active && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-700"
              title="Desativa layout estruturado — volta a usar o Template da linha"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {!active ? (
        <div className="px-3 py-2 text-[10px] text-slate-500 leading-snug">
          Sem layout estruturado: o item usa o <strong>Template da linha</strong> acima.
          Adicione linhas aqui para configurar layout multi-linha (nome + posologia + OBS),
          com pontilhado expansível via <code>{'{{LEADER}}'}</code>.
        </div>
      ) : (
        <ol className="space-y-1 px-2 py-2">
          {list.map((line, idx) => (
            <li key={idx} className="rounded border border-slate-200 bg-white p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-violet-700">
                  Linha {idx + 1}
                </span>
                <div className="flex gap-0.5">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0}
                    className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Subir">↑</button>
                  <button onClick={() => move(idx, +1)} disabled={idx === list.length - 1}
                    className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Descer">↓</button>
                  <button onClick={() => remove(idx)}
                    className="rounded px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remover">×</button>
                </div>
              </div>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={line.template}
                placeholder='ex: {{medication}} {{dose}}{{LEADER}}{{type}}'
                onChange={e => setAt(idx, { template: e.target.value })}
              />
              {fieldOptions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {fieldOptions.map(f => (
                    <button
                      key={f.field}
                      type="button"
                      onClick={() => insertToken(idx, `{{${f.field}}}`)}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 hover:bg-violet-100 hover:text-violet-700"
                      title={`Inserir ${f.label}`}
                    >
                      {`{{${f.field}}}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => insertToken(idx, '{{LEADER}}')}
                    className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-mono text-violet-700 hover:bg-violet-200"
                    title="Régua pontilhada que estica até o final da linha"
                  >
                    {'{{LEADER}}'}
                  </button>
                </div>
              )}
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1 text-[10px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!line.leaderDots}
                    onChange={e => setAt(idx, { leaderDots: e.target.checked })}
                  />
                  Pontilhado expansível
                </label>
                <label className="flex items-center gap-1 text-[10px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!line.hideIfEmpty}
                    onChange={e => setAt(idx, { hideIfEmpty: e.target.checked })}
                  />
                  Ocultar se vazio
                </label>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px]">
                <label className="flex items-center gap-1 text-slate-700">
                  <input
                    type="checkbox"
                    checked={line.style?.fontWeight === 700}
                    onChange={e => setAt(idx, {
                      style: { ...line.style, fontWeight: e.target.checked ? 700 : 400 },
                    })}
                  />
                  Negrito
                </label>
                <label className="flex items-center gap-1 text-slate-700">
                  <input
                    type="checkbox"
                    checked={line.style?.fontStyle === 'italic'}
                    onChange={e => setAt(idx, {
                      style: { ...line.style, fontStyle: e.target.checked ? 'italic' : 'normal' },
                    })}
                  />
                  Itálico
                </label>
                <label className="flex items-center gap-1 text-slate-700">
                  Sep:
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={1}
                    value={line.marginBottom ?? 0}
                    onChange={e => setAt(idx, { marginBottom: Number(e.target.value) || undefined })}
                    className="w-12 rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                    title="Margem (pt) abaixo desta linha"
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function NumField({
  label, value, step = 1, onChange,
}: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] text-slate-600 truncate block">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full min-w-0 rounded border border-slate-300 px-1.5 py-1 text-xs tabular-nums"
      />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] text-slate-600 truncate block">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <input
          type="color"
          value={value.startsWith('#') ? value.slice(0, 7) : '#000000'}
          onChange={e => onChange(e.target.value)}
          className="h-7 w-8 cursor-pointer rounded border border-slate-300 flex-shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-w-0 rounded border border-slate-300 px-1.5 py-1 text-[10px] font-mono"
        />
      </div>
    </label>
  )
}

function IconBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-900"
    >
      {icon}
    </button>
  )
}

function ToggleBtn({
  active, icon, title, onClick,
}: { active: boolean; icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded border ${
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
      }`}
    >
      {icon}
    </button>
  )
}

function kindLabel(k: CanvasElement['kind']): string {
  switch (k) {
    case 'text':           return 'Texto'
    case 'image':          return 'Imagem'
    case 'line':           return 'Linha'
    case 'dynamic_tag':    return 'Tag Dinâmica'
    case 'composite_tag':  return 'Tags Mescladas'
    case 'dynamic_image':  return 'Imagem do Banco'
    case 'repeater':       return 'Lista Repetível'
    case 'brush_stroke':   return 'Pincel'
    case 'fillable_field': return 'Campo Preenchível'
  }
}
