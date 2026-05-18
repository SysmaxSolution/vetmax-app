'use client'

/**
 * ElementsToolbar — barra vertical à esquerda do CanvasEditor.
 *
 * Botões agrupados que disparam adição de elementos ao canvas:
 *   1. Texto livre
 *   2. Imagem (upload via signed URL)
 *   3. Linha (H/V)
 *   4. Tag Dinâmica → abre TagsModal centralizado (busca + abas)
 *   5. Imagem do Banco (logo, foto, assinatura) → abre ImagesModal
 *   6. Repeater (medicações, exames, vacinas) → abre RepeaterModal
 */

import { useRef, useState, useMemo } from 'react'
import {
  Type, Image as ImageIcon, Minus, Loader2,
  Tag as TagIcon, ListOrdered, AlignLeft, Stamp, Search, X, LayoutTemplate, Lightbulb,
} from 'lucide-react'
import {
  tagsByGroup, imageTagsByGroup, type DynamicTagDef, type DynamicImageTagDef,
  TAG_GROUP_LABEL, type TagGroup,
} from '@/lib/canva/dynamic-tags'
import type {
  CanvasElement, RepeaterSource,
} from '@/lib/canva/elements'
import {
  makeTextElement, makeImageElement, makeLineElement,
  makeDynamicTagElement, makeDynamicImageElement, makeRepeaterElement,
} from '@/lib/canva/elements'
import { MACRO_BLOCKS, type MacroBlock } from '@/lib/canva/macros'

interface Props {
  onAdd: (element: CanvasElement) => void
  onAddMany: (elements: CanvasElement[]) => void
  onUploadImage: (file: File) => Promise<{ url: string; storagePath: string }>
  computeStartY: () => number
}

