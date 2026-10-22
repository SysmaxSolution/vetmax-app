// Monta os dados de exibição do boleto (layout bancário) a partir do registro
// persistido + config da carteira. Puro (gera a linha formatada + SVG do barcode).
import { formatLinhaDigitavel } from './febraban'
import { barcodeSvg } from './barcode'

export interface BoletoRowLike {
  seu_numero: string; nosso_numero: string | null; nosso_numero_dv: string | null
  valor: number; vencimento: string; linha_digitavel: string | null; codigo_barras: string | null
  pagador_nome: string | null; pagador_cpf_cnpj: string | null; environment: string
  created_at?: string; situacao?: string; public_token?: string | null
}
export interface BoletoConfigLike {
  agencia?: string; conta?: string; contaDv?: string; carteira?: string; modalidade?: string; codigoCliente?: string
  instrucaoCodigo?: string; mensagens?: string[]; especie?: string
  beneficiarioNome?: string; beneficiarioDoc?: string; beneficiarioEndereco?: string
}

export interface BoletoView {
  bancoNome: string; bancoCodigo: string
  linhaDigitavel: string; codigoBarras: string; barcodeSvg: string
  beneficiarioNome: string; beneficiarioDoc: string; beneficiarioEndereco: string
  agenciaCodigo: string; carteira: string; especie: string
  pagadorNome: string; pagadorDoc: string
  nossoNumero: string; seuNumero: string
  valor: number; valorFmt: string; vencimento: string; vencimentoFmt: string
  documentoData: string; instrucoes: string[]
  environment: string; sandbox: boolean
  publicToken: string | null
}

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFmt = (iso: string | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const maskDoc = (d: string | null | undefined) => {
  const s = (d ?? '').replace(/\D/g, '')
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return s
}

export function buildBoletoView(row: BoletoRowLike, cfg: BoletoConfigLike): BoletoView {
  const barras = (row.codigo_barras ?? '').replace(/\D/g, '')
  const linhaRaw = (row.linha_digitavel ?? '').replace(/\D/g, '')
  return {
    bancoNome: 'SICOOB', bancoCodigo: '756-0',
    linhaDigitavel: linhaRaw.length === 47 ? formatLinhaDigitavel(linhaRaw) : linhaRaw,
    codigoBarras: barras,
    barcodeSvg: barras.length === 44 ? barcodeSvg(barras, { moduleWidth: 1, height: 50 }) : '',
    beneficiarioNome: cfg.beneficiarioNome || '—',
    beneficiarioDoc: maskDoc(cfg.beneficiarioDoc),
    beneficiarioEndereco: cfg.beneficiarioEndereco || '',
    agenciaCodigo: `${cfg.agencia ?? '----'} / ${cfg.codigoCliente ?? '----'}`,
    carteira: cfg.carteira ?? '1',
    especie: cfg.especie || 'DM',
    pagadorNome: row.pagador_nome || '—',
    pagadorDoc: maskDoc(row.pagador_cpf_cnpj),
    nossoNumero: row.nosso_numero_dv || row.nosso_numero || '—',
    seuNumero: row.seu_numero,
    valor: row.valor, valorFmt: money(row.valor),
    vencimento: row.vencimento, vencimentoFmt: dateFmt(row.vencimento),
    documentoData: dateFmt(row.created_at),
    instrucoes: (cfg.mensagens ?? []).filter(Boolean),
    environment: row.environment, sandbox: row.environment !== 'production',
    publicToken: row.public_token ?? null,
  }
}
