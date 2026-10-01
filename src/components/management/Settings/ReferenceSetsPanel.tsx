'use client'

// Tabela de referência do laudo — a clínica monta a dela.
//
// É esta tabela que desenha o laudo: a ordem das linhas, os rótulos, as faixas
// impressas, quais analitos entram e de onde vem cada valor. Nada disso é fixo
// no sistema; cada clínica tem a sua, e pode haver uma por espécie.

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Plus, Trash2, Save, Copy, ArrowUp, ArrowDown,
  ClipboardList, AlertTriangle, Eye, EyeOff,
} from 'lucide-react'
import {
  listReferenceSets, createReferenceSet, duplicateReferenceSet,
  updateReferenceSet, deleteReferenceSet, saveReferenceItems,
  type RefSet, type RefItemInput,
} from '@/lib/actions/lab-reference-sets'

const EXAMES = [
  { key: 'hemograma',  label: 'Hemograma' },
  { key: 'bioquimico', label: 'Bioquímico' },
]

const ESPECIES = [
  { key: '',       label: 'Todas as espécies' },
  { key: 'dog',    label: 'Canina' },
  { key: 'cat',    label: 'Felina' },
  { key: 'bird',   label: 'Aves' },
  { key: 'rabbit', label: 'Lagomorfa' },
  { key: 'rodent', label: 'Roedores' },
]

const SECOES = [
  { key: 'erythrogram', label: 'Eritrograma' },
  { key: 'leukogram',   label: 'Leucograma' },
  { key: 'platelets',   label: 'Plaquetas' },
  { key: 'biochem',     label: 'Bioquímica' },
  { key: 'other',       label: 'Outros' },
]

const ORIGENS = [
  { key: 'device', label: 'Aparelho',  dica: 'O analisador mede e o valor entra sozinho.' },
  { key: 'slide',  label: 'Lâmina',    dica: 'Leitura no microscópio, digitada pelo laboratório.' },
  { key: 'text',   label: 'Texto',     dica: 'Campo livre (observações, avaliação, nota).' },
]

const especieLabel = (s: string | null) => ESPECIES.find(e => e.key === (s ?? ''))?.label ?? s

const linhaVazia = (): RefItemInput => ({
  label: '', analyte_code: null, section: 'erythrogram', input_source: 'device',
  unit: null, ref_text: null, ref_abs_text: null,
  is_visible: true, is_editable: false, default_text: null,
})

