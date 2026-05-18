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
  DynamicTagElement, DynamicImageElement, RepeaterElement, ElementPin,
} from '@/lib/canva/elements'
import { findImageTag } from '@/lib/canva/dynamic-tags'

interface Props {
  element: CanvasElement | null
  onPatch: (patch: Partial<CanvasElement>) => void
  onDelete: () => void
  onMoveZ: (dir: 'front' | 'back' | 'forward' | 'backward') => void
}

export default function PropertiesPanel({ element, onPatch, onDelete, onMoveZ }: Props) {
  if (!element) {
    return (
      <aside className="w-[320px] border-l border-slate-200 bg-slate-50 p-4">
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
          Selecione um elemento no canvas para editar suas propriedades.
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-[320px] overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 capitalize">
            {kindLabel(element.kind)}
          </h3>
          <p className="text-[11px] text-slate-500">id: {element.id.slice(-8)}</p>
        </div>
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
      {element.kind === 'dynamic_image' && <DynamicImageSection element={element} onPatch={onPatch} />}
      {element.kind === 'repeater' && <RepeaterSection element={element} onPatch={onPatch} />}
      {element.kind === 'image' && <ImageSection element={element} onPatch={onPatch} />}
      {element.kind === 'line' && <LineSection element={element} onPatch={onPatch} />}

      {element.kind !== 'line' && element.kind !== 'image' && element.kind !== 'dynamic_image' && (
        <BlockSection element={element} onPatch={onPatch} />
      )}
    </aside>
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
          placeholder="{{name}} — {{posology}}"
          onChange={e => onPatch({ itemTemplate: e.target.value } as Partial<CanvasElement>)}
        />
        <span className="block text-[10px] text-slate-400 mt-0.5">Use <code>{'{{campo}}'}</code> para inserir colunas do item.</span>
      </label>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={element.groupAndEnumerate}
            onChange={e => onPatch({ groupAndEnumerate: e.target.checked } as Partial<CanvasElement>)}
          />
          Agrupar + Enumerar (1, 2, 3…)
        </label>
        <NumField label="Espaçamento (pt)" value={element.lineSpacing ?? 4} step={1}
          onChange={v => onPatch({ lineSpacing: v } as Partial<CanvasElement>)} />
      </div>

      <NumField label="Máx. linhas (resto vai p/ próxima página)" value={element.maxLines ?? 0} step={1}
        onChange={v => onPatch({ maxLines: v || undefined } as Partial<CanvasElement>)} />

      <TypographyControls element={element} onPatch={onPatch} />
    </Section>
  )
}

// ── Tipografia (compartilhada) ───────────────────────────────────────────────

function TypographyControls({
  element, onPatch,
}: {
  element: TextElement | DynamicTagElement | RepeaterElement
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      {children}
    </section>
  )
}

function NumField({
  label, value, step = 1, onChange,
}: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-600">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs tabular-nums"
      />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value.startsWith('#') ? value.slice(0, 7) : '#000000'}
          onChange={e => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-slate-300"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-[10px] font-mono"
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
    case 'dynamic_image':  return 'Imagem do Banco'
    case 'repeater':       return 'Lista Repetível'
  }
}
