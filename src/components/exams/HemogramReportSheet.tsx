// Folha do laudo de hemograma — layout da Clínica Animais.
// Componente de APRESENTAÇÃO (server-safe, sem estado): recebe os dados já
// montados e desenha as páginas A4. Não interpreta resultado: imprime os
// valores, unidades e faixas que o aparelho enviou. Laudo é ato do Médico
// Veterinário — a assinatura só aparece quando o resultado está LIBERADO.

import type { ExamReportData } from '@/lib/lab/exam-report-data'
import { ageLabel, deviceLabel, formatCrmv, genderLabel, neuteredLabel, speciesLabel } from '@/lib/lab/exam-report-data'
import type { HemogramRow } from '@/lib/lab/hemogram-report'
import type { BiochemBlock } from '@/lib/lab/biochem-report'

// O analisador não produz morfologia nem hematozoários — isso é leitura de
// lâmina, ato do Médico Veterinário. O campo fica explicitamente em aberto.
const OBS_EMPTY = 'A preencher pelo Médico Veterinário (leitura de lâmina).'

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Flag({ f }: { f: string | null }) {
  const k = (f ?? '').toUpperCase()
  if (k !== 'H' && k !== 'L' && k !== 'A') return null
  return <span className={`ld-flag ld-flag-${k.toLowerCase()}`}>{k}</span>
}

function Rows({ rows, showAbs }: { rows: HemogramRow[]; showAbs: boolean }) {
  return (
    <>
      {rows.map((r, i) => (
        <tr key={r.code} className={i % 2 === 0 ? 'ld-z' : undefined}>
          <td className="ld-name">{r.label}</td>
          <td className="ld-colon">:</td>
          <td className="ld-val">{r.value ?? '—'}<Flag f={r.flag} /></td>
          <td className="ld-unit">{r.unit ?? ''}</td>
          {showAbs && <td className="ld-val">{r.value_abs ?? ''}{r.value_abs ? <Flag f={r.flag_abs} /> : null}</td>}
          {showAbs && <td className="ld-unit">{r.unit_abs ?? ''}</td>}
          <td className="ld-ref">{r.ref_abs ?? ''}</td>
          <td className="ld-ref">{r.ref_rel ?? ''}</td>
        </tr>
      ))}
    </>
  )
}

/** Linha "Rótulo.........: valor" com os pontinhos alinhados, como no laudo da Animais. */
function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="ld-metarow">
      <span className="ld-lead">{k}<span className="ld-dots">{'.'.repeat(40)}</span></span>
      <span>: <i>{v}</i></span>
    </div>
  )
}

/**
 * Bloco de bioquímica no formato do laudo da Animais: título à esquerda,
 * "Valores de Referência" alinhado à direita, Material/Metodologia abaixo e
 * a(s) linha(s) de resultado. Um bloco por exame — bilirrubinas trazem três.
 */