export default function ReferenceSetsPanel({
  onToast,
}: { onToast: (type: 'success' | 'error', msg: string) => void }) {
  const [sets, setSets]       = useState<RefSet[]>([])
  const [selId, setSelId]     = useState<string | null>(null)
  const [itens, setItens]     = useState<RefItemInput[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [sujo, setSujo]       = useState(false)
  const [novo, setNovo]       = useState(false)
  const [dupl, setDupl]       = useState(false)

  const carregar = useCallback(async (manterId?: string | null) => {
    const lista = await listReferenceSets()
    setSets(lista)
    const alvo = manterId ?? selId ?? lista[0]?.id ?? null
    const sel = lista.find(s => s.id === alvo) ?? lista[0] ?? null
    setSelId(sel?.id ?? null)
    setItens(sel ? sel.items.map(i => ({
      label: i.label, analyte_code: i.analyte_code, section: i.section,
      input_source: i.input_source, unit: i.unit, ref_text: i.ref_text,
      ref_abs_text: i.ref_abs_text, is_visible: i.is_visible,
      is_editable: i.is_editable, default_text: i.default_text,
    })) : [])
    setSujo(false)
    setLoading(false)
  }, [selId])

  useEffect(() => { void carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = sets.find(s => s.id === selId) ?? null

  function trocarSet(id: string) {
    if (sujo && !confirm('Há alterações não salvas nesta tabela. Trocar mesmo assim?')) return
    void carregar(id)
  }

  function setLinha(i: number, patch: Partial<RefItemInput>) {
    setItens(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
    setSujo(true)
  }
  function mover(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= itens.length) return
    setItens(prev => { const c = [...prev]; [c[i], c[j]] = [c[j], c[i]]; return c })
    setSujo(true)
  }
  function remover(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i)); setSujo(true)
  }

  async function salvar() {
    if (!selId) return
    setBusy(true)
    const res = await saveReferenceItems(selId, itens)
    setBusy(false)
    if ('error' in res) return onToast('error', res.error)
    onToast('success', `Tabela salva com ${res.count} linha(s). Os próximos laudos já usam.`)
    void carregar(selId)
  }

  async function duplicar(species: string, nome: string) {
    if (!sel) return
    setBusy(true)
    const res = await duplicateReferenceSet(sel.id, { species: species || null, name: nome })
    setBusy(false)
    if ('error' in res) return onToast('error', res.error)
    setDupl(false)
    onToast('success', 'Tabela duplicada com todas as linhas — agora é só ajustar as faixas.')
    void carregar(res.id)
  }

  async function criar(panel: string, species: string, name: string) {
    setBusy(true)
    const res = await createReferenceSet({ panel_key: panel, species: species || null, name })
    setBusy(false)
    if ('error' in res) return onToast('error', res.error)
    setNovo(false)
    onToast('success', 'Tabela criada. Adicione as linhas abaixo.')
    void carregar(res.id)
  }

  async function excluir() {
    if (!sel) return
    if (!confirm(`Excluir a tabela "${sel.name}"?\n\nOs laudos já emitidos não mudam. Os próximos voltam a usar as faixas do aparelho.`)) return
    setBusy(true)
    const res = await deleteReferenceSet(sel.id)
    setBusy(false)
    if ('error' in res) return onToast('error', res.error)
    onToast('success', 'Tabela excluída.')
    setSelId(null); void carregar(null)
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando tabelas de referência…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ---- seletor de tabela ---- */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {sets.map(s => (
            <button
              key={s.id} onClick={() => trocarSet(s.id)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                s.id === selId
                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="block font-semibold">{s.name}</span>
              <span className="block text-[11px] opacity-70">
                {EXAMES.find(e => e.key === s.panel_key)?.label ?? s.panel_key} · {especieLabel(s.species)} · {s.items.length} linhas
              </span>
            </button>
          ))}
          <button
            onClick={() => setNovo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:border-teal-400 hover:text-teal-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Nova tabela
          </button>
        </div>

        {sets.length === 0 && !novo && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Nenhuma tabela cadastrada. Sem ela o laudo imprime as faixas que o próprio
            analisador envia — que é como o sistema funciona por padrão. Crie uma tabela
            quando o laboratório trabalhar com faixas próprias.
          </p>
        )}

        {novo && <FormNovaTabela onCancel={() => setNovo(false)} onCreate={criar} busy={busy} />}
      </div>

      {/* ---- editor de linhas ---- */}
      {sel && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800">{sel.name}</h3>
                <p className="text-xs text-slate-500">
                  {itens.length} linha(s) · {itens.filter(i => i.input_source === 'device').length} do aparelho ·{' '}
                  {itens.filter(i => i.input_source === 'slide').length} de lâmina ·{' '}
                  {itens.filter(i => i.input_source === 'text').length} de texto
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDupl(v => !v)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50">
                <Copy className="h-3.5 w-3.5" /> Duplicar p/ outra espécie
              </button>
              <button onClick={excluir} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
              <button onClick={salvar} disabled={busy || !sujo}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {sujo ? 'Salvar alterações' : 'Salvo'}
              </button>
            </div>
          </header>

          {dupl && (
            <FormDuplicar origem={sel} busy={busy} onCancel={() => setDupl(false)} onConfirm={duplicar} />
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="w-14 px-2 py-2">Ordem</th>
                  <th className="px-2 py-2">Linha do laudo</th>
                  <th className="w-28 px-2 py-2">Seção</th>
                  <th className="w-24 px-2 py-2">Origem</th>
                  <th className="w-24 px-2 py-2">Cód. aparelho</th>
                  <th className="w-20 px-2 py-2">Unidade</th>
                  <th className="px-2 py-2">Referência</th>
                  <th className="px-2 py-2">Ref. absoluta</th>
                  <th className="w-24 px-2 py-2">Opções</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((l, i) => (
                  <LinhaEditor
                    key={i} l={l} i={i} total={itens.length}
                    onChange={p => setLinha(i, p)}
                    onMover={d => mover(i, d)}
                    onRemover={() => remover(i)}
                  />
                ))}
                {itens.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                    Tabela vazia. Adicione as linhas na ordem em que elas devem sair no laudo.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <button
              onClick={() => { setItens(p => [...p, linhaVazia()]); setSujo(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-teal-400 hover:text-teal-700"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar linha
            </button>
            {sujo && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Alterações ainda não salvas
              </span>
            )}
          </div>

          <footer className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            Escreva a referência como ela deve sair impressa — <em>5,5 A 8,5 milhões/mm³</em>,
            <em> 200 a 500 mil/mm³</em>, <em>0 %</em>. O sistema entende os limites sozinho para
            marcar alto/baixo, e imprime o texto exatamente como você escreveu.
            Linha com <strong>origem Lâmina</strong> ignora o que o aparelho mandou e espera
            digitação. Linha do <strong>aparelho</strong> marcada como corrigível pode ser
            alterada pelo laboratório — é o caso da contagem plaquetária.
          </footer>
        </div>
      )}
    </div>
  )
}

function LinhaEditor({
  l, i, total, onChange, onMover, onRemover,
}: {
  l: RefItemInput; i: number; total: number
  onChange: (p: Partial<RefItemInput>) => void
  onMover: (d: number) => void
  onRemover: () => void
}) {
  const inp = 'w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-300'
  const ehTexto = l.input_source === 'text'

  return (
    <tr className={l.is_visible ? '' : 'opacity-50'}>
      <td className="px-2 py-1.5">
        <div className="flex gap-0.5">
          <button onClick={() => onMover(-1)} disabled={i === 0}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Subir">
            <ArrowUp className="h-3 w-3" />
          </button>
          <button onClick={() => onMover(1)} disabled={i === total - 1}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Descer">
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      </td>

      <td className="px-2 py-1.5">
        <input value={l.label} onChange={e => onChange({ label: e.target.value })}
          placeholder="ERITRÓCITOS" className={inp} />
        {ehTexto && (
          <input value={l.default_text ?? ''} onChange={e => onChange({ default_text: e.target.value })}
            placeholder="texto padrão (ex.: Amostra negativa.)" className={inp + ' mt-1 italic'} />
        )}
      </td>

      <td className="px-2 py-1.5">
        <select value={l.section} onChange={e => onChange({ section: e.target.value })} className={inp}>
          {SECOES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </td>

      <td className="px-2 py-1.5">
        <select
          value={l.input_source}
          onChange={e => onChange({ input_source: e.target.value, ...(e.target.value !== 'device' ? { analyte_code: null } : {}) })}
          title={ORIGENS.find(o => o.key === l.input_source)?.dica}
          className={inp}
        >
          {ORIGENS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </td>

      <td className="px-2 py-1.5">
        <input value={l.analyte_code ?? ''} disabled={l.input_source !== 'device'}
          onChange={e => onChange({ analyte_code: e.target.value || null })}
          placeholder="RBC" className={inp} />
      </td>

      <td className="px-2 py-1.5">
        <input value={l.unit ?? ''} disabled={ehTexto}
          onChange={e => onChange({ unit: e.target.value || null })}
          placeholder="g/dl" className={inp} />
      </td>

      <td className="px-2 py-1.5">
        <input value={l.ref_text ?? ''} disabled={ehTexto}
          onChange={e => onChange({ ref_text: e.target.value || null })}
          placeholder="5,5 A 8,5 milhões/mm³" className={inp} />
      </td>

      <td className="px-2 py-1.5">
        <input value={l.ref_abs_text ?? ''} disabled={ehTexto}
          onChange={e => onChange({ ref_abs_text: e.target.value || null })}
          placeholder="3300 A 12800" className={inp} />
      </td>

      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-1">
          <button onClick={() => onChange({ is_visible: !l.is_visible })}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
            {l.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {l.is_visible ? 'no laudo' : 'oculta'}
          </button>
          {l.input_source === 'device' && (
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <input type="checkbox" checked={l.is_editable}
                onChange={e => onChange({ is_editable: e.target.checked })}
                className="h-3 w-3 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              corrigível
            </label>
          )}
        </div>
      </td>

      <td className="px-2 py-1.5">
        <button onClick={onRemover} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover linha">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

function FormNovaTabela({
  onCancel, onCreate, busy,
}: { onCancel: () => void; onCreate: (p: string, e: string, n: string) => void; busy: boolean }) {
  const [panel, setPanel] = useState('hemograma')
  const [esp, setEsp]     = useState('dog')
  const [nome, setNome]   = useState('')

  const sugestao = `${EXAMES.find(e => e.key === panel)?.label} — ${especieLabel(esp || null)}`

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">Exame</span>
          <select value={panel} onChange={e => setPanel(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1.5 text-xs">
            {EXAMES.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">Espécie</span>
          <select value={esp} onChange={e => setEsp(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1.5 text-xs">
            {ESPECIES.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-xs text-slate-600">
          <span className="mb-1 block font-medium">Nome</span>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder={sugestao}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">Cancelar</button>
          <button onClick={() => onCreate(panel, esp, nome.trim() || sugestao)} disabled={busy}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            Criar
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Duplicar a tabela para outra espécie. É o caminho curto do dia a dia: a
 * clínica monta a canina, duplica para felina e corrige só as faixas que mudam
 * — em vez de redigitar 26 linhas.
 */
function FormDuplicar({
  origem, busy, onCancel, onConfirm,
}: {
  origem: RefSet; busy: boolean
  onCancel: () => void
  onConfirm: (species: string, nome: string) => void
}) {
  const livres = ESPECIES.filter(e => e.key !== (origem.species ?? ''))
  const [esp, setEsp]   = useState(livres[0]?.key ?? '')
  const [nome, setNome] = useState('')

  const sugestao = `${EXAMES.find(e => e.key === origem.panel_key)?.label ?? origem.panel_key} — ${especieLabel(esp || null)}`

  return (
    <div className="border-b border-slate-200 bg-teal-50/60 px-4 py-3">
      <p className="mb-2 text-xs text-slate-600">
        Copia as <strong>{origem.items.length} linhas</strong> de &ldquo;{origem.name}&rdquo; para outra
        espécie. As faixas vêm junto — depois é só ajustar o que for diferente.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">Nova espécie</span>
          <select value={esp} onChange={e => setEsp(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
            {livres.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-xs text-slate-600">
          <span className="mb-1 block font-medium">Nome da nova tabela</span>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder={sugestao}
            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs" />
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            Cancelar
          </button>
          <button onClick={() => onConfirm(esp, nome.trim() || sugestao)} disabled={busy}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            Duplicar
          </button>
        </div>
      </div>
    </div>
  )
}