export default function ElementsToolbar({ onAdd, onAddMany, onUploadImage, computeStartY }: Props) {
  const [modal, setModal] = useState<'tags' | 'images' | 'repeater' | 'blocks' | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleImageFile(f: File) {
    setUploading(true)
    try {
      const { url, storagePath } = await onUploadImage(f)
      onAdd(makeImageElement({ url, storagePath }))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <aside className="flex flex-col items-stretch gap-2 border-r border-slate-200 bg-slate-50 p-3 overflow-y-auto">
        <ToolButton icon={<Type className="w-5 h-5" />} label="Texto"
          onClick={() => onAdd(makeTextElement())} />

        <ToolButton icon={uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          label="Imagem"
          onClick={() => fileInput.current?.click()}
          disabled={uploading} />

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton compact icon={<Minus className="w-4 h-4" />} label="Linha H"
            onClick={() => onAdd(makeLineElement('horizontal'))} />
          <ToolButton compact icon={<Minus className="w-4 h-4 rotate-90" />} label="Linha V"
            onClick={() => onAdd(makeLineElement('vertical'))} />
        </div>

        <ToolButton
          icon={<TagIcon className="w-5 h-5" />}
          label="Tags Dinâmicas"
          onClick={() => setModal('tags')}
        />

        <ToolButton
          icon={<Stamp className="w-5 h-5" />}
          label="Imagens do Banco"
          onClick={() => setModal('images')}
        />

        <ToolButton
          icon={<ListOrdered className="w-5 h-5" />}
          label="Medicações e Listas"
          onClick={() => setModal('repeater')}
        />

        <ToolButton
          icon={<LayoutTemplate className="w-5 h-5" />}
          label="Blocos Prontos"
          onClick={() => setModal('blocks')}
        />

        <div className="mt-auto text-[9px] text-slate-400 leading-tight px-1 pt-2">
          <AlignLeft className="w-3 h-3 inline mr-1" />
          Arraste para mover; clique para editar.
        </div>
      </aside>

      {modal === 'tags' && (
        <TagsModal
          onClose={() => setModal(null)}
          onPick={tag => { onAdd(makeDynamicTagElement(tag.id)); setModal(null) }}
        />
      )}
      {modal === 'images' && (
        <ImagesModal
          onClose={() => setModal(null)}
          onPick={tag => { onAdd(makeDynamicImageElement(tag.id)); setModal(null) }}
        />
      )}
      {modal === 'repeater' && (
        <RepeaterModal
          onClose={() => setModal(null)}
          onPick={source => { onAdd(makeRepeaterElement(source)); setModal(null) }}
        />
      )}
      {modal === 'blocks' && (
        <BlocksModal
          onClose={() => setModal(null)}
          onPick={macro => {
            const built = macro.build({ startY: computeStartY() })
            onAddMany(built)
            setModal(null)
          }}
        />
      )}
    </>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ToolButton({
  icon, label, onClick, disabled, compact,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`
        flex flex-col items-center justify-center gap-1
        rounded-lg border border-slate-200 bg-white
        ${compact ? 'p-1.5' : 'p-2'}
        text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {icon}
      {!compact && <span className="text-[10px] font-medium leading-tight text-center">{label}</span>}
    </button>
  )
}

// ── BlocksModal (macros prontos) ─────────────────────────────────────────────

function BlocksModal({
  onClose, onPick,
}: { onClose: () => void; onPick: (macro: MacroBlock) => void }) {
  return (
    <ModalShell
      title="Blocos Prontos"
      subtitle="Conjuntos de elementos pré-posicionados — aceleram a montagem"
      onClose={onClose}
      maxWidth={680}
    >
      <div className="overflow-y-auto px-4 py-3">
        <p className="mb-3 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] text-violet-700 leading-snug">
          <strong>Para receituários completos:</strong> use <em>Receituário Padrão</em> —
          ele já inclui o título, a linha separadora e a lista de medicações agrupada
          por <strong>Tipo de Uso</strong> (oral, tópico, IV…) com destaque automático
          para medicamentos controlados.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MACRO_BLOCKS.map(m => (
            <button
              key={m.id}
              onClick={() => onPick(m)}
              className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-violet-400 hover:bg-violet-50 transition-colors"
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 group-hover:text-violet-700">
                  {m.label}
                </div>
                <div className="text-[11px] text-slate-500 leading-snug">{m.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}

// ── TagsModal ────────────────────────────────────────────────────────────────

type TagOrAll = TagGroup | 'all'

function TagsModal({
  onClose, onPick,
}: { onClose: () => void; onPick: (tag: DynamicTagDef) => void }) {
  const groups = useMemo(() => tagsByGroup(), [])
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<TagOrAll>('all')

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups
      .filter(g => activeGroup === 'all' || g.group === activeGroup)
      .map(g => ({
        ...g,
        tags: g.tags.filter(t =>
          !q
            || t.label.toLowerCase().includes(q)
            || t.id.toLowerCase().includes(q)
            || (t.preview ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.tags.length > 0)
  }, [groups, query, activeGroup])

  const totalShown = filteredGroups.reduce((acc, g) => acc + g.tags.length, 0)

  return (
    <ModalShell title="Tags Dinâmicas" subtitle="Campos resolvidos em tempo de impressão" onClose={onClose}>
      <div className="flex flex-col h-full min-h-0">
        {/* Busca */}
        <div className="relative px-4 pt-3 pb-2 flex-shrink-0">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            autoFocus
            type="text"
            placeholder="Buscar tag (ex: peso, telefone, CRMV)…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
          />
        </div>

        {/* Abas por grupo */}
        <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto flex-shrink-0">
          <GroupChip active={activeGroup === 'all'} onClick={() => setActiveGroup('all')}>
            Todos
          </GroupChip>
          {(['pet', 'tutor', 'consulta', 'vet', 'clinica'] as TagGroup[]).map(g => (
            <GroupChip key={g} active={activeGroup === g} onClick={() => setActiveGroup(g)}>
              {TAG_GROUP_LABEL[g]}
            </GroupChip>
          ))}
          <span className="ml-auto text-[11px] text-slate-500 flex-shrink-0">
            {totalShown} tag{totalShown !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              <div>Nenhuma tag encontrada para &quot;{query}&quot;</div>
              {isClinicalSearch(query) && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-left text-[11px] text-amber-800 leading-snug">
                  <strong className="flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Procurando medicações, posologia ou tipo de uso?
                  </strong>
                  <p className="mt-1">
                    Essas informações vêm em forma de <strong>lista</strong> (cada
                    receita pode ter várias medicações). Use o botão{' '}
                    <strong>&quot;Medicações e Listas&quot;</strong> na barra lateral —
                    ou abra <strong>&quot;Blocos Prontos&quot;</strong> e escolha{' '}
                    <strong>Receituário Padrão</strong> para inserir o bloco completo.
                  </p>
                </div>
              )}
            </div>
          ) : (
            filteredGroups.map(g => (
              <section key={g.group} className="mb-4 last:mb-0">
                <h4 className="sticky top-0 bg-white py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  {g.label}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2">
                  {g.tags.map(t => (
                    <button
                      key={t.id}
                      onClick={() => onPick(t)}
                      className="group flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-violet-400 hover:bg-violet-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 group-hover:text-violet-700 truncate">
                          {t.label}
                        </div>
                        {t.preview && (
                          <div className="text-[10px] text-slate-400 truncate">{t.preview}</div>
                        )}
                      </div>
                      <code className="text-[9px] text-slate-300 group-hover:text-violet-400 font-mono flex-shrink-0 mt-0.5">
                        {`{{${t.id}}}`}
                      </code>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ── ImagesModal ──────────────────────────────────────────────────────────────

function ImagesModal({
  onClose, onPick,
}: { onClose: () => void; onPick: (tag: DynamicImageTagDef) => void }) {
  const groups = useMemo(() => imageTagsByGroup(), [])
  return (
    <ModalShell
      title="Imagens do Banco"
      subtitle="Logo, foto e assinatura — resolvidas em tempo de impressão"
      onClose={onClose}
      maxWidth={520}
    >
      <div className="overflow-y-auto px-4 py-3">
        {groups.map(g => (
          <section key={g.group} className="mb-4 last:mb-0">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {g.label}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.tags.map(t => (
                <button
                  key={t.id}
                  onClick={() => onPick(t)}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-violet-400 hover:bg-violet-50 transition-colors"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">
                    <Stamp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 group-hover:text-violet-700">
                      {t.label}
                    </div>
                    <code className="text-[9px] text-slate-400 font-mono">{`{{${t.id}}}`}</code>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
        <p className="mt-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] text-violet-700 leading-snug">
          As imagens são puxadas do cadastro da clínica (Gestão &gt; Aparência) e dos usuários
          (Gestão &gt; Usuários &gt; Editar perfil) no momento da impressão.
        </p>
      </div>
    </ModalShell>
  )
}

// ── RepeaterModal ────────────────────────────────────────────────────────────

function RepeaterModal({
  onClose, onPick,
}: { onClose: () => void; onPick: (source: RepeaterSource) => void }) {
  const opts: Array<{ source: RepeaterSource; label: string; hint: string; icon: string }> = [
    { source: 'prescriptions',  label: 'Medicações',       hint: 'Receituário com via, tipo e destaque de controlados', icon: '💊' },
    { source: 'exam_items',     label: 'Itens de Exame',   hint: 'Solicitação de exames com urgência', icon: '🔬' },
    { source: 'vaccines',       label: 'Vacinas',          hint: 'Histórico vacinal com próxima dose', icon: '💉' },
    { source: 'dynamic_fields', label: 'Campos Dinâmicos', hint: 'Pressão, glicemia, saturação, etc.', icon: '📋' },
  ]
  return (
    <ModalShell
      title="Lista Repetível"
      subtitle="Itens que vêm do banco e são listados linha a linha"
      onClose={onClose}
      maxWidth={520}
    >
      <div className="overflow-y-auto px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {opts.map(o => (
          <button
            key={o.source}
            onClick={() => onPick(o.source)}
            className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-violet-400 hover:bg-violet-50 transition-colors"
          >
            <span className="text-2xl flex-shrink-0">{o.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800 group-hover:text-violet-700">
                {o.label}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">{o.hint}</div>
            </div>
          </button>
        ))}
      </div>
    </ModalShell>
  )
}

// ── ModalShell (compartilhado) ───────────────────────────────────────────────

function ModalShell({
  title, subtitle, onClose, children, maxWidth = 640,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        className="flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden w-full"
        style={{ maxWidth, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        {children}
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  )
}

/** Detecta se a busca do usuário sugere que ele está procurando algo que
 *  só está no Repeater (medicações/posologia/via de uso). */
const CLINICAL_KEYWORDS = [
  'medica', 'remedio', 'remédio', 'receit', 'posolog', 'orientac', 'orientação',
  'via', 'uso', 'oral', 'topic', 'tópic', 'intraven', 'intramuscular', 'subcut',
  'dose', 'frequenc', 'frequência', 'controla', 'manipula', 'duracao', 'duração',
]
function isClinicalSearch(q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return false
  return CLINICAL_KEYWORDS.some(k => n.includes(k))
}

function GroupChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