function BiochemCard({ b }: { b: BiochemBlock }) {
  return (
    <section className="ld-bq">
      <div className="ld-bq-head">
        <h2 className="ld-bq-title">{b.title}</h2>
        <div className="ld-bq-refhead">Valores de Referência</div>
      </div>

      <div className="ld-meta ld-bq-meta">
        {b.material && <Meta k="Material" v={b.material} />}
        {b.method   && <Meta k="Metodologia" v={b.method} />}
      </div>

      <table className="ld-table ld-bq-table">
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={`${b.key}-${r.label}-${i}`}>
              <td className="ld-name">{r.label}</td>
              <td className="ld-colon">:</td>
              <td className="ld-val">{r.value}<Flag f={r.flag} /></td>
              <td className="ld-unit">{r.unit ?? ''}</td>
              <td className="ld-ref">{r.ref ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function PageHeader({ d }: { d: ExamReportData }) {
  const p = d.header.patient
  const age = ageLabel(p.birth_date)
  const desc = [
    speciesLabel(p.species),
    p.breed || null,
    genderLabel(p.gender),
    neuteredLabel(p.neutered, p.gender),
    p.birth_date ? `nascido em ${fmtDate(p.birth_date)}` : null,
    age ? `idade ${age}` : null,
  ].filter(Boolean).join(', ')

  return (
    <header className="ld-head">
      <div className="ld-logo">
        {d.header.clinic.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={d.header.clinic.logo_url} alt={d.header.clinic.name} />
          : <div className="ld-logo-fallback">{d.header.clinic.name}</div>}
      </div>
      <div className="ld-headinfo">
        <div className="ld-os">
          <span className="ld-os-lbl">OS:</span>{' '}
          <strong>{d.header.os_number}</strong> - <strong>{fmtDate(d.header.os_date)}</strong>{' '}
          <strong className="ld-os-clinic">{d.header.clinic.name.toUpperCase()}</strong>
        </div>

        <div className="ld-block">
          <div className="ld-lbl">Animal:</div>
          <div className="ld-vals">
            <div className="ld-petname">{p.name}</div>
            <div className="ld-strong">{desc}</div>
          </div>
        </div>

        <div className="ld-block">
          <div className="ld-lbl">Tutor:</div>
          <div className="ld-vals">
            <div className="ld-strong">{d.header.tutor.name ?? '—'}</div>
            <div className="ld-strong">
              {[d.header.tutor.email, d.header.tutor.phone].filter(Boolean).join('   ') || '—'}
            </div>
          </div>
        </div>

        <div className="ld-block">
          <div className="ld-lbl">Veterinário:</div>
          <div className="ld-vals">
            <div className="ld-strong">{d.header.vet.name ?? '—'}</div>
            {formatCrmv(d.header.vet.crmv) && <div className="ld-strong">{formatCrmv(d.header.vet.crmv)}</div>}
          </div>
        </div>

        <div className="ld-block">
          <div className="ld-lbl">Clínica:</div>
          <div className="ld-vals">
            <div className="ld-strong">{d.header.clinic.name}</div>
            {d.header.clinic.address && <div className="ld-strong">{d.header.clinic.address}</div>}
            {d.header.clinic.phone && <div className="ld-strong">{d.header.clinic.phone}</div>}
          </div>
        </div>
      </div>
    </header>
  )
}

function PageFooter({ d, page, total }: { d: ExamReportData; page: number; total: number }) {
  return (
    <footer className="ld-foot">
      {d.status === 'released' ? (
        <div className="ld-sign">
          {d.header.vet.signature_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.header.vet.signature_url} alt="Assinatura" className="ld-sign-img" />
          )}
          <div>Assinado eletronicamente por {(d.header.vet.name ?? '').toUpperCase() || '—'}</div>
          {formatCrmv(d.header.vet.crmv) && <div>{formatCrmv(d.header.vet.crmv)}</div>}
          {d.released_at && <div className="ld-sign-meta">Liberado em {fmtDateTime(d.released_at)}</div>}
        </div>
      ) : (
        <div className="ld-sign ld-sign-draft">
          Documento sem validade — resultado ainda não conferido e liberado pelo Médico Veterinário.
        </div>
      )}
      <div className="ld-pg">Pág.: <strong>{page}</strong> de <strong>{total}</strong></div>
    </footer>
  )
}

/** Quantos blocos de bioquímica cabem numa folha A4 sem estourar. */
const BIOCHEM_POR_PAGINA = 4

export default function HemogramReportSheet({ data }: { data: ExamReportData }) {
  const { report, biochem } = data
  const hasHemogram =
    report.erythrogram.length + report.leukogram.length +
    report.platelets.length + report.other.length > 0
  const hasGraphs = report.graphs.some(g => g.src)

  const bioPaginas: BiochemBlock[][] = []
  for (let i = 0; i < biochem.blocks.length; i += BIOCHEM_POR_PAGINA) {
    bioPaginas.push(biochem.blocks.slice(i, i + BIOCHEM_POR_PAGINA))
  }

  // Numeração: hemograma (se houver) → bioquímica → curvas.
  const total = Math.max(1, (hasHemogram ? 1 : 0) + bioPaginas.length + (hasGraphs ? 1 : 0))
  const primeiraBio = (hasHemogram ? 1 : 0) + 1

  return (
    <div className="ld-sheet">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ---------- HEMOGRAMA (só quando o hematológico mandou algo) ---------- */}
      {hasHemogram && (
        <section className="ld-page">
          {data.status !== 'released' && <div className="ld-watermark">RASCUNHO</div>}
          <PageHeader d={data} />

          <main className="ld-body">
            <h1 className="ld-title">{(data.panel ?? 'Hemograma').toUpperCase()}</h1>
            <div className="ld-meta">
              <Meta k="Material" v="SANGUE TOTAL COM E.D.T.A." />
              <Meta k="Metodologia" v="IMPEDÂNCIA E CITOMETRIA DE FLUXO A LASER" />
              <Meta k="Equipamento" v={deviceLabel(data.device) ?? 'Analisador hematológico'} />
              <Meta k="Amostra" v={`${data.sample_id ?? '—'}${data.collected_at ? ` · colhida em ${fmtDateTime(data.collected_at)}` : ''}`} />
            </div>

            <table className="ld-table">
              <thead>
                <tr className="ld-colhead">
                  <th colSpan={6}></th>
                  <th>Vlr Ref. Absoluto</th>
                  <th>Vlr Ref. Relativo</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={8} className="ld-sub">Eritrograma</td></tr>
                <Rows rows={report.erythrogram} showAbs />

                <tr><td colSpan={8} className="ld-obs-lbl">Observações série vermelha</td></tr>
                <tr><td colSpan={8} className="ld-obs">{OBS_EMPTY}</td></tr>

                <tr><td colSpan={8} className="ld-sub">Leucograma</td></tr>
                <Rows rows={report.leukogram} showAbs />

                <tr><td colSpan={8} className="ld-obs-lbl">Observações série branca</td></tr>
                <tr><td colSpan={8} className="ld-obs">{OBS_EMPTY}</td></tr>

                <tr><td colSpan={8} className="ld-sub">Série plaquetária</td></tr>
                <Rows rows={report.platelets} showAbs />

                <tr><td colSpan={8} className="ld-obs-lbl">Avaliação plaquetária</td></tr>
                <tr><td colSpan={8} className="ld-obs">{OBS_EMPTY}</td></tr>

                {report.other.length > 0 && (
                  <>
                    <tr><td colSpan={8} className="ld-sub">Outros parâmetros do aparelho</td></tr>
                    <Rows rows={report.other} showAbs />
                  </>
                )}

                <tr><td colSpan={8} className="ld-obs-lbl">Pesquisa de hematozoários</td></tr>
                <tr><td colSpan={8} className="ld-obs">{OBS_EMPTY}</td></tr>
              </tbody>
            </table>

            <p className="ld-note">
              Valores, unidades e faixas de referência conforme emitidos pelo analisador.
              A interpretação clínica é de responsabilidade do Médico Veterinário.
            </p>
          </main>

          <PageFooter d={data} page={1} total={total} />
        </section>
      )}

      {/* ---------- BIOQUÍMICA: um bloco por exame, como no laudo da Animais ---------- */}
      {bioPaginas.map((blocos, i) => (
        <section className="ld-page" key={`bio-${i}`}>
          {data.status !== 'released' && <div className="ld-watermark">RASCUNHO</div>}
          <PageHeader d={data} />
          <main className="ld-body">
            {i === 0 && (
              <div className="ld-meta">
                <Meta k="Equipamento" v={deviceLabel(data.device) ?? 'Analisador bioquímico'} />
                <Meta k="Amostra" v={`${data.sample_id ?? '—'}${data.collected_at ? ` · colhida em ${fmtDateTime(data.collected_at)}` : ''}`} />
              </div>
            )}
            {blocos.map(b => <BiochemCard key={b.key} b={b} />)}
            <p className="ld-note">
              Valores e unidades conforme emitidos pelo analisador. As faixas de
              referência são as do aparelho quando ele as envia; na ausência delas,
              as do catálogo da clínica. A interpretação clínica é de
              responsabilidade do Médico Veterinário.
            </p>
          </main>
          <PageFooter d={data} page={primeiraBio + i} total={total} />
        </section>
      ))}

      {/* ---------- Página 2: histogramas e scattergramas ---------- */}
      {hasGraphs && (
        <section className="ld-page">
          {data.status !== 'released' && <div className="ld-watermark">RASCUNHO</div>}
          <PageHeader d={data} />
          <main className="ld-body">
            <h1 className="ld-title">HISTOGRAMAS E SCATTERGRAMAS</h1>
            <div className="ld-meta">
              <Meta k="Origem" v={`curvas geradas pelo ${deviceLabel(data.device) ?? 'analisador'}`} />
            </div>
            <div className="ld-grid">
              {report.graphs.filter(g => g.src).map(g => (
                <figure key={g.code} className="ld-fig">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.src as string} alt={g.title} />
                  <figcaption>{g.title}</figcaption>
                </figure>
              ))}
            </div>
            <p className="ld-note">
              Curvas reproduzidas exatamente como o analisador as enviou, sem
              qualquer tratamento de imagem.
            </p>
          </main>
          <PageFooter d={data} page={total} total={total} />
        </section>
      )}
    </div>
  )
}

