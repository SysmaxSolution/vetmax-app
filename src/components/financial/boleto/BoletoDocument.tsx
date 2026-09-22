import type { BoletoView } from '@/lib/boleto/view'

// Marca do Sicoob (símbolo + wordmark) — SVG embutido, cores da marca.
function SicoobLogo() {
  return (
    <svg width="96" height="26" viewBox="0 0 200 54" xmlns="http://www.w3.org/2000/svg" aria-label="Sicoob">
      {/* símbolo (arco) */}
      <path d="M8 34 A22 22 0 0 1 46 20" fill="none" stroke="#00AE9D" strokeWidth="9" strokeLinecap="round" />
      <circle cx="46" cy="20" r="6.5" fill="#7DB61C" />
      {/* wordmark */}
      <text x="60" y="40" fontFamily="Arial, Helvetica, sans-serif" fontSize="34" fontWeight="700" fill="#003641" letterSpacing="-1">sicoob</text>
    </svg>
  )
}

// Layout de boleto bancário (Recibo do Pagador + Ficha de Compensação).
// Componente apresentacional puro — usado na tela, na página pública e na impressão.

function Cell({ label, value, className = '', valueClass = '' }: { label: string; value: React.ReactNode; className?: string; valueClass?: string }) {
  return (
    <div className={`border-r border-b border-slate-400 px-1.5 py-0.5 ${className}`}>
      <div className="text-[7px] leading-tight text-slate-500 uppercase">{label}</div>
      <div className={`text-[11px] leading-tight text-slate-900 ${valueClass}`}>{value || ' '}</div>
    </div>
  )
}

function Segment({ v, title }: { v: BoletoView; title: string }) {
  return (
    <div className="border border-slate-400 bg-white">
      {/* cabeçalho: logo do banco + código + linha digitável */}
      <div className="flex items-stretch border-b-2 border-slate-800">
        <div className="flex items-center gap-2 px-3 py-1 border-r-2 border-slate-800">
          <SicoobLogo />
        </div>
        <div className="flex items-center justify-center px-3 border-r-2 border-slate-800">
          <span className="text-lg font-black text-slate-900">{v.bancoCodigo}</span>
        </div>
        <div className="flex-1 flex items-center justify-end px-3">
          <span className="text-[13px] font-bold tracking-tight text-slate-900 tabular-nums">{v.linhaDigitavel}</span>
        </div>
      </div>
      <div className="text-[8px] text-slate-500 px-2 pt-0.5 uppercase">{title}</div>

      {/* grade de campos */}
      <div className="grid grid-cols-[1fr_140px] border-t border-slate-400">
        <Cell label="Beneficiário" value={<span>{v.beneficiarioNome}{v.beneficiarioDoc ? `  ·  ${v.beneficiarioDoc}` : ''}{v.beneficiarioEndereco ? <div className="text-[8px] text-slate-500">{v.beneficiarioEndereco}</div> : null}</span>} />
        <Cell label="Vencimento" value={<strong>{v.vencimentoFmt}</strong>} className="border-r-0" valueClass="text-right font-bold" />
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_140px]">
        <Cell label="Agência / Código" value={v.agenciaCodigo} />
        <Cell label="Espécie" value={v.especie} />
        <Cell label="Quantidade" value="" />
        <Cell label="Nosso Número" value={v.nossoNumero} valueClass="font-semibold" />
        <Cell label="(=) Valor do Documento" value={v.valorFmt} className="border-r-0" valueClass="text-right font-bold" />
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_140px]">
        <Cell label="Nº do Documento" value={v.seuNumero} />
        <Cell label="Data do Documento" value={v.documentoData} />
        <Cell label="Carteira" value={v.carteira} />
        <Cell label="Espécie Doc." value={v.especie} />
        <Cell label="(-) Descontos" value="" className="border-r-0" valueClass="text-right" />
      </div>
      <div className="grid grid-cols-[1fr_140px]">
        <div className="border-r border-b border-slate-400 px-1.5 py-0.5 row-span-2">
          <div className="text-[7px] text-slate-500 uppercase">Instruções (texto de responsabilidade do beneficiário)</div>
          {v.instrucoes.length ? v.instrucoes.map((m, i) => <div key={i} className="text-[9px] text-slate-800 leading-snug">{m}</div>) : <div className="text-[9px] text-slate-300">—</div>}
        </div>
        <Cell label="(+) Mora / Multa" value="" className="border-r-0" valueClass="text-right" />
      </div>
      <div className="grid grid-cols-[1fr_140px]">
        <div />
        <Cell label="(=) Valor Cobrado" value="" className="border-r-0" valueClass="text-right" />
      </div>

      <div className="grid grid-cols-[1fr_140px] border-t border-slate-400">
        <Cell label="Pagador" value={<span>{v.pagadorNome}{v.pagadorDoc ? `  ·  ${v.pagadorDoc}` : ''}</span>} className="border-b-0" />
        <Cell label="" value="" className="border-r-0 border-b-0" />
      </div>
    </div>
  )
}

export default function BoletoDocument({ view }: { view: BoletoView }) {
  return (
    <div className="mx-auto bg-white text-slate-900" style={{ width: 680, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {view.sandbox && (
        <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-widest text-amber-600">Ambiente de testes — boleto sem valor fiscal</div>
      )}
      <Segment v={view} title="Recibo do Pagador" />
      <div className="my-2 border-t border-dashed border-slate-400 text-right text-[7px] text-slate-400 uppercase">✂ corte na linha pontilhada — Ficha de Compensação</div>
      <Segment v={view} title="Ficha de Compensação" />

      {/* código de barras */}
      {view.barcodeSvg
        ? <div className="mt-2 h-[52px] w-full" dangerouslySetInnerHTML={{ __html: view.barcodeSvg.replace('<svg ', '<svg style="width:100%;height:52px" ') }} />
        : <div className="mt-2 text-[9px] text-slate-400">Código de barras indisponível.</div>}
    </div>
  )
}
