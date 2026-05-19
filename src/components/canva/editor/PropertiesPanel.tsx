'use client'

/**
 * PropertiesPanel — painel direito contextual. Mostra controles do
 * elemento selecionado: posição/tamanho, rotação, z-index, pin (header/
 * footer/all_pages), tipografia (text|dynamic_tag|repeater), bloco
 * (background + border + radius + padding), e parâmetros específicos
 * de Repeater (source, itemTemplate, groupAndEnumerate, maxLines).
 */

import {
  AlignCenter, AlignLeft, AlignRight, AlignJustify,
  ArrowDownToLine, ArrowUpFromLine, ChevronsDown, ChevronsUp,
  Lock, Trash2, Bold, Italic, Underline,
  ArrowDown, ArrowUp, ArrowLeftRight,
} from 'lucide-react'
import type {
  CanvasElement, TextElement, ImageElement, LineElement,
  DynamicTagElement, CompositeTagElement,
  DynamicImageElement, RepeaterElement, BrushStrokeElement, ElementPin,
} from '@/lib/canva/elements'
import { findImageTag, findTag } from '@/lib/canva/dynamic-tags'

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

      {element.kind !== 'line' && element.kind !== 'image'
        && element.kind !== 'dynamic_image' && element.kind !== 'brush_stroke' && (
        <BlockSection element={element} onPatch={onPatch} />
      )}
    </aside>
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
  return (
    <Section title="Texto">
      <textarea
        className="w-full resize-y rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-900 focus:outline-none"
        rows={3}
        value={element.content}
        onChange={e => onPatch({ content: e.target.value } as Partial<CanvasElement>)}
      />
      <TypographyControls element={element} onPatch={onPatch} />
    </Section>
  )
}

// ── Section: Dynamic Tag ─────────────────────────────────────────────────────

function DynamicTagSection({ element, onPatch }: { element: DynamicTagElement; onPatch: Props['onPatch'] }) {
  return (
    <Section title="Tag Dinâmica">
      <p className="text-[11px] text-slate-500">Identificador: <code className="text-violet-700">{element.tagId}</code></p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="block">
          <span className="text-[10px] text-slate-600">Prefixo</span>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.prefix ?? ''}
            placeholder='ex: "Tutor: "'
            onChange={e => onPatch({ prefix: e.target.value } as Partial<CanvasElement>)}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-slate-600">Sufixo</span>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={element.suffix ?? ''}
            placeholder='ex: " kg"'
            onChange={e => onPatch({ suffix: e.target.value } as Partial<CanvasElement>)}
          />
        </label>
      </div>
      <label className="block mt-2">
        <span className="text-[10px] text-slate-600">Fallback (quando vazio)</span>
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
        <span className="text-[10px] text-slate-600">Template da linha</span>
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
            <span className="text-[10px] text-slate-600">Texto do cabeçalho de grupo</span>
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
                <span className="text-[10px] text-slate-600">Selo na linha (badge)</span>
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

      <TypographyControls element={element} onPatch={onPatch} />
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

// ── Tipografia (compartilhada) ───────────────────────────────────────────────

function TypographyControls({
  element, onPatch,
}: {
  element: TextElement | DynamicTagElement | CompositeTagElement | RepeaterElement
  onPatch: Props['onPatch']
}) {
  const t = element.typography
  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-slate-600">Fonte</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={t.fontFamily ?? 'Inter'}
            onChange={e => onPatch({ typography: { ...t, fontFamily: e.target.value } } as Partial<CanvasElement>)}
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
          onChange={v => onPatch({ typography: { ...t, fontSize: v } } as Partial<CanvasElement>)} />
      </div>

      <div className="flex items-center gap-1">
        <ToggleBtn active={t.fontWeight === 700} title="Negrito"
          onClick={() => onPatch({ typography: { ...t, fontWeight: t.fontWeight === 700 ? 400 : 700 } } as Partial<CanvasElement>)}
          icon={<Bold className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.fontStyle === 'italic'} title="Itálico"
          onClick={() => onPatch({ typography: { ...t, fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' } } as Partial<CanvasElement>)}
          icon={<Italic className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.textDecoration === 'underline'} title="Sublinhado"
          onClick={() => onPatch({ typography: { ...t, textDecoration: t.textDecoration === 'underline' ? 'none' : 'underline' } } as Partial<CanvasElement>)}
          icon={<Underline className="w-3.5 h-3.5" />} />
        <span className="mx-1 w-px h-5 bg-slate-300" />
        <ToggleBtn active={t.align === 'left'}    title="Esquerda" onClick={() => onPatch({ typography: { ...t, align: 'left'    } } as Partial<CanvasElement>)} icon={<AlignLeft    className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.align === 'center'}  title="Centro"   onClick={() => onPatch({ typography: { ...t, align: 'center'  } } as Partial<CanvasElement>)} icon={<AlignCenter  className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.align === 'right'}   title="Direita"  onClick={() => onPatch({ typography: { ...t, align: 'right'   } } as Partial<CanvasElement>)} icon={<AlignRight   className="w-3.5 h-3.5" />} />
        <ToggleBtn active={t.align === 'justify'} title="Justificado" onClick={() => onPatch({ typography: { ...t, align: 'justify' } } as Partial<CanvasElement>)} icon={<AlignJustify className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Cor"
          value={t.color ?? '#0f172a'}
          onChange={v => onPatch({ typography: { ...t, color: v } } as Partial<CanvasElement>)} />
        <label className="block">
          <span className="text-[10px] text-slate-600">Alinh. vertical</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={t.vAlign ?? 'top'}
            onChange={e => onPatch({ typography: { ...t, vAlign: e.target.value as 'top' | 'middle' | 'bottom' } } as Partial<CanvasElement>)}
          >
            <option value="top">Acima</option>
            <option value="middle">Meio</option>
            <option value="bottom">Abaixo</option>
          </select>
        </label>
      </div>
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
  }
}