const CSS = `
.ld-sheet { --ink:#1a1a1a; --muted:#555; --rule:#333; --zebra:#f2f2f2;
  font-family: "Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif;
  color: var(--ink); background:#e9eaec; padding: 18px 0; }
.ld-page { position: relative; width: 21cm; min-height: 29.7cm; margin: 0 auto 18px;
  padding: 12mm 10mm 10mm; background:#fff; box-sizing: border-box;
  display: flex; flex-direction: column; box-shadow: 0 2px 10px rgba(0,0,0,.18); }

/* ---- cabeçalho (repetido em todas as páginas) ---- */
.ld-head { display: flex; gap: 10px; align-items: flex-start;
  border-bottom: 1.2px solid var(--rule); padding-bottom: 6px; }
.ld-logo { width: 130px; flex: 0 0 130px; display:flex; align-items:center; justify-content:center; }
.ld-logo img { max-width: 130px; max-height: 105px; object-fit: contain; }
.ld-logo-fallback { font-size: 17px; font-weight: 800; letter-spacing: .14em;
  text-align:center; color:#3f8a3f; line-height:1.15; }
.ld-headinfo { flex: 1 1 auto; min-width: 0; }
.ld-os { font-size: 14px; margin: 0 0 6px; padding-left: 84px; }
.ld-os-lbl { color: var(--muted); font-size: 12.5px; }
.ld-os-clinic { margin-left: 8px; }
.ld-block { display: flex; gap: 8px; margin-bottom: 5px; }
.ld-lbl { flex: 0 0 76px; text-align: right; font-size: 8.5px; color: var(--muted);
  padding-top: 1.5px; }
.ld-vals { flex: 1 1 auto; min-width: 0; }
.ld-petname { font-size: 13px; font-weight: 700; line-height: 1.15; }
.ld-strong { font-size: 8.6px; font-weight: 700; line-height: 1.35; }

/* ---- corpo ---- */
.ld-body { flex: 1 1 auto; padding-top: 8px; }
.ld-title { font-size: 13px; font-weight: 700; margin: 0 0 4px; }
.ld-meta { font-size: 7.6px; color: var(--ink); line-height: 1.45; margin-bottom: 10px; }
.ld-meta i { font-style: italic; }
.ld-metarow { display: grid; grid-template-columns: 74px 1fr; }
.ld-lead { overflow: hidden; white-space: nowrap; }
.ld-dots { letter-spacing: .5px; }

.ld-table { width: 100%; border-collapse: collapse; font-size: 8.6px; }
.ld-colhead th { font-size: 8.6px; font-weight: 700; text-align: left;
  padding: 0 4px 4px; white-space: nowrap; }
.ld-sub { font-size: 8.8px; padding: 12px 0 5px; }
.ld-z td { background: var(--zebra); }
.ld-table td { padding: 2.6px 4px; vertical-align: baseline; }
.ld-name { width: 27%; }
.ld-colon { width: 10px; color: var(--muted); }
.ld-val { text-align: right; font-weight: 700; white-space: nowrap; width: 8%; }
.ld-unit { width: 9%; white-space: nowrap; }
.ld-ref { width: 16%; white-space: nowrap; }

.ld-flag { display:inline-block; margin-left: 3px; font-size: 6.6px; font-weight: 800;
  vertical-align: super; }
.ld-flag-h { color: #b91c1c; }
.ld-flag-l { color: #1d4ed8; }
.ld-flag-a { color: #b45309; }

.ld-obs-lbl { font-size: 8.6px; padding: 9px 0 1px; }
.ld-obs { font-size: 9.5px; font-style: italic; color: #8a8a8a; padding: 0 0 8px 6px; }

.ld-note { font-size: 7.2px; color: var(--muted); margin: 14px 0 0; line-height: 1.4; }

/* ---- blocos de bioquímica ---- */
.ld-bq { margin-bottom: 16px; break-inside: avoid; page-break-inside: avoid; }
.ld-bq-head { display: flex; align-items: baseline; justify-content: space-between;
  gap: 16px; border-bottom: .8px solid #ccc; padding-bottom: 2px; }
.ld-bq-title { font-size: 11px; font-weight: 700; margin: 0; }
.ld-bq-refhead { font-size: 8.2px; font-weight: 700; white-space: nowrap; }
.ld-bq-meta { margin: 5px 0 4px; }
.ld-bq-table td { padding: 2.2px 4px; }
.ld-bq-table .ld-ref { text-align: right; }

/* ---- gráficos ---- */
.ld-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-top: 6px; }
.ld-fig { margin: 0; border: 1px solid #ddd; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
.ld-fig img { width: 100%; height: auto; display: block; image-rendering: pixelated; }
.ld-fig figcaption { font-size: 7.6px; font-weight: 700; text-align: center; padding-top: 4px; }

/* ---- rodapé ---- */
.ld-foot { margin-top: auto; padding-top: 14px; display: flex;
  align-items: flex-end; justify-content: space-between; gap: 12px; }
.ld-sign { font-size: 8.6px; line-height: 1.45; }
.ld-sign-img { max-height: 38px; max-width: 150px; display: block; margin-bottom: 2px; }
.ld-sign-meta { color: var(--muted); }
.ld-sign-draft { color: #b45309; font-weight: 700; }
.ld-pg { font-size: 8.6px; white-space: nowrap; }

.ld-watermark { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; pointer-events: none; font-size: 96px; font-weight: 800;
  color: rgba(180,83,9,.09); transform: rotate(-28deg); letter-spacing: .1em; }

@media print {
  @page { size: A4 portrait; margin: 0; }
  .ld-sheet { background: #fff; padding: 0; }
  .ld-page { width: 21cm; height: 29.7cm; min-height: 0; margin: 0;
    box-shadow: none; page-break-after: always; break-after: page; }
  .ld-page:last-child { page-break-after: auto; break-after: auto; }
  .ld-z td, .ld-flag-h, .ld-flag-l, .ld-flag-a, .ld-watermark {
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`
