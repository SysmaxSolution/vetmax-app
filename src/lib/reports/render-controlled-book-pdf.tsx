import 'server-only'

// Livro de Controlados em PDF — layout do Livro de Registro Específico
// (Portaria SVS/MS 344/1998): uma folha por medicamento, com DATA, HISTÓRICO
// (Pet-Responsável, Procedimento, Nº OS), MOVIMENTO (Entrada, Saída, Perdas),
// ESTOQUE, ASSINATURA DO RESPONSÁVEL TÉCNICO e OBSERVAÇÕES. A4 paisagem.
//
// Mesma fonte dos dados do Excel (src/lib/controlled/livro-fiscal.ts), para o
// que a Vigilância recebe impresso bater com a planilha.

import React from 'react'
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { ControlledBook } from '@/types/controlled-book'
import { montarFolha, montarResumo, montarPerdas, todosOsItens, dataBR, dataHoraBR, type FolhaLivro } from '@/lib/controlled/livro-fiscal'

const s = StyleSheet.create({
  page:      { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 28, fontSize: 7.5, fontFamily: 'Helvetica', color: '#172322' },
  titulo:    { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sub:       { fontSize: 7.5, color: '#4A5A58', marginBottom: 1 },
  bloco:     { marginBottom: 8, paddingBottom: 6, borderBottomWidth: 0.8, borderBottomColor: '#BFC7CE' },
  tabela:    { width: '100%' },
  linha:     { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#D5DBE0', minHeight: 13 },
  cab:       { flexDirection: 'row', backgroundColor: '#E7EBEF', borderBottomWidth: 0.8, borderBottomColor: '#9AA6AE' },
  cabTxt:    { fontFamily: 'Helvetica-Bold', fontSize: 6.8, textAlign: 'center' },
  cel:       { paddingVertical: 2.5, paddingHorizontal: 3, borderRightWidth: 0.5, borderRightColor: '#D5DBE0' },
  num:       { textAlign: 'right' },
  saldoAnt:  { backgroundColor: '#F4F6F8', fontFamily: 'Helvetica-Oblique', color: '#4A5A58' },
  totais:    { backgroundColor: '#E7EBEF', fontFamily: 'Helvetica-Bold' },
  rodape:    { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: '#6B7280' },
  assinatura:{ marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end' },
  assLinha:  { width: 220, borderTopWidth: 0.8, borderTopColor: '#172322', paddingTop: 3, fontSize: 7, textAlign: 'center', color: '#4A5A58' },
})

// largura das 10 colunas (soma 100)
const W = [7, 16, 20, 6, 6.5, 6.5, 6, 7, 10, 15]
const col = (i: number, extra?: object) => ({ width: `${W[i]}%`, ...s.cel, ...(extra ?? {}) })

const fmt = (v: number | null | undefined) => v == null ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function Cabecalho({ book }: { book: ControlledBook }) {
  const c = book.clinic
  const endereco = [c.address, c.city && c.state ? `${c.city}/${c.state}` : (c.city ?? c.state), c.cep ? `CEP ${c.cep}` : null].filter(Boolean).join(' · ')
  return (
    <View style={s.bloco}>
      <Text style={s.titulo}>Livro de Registro Específico de Medicamentos Sujeitos a Controle Especial</Text>
      <Text style={s.sub}>{c.name}{c.cnpj ? ` · CNPJ ${c.cnpj}` : ''}{endereco ? ` · ${endereco}` : ''}</Text>
      <Text style={s.sub}>Responsável técnico: {c.technical_responsible_name ?? '—'}{c.technical_responsible_crmv ? ` · ${c.technical_responsible_crmv}` : ''} · Período: {dataBR(book.from)} a {dataBR(book.to)} · Portaria SVS/MS 344/1998</Text>
    </View>
  )
}

function Rodape({ book }: { book: ControlledBook }) {
  const g = dataHoraBR(book.generated_at)
  return (
    <View style={s.rodape} fixed>
      <Text>Gerado pelo SYSVETMAX em {g.data} {g.hora}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

function FolhaMedicamento({ book, folha }: { book: ControlledBook; folha: FolhaLivro }) {
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <Cabecalho book={book} />
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>
        {folha.substancia.toUpperCase()}{folha.concentracao ? ` (${folha.concentracao})` : ''} — unidade: {folha.unidade}{folha.classe ? ` — lista ${folha.classe}` : ''} — forma farmacêutica {folha.uso}
      </Text>
      <View style={s.tabela}>
        <View style={s.cab} fixed>
          <View style={col(0)}><Text style={s.cabTxt}>DATA</Text></View>
          <View style={col(1)}><Text style={s.cabTxt}>HISTÓRICO{'\n'}Pet-Responsável</Text></View>
          <View style={col(2)}><Text style={s.cabTxt}>{'\n'}Procedimento</Text></View>
          <View style={col(3)}><Text style={s.cabTxt}>{'\n'}N. OS</Text></View>
          <View style={col(4)}><Text style={s.cabTxt}>MOVIMENTO{'\n'}Entrada</Text></View>
          <View style={col(5)}><Text style={s.cabTxt}>{'\n'}Saída</Text></View>
          <View style={col(6)}><Text style={s.cabTxt}>{'\n'}Perdas</Text></View>
          <View style={col(7)}><Text style={s.cabTxt}>ESTOQUE</Text></View>
          <View style={col(8)}><Text style={s.cabTxt}>ASSINATURA DO{'\n'}RESP. TÉCNICO</Text></View>
          <View style={col(9, { borderRightWidth: 0 })}><Text style={s.cabTxt}>OBSERVAÇÕES</Text></View>
        </View>
        <View style={[s.linha, s.saldoAnt]} wrap={false}>
          <View style={{ width: `${W[0] + W[1] + W[2] + W[3] + W[4] + W[5] + W[6]}%`, ...s.cel }}><Text>Saldo anterior em {dataBR(book.from)}</Text></View>
          <View style={col(7)}><Text style={[s.num, { fontFamily: 'Helvetica-Bold' }]}>{fmt(folha.saldo_anterior)}</Text></View>
          <View style={col(8)}><Text> </Text></View>
          <View style={col(9, { borderRightWidth: 0 })}><Text> </Text></View>
        </View>
        {folha.linhas.map((l, i) => (
          <View key={i} style={s.linha} wrap={false}>
            <View style={col(0)}><Text>{l.data}{l.hora && l.hora !== '08:00' ? `\n${l.hora}` : ''}</Text></View>
            <View style={col(1)}><Text>{l.pet_responsavel}</Text></View>
            <View style={col(2)}><Text>{l.procedimento}</Text></View>
            <View style={col(3)}><Text>{l.os}</Text></View>
            <View style={col(4)}><Text style={s.num}>{fmt(l.entrada)}</Text></View>
            <View style={col(5)}><Text style={s.num}>{fmt(l.saida)}</Text></View>
            <View style={col(6)}><Text style={s.num}>{fmt(l.perdas)}</Text></View>
            <View style={col(7)}><Text style={[s.num, { fontFamily: 'Helvetica-Bold' }]}>{fmt(l.estoque)}</Text></View>
            <View style={col(8)}><Text> </Text></View>
            <View style={col(9, { borderRightWidth: 0 })}><Text>{[l.observacoes, l.responsavel ? `Reg.: ${l.responsavel}` : null].filter(Boolean).join(' · ')}</Text></View>
          </View>
        ))}
        <View style={[s.linha, s.totais]} wrap={false}>
          <View style={{ width: `${W[0] + W[1] + W[2] + W[3]}%`, ...s.cel }}><Text>Totais do período</Text></View>
          <View style={col(4)}><Text style={s.num}>{fmt(folha.total_entradas)}</Text></View>
          <View style={col(5)}><Text style={s.num}>{fmt(folha.total_saidas)}</Text></View>
          <View style={col(6)}><Text style={s.num}>{fmt(folha.total_perdas)}</Text></View>
          <View style={col(7)}><Text style={s.num}>{fmt(folha.saldo_final)}</Text></View>
          <View style={col(8)}><Text> </Text></View>
          <View style={col(9, { borderRightWidth: 0 })}><Text>Saldo final em {dataBR(book.to)}</Text></View>
        </View>
      </View>
      <View style={s.assinatura} wrap={false}>
        <Text style={s.assLinha}>{book.clinic.technical_responsible_name ?? 'Responsável Técnico'}{book.clinic.technical_responsible_crmv ? ` · ${book.clinic.technical_responsible_crmv}` : ''}</Text>
      </View>
      <Rodape book={book} />
    </Page>
  )
}

function PaginaResumo({ book }: { book: ControlledBook }) {
  const resumo = montarResumo(book)
  const perdas = montarPerdas(book)
  const WR = [28, 10, 12, 12, 12, 12, 14]
  const colR = (i: number, extra?: object) => ({ width: `${WR[i]}%`, ...s.cel, ...(extra ?? {}) })
  const WP = [12, 22, 10, 8, 26, 22]
  const colP = (i: number, extra?: object) => ({ width: `${WP[i]}%`, ...s.cel, ...(extra ?? {}) })
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <Cabecalho book={book} />
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Resumo de saldos do período</Text>
      <View style={s.tabela}>
        <View style={s.cab}>
          {['Medicamento', 'Unidade', 'Saldo inicial', 'Entradas', 'Saídas', 'Perdas', 'Saldo final'].map((t, i) => (
            <View key={t} style={colR(i, i === 6 ? { borderRightWidth: 0 } : undefined)}><Text style={s.cabTxt}>{t}</Text></View>
          ))}
        </View>
        {resumo.map(r => (
          <View key={r.medicamento} style={s.linha} wrap={false}>
            <View style={colR(0)}><Text>{r.medicamento}</Text></View>
            <View style={colR(1)}><Text>{r.unidade}</Text></View>
            <View style={colR(2)}><Text style={s.num}>{fmt(r.saldo_inicial)}</Text></View>
            <View style={colR(3)}><Text style={s.num}>{fmt(r.entradas)}</Text></View>
            <View style={colR(4)}><Text style={s.num}>{fmt(r.saidas)}</Text></View>
            <View style={colR(5)}><Text style={s.num}>{fmt(r.perdas)}</Text></View>
            <View style={colR(6, { borderRightWidth: 0 })}><Text style={[s.num, { fontFamily: 'Helvetica-Bold' }]}>{fmt(r.saldo_final)}</Text></View>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 4 }}>Perdas e inutilizações</Text>
      {perdas.length === 0 ? <Text style={s.sub}>Nenhuma perda registrada no período.</Text> : (
        <View style={s.tabela}>
          <View style={s.cab}>
            {['Data', 'Medicamento', 'Quantidade', 'Unidade', 'Motivo', 'Responsável'].map((t, i) => (
              <View key={t} style={colP(i, i === 5 ? { borderRightWidth: 0 } : undefined)}><Text style={s.cabTxt}>{t}</Text></View>
            ))}
          </View>
          {perdas.map((p, i) => (
            <View key={i} style={s.linha} wrap={false}>
              <View style={colP(0)}><Text>{p.data} {p.hora}</Text></View>
              <View style={colP(1)}><Text>{p.medicamento}</Text></View>
              <View style={colP(2)}><Text style={s.num}>{fmt(p.quantidade)}</Text></View>
              <View style={colP(3)}><Text>{p.unidade}</Text></View>
              <View style={colP(4)}><Text>{p.motivo}{p.observacoes ? ` · ${p.observacoes}` : ''}</Text></View>
              <View style={colP(5, { borderRightWidth: 0 })}><Text>{p.responsavel}</Text></View>
            </View>
          ))}
        </View>
      )}
      <Rodape book={book} />
    </Page>
  )
}

export async function renderLivroControladosPdfBuffer(book: ControlledBook): Promise<Buffer> {
  const itens = todosOsItens(book)
  const doc = (
    <Document title={`Livro de Controlados — ${book.clinic.name} — ${dataBR(book.from)} a ${dataBR(book.to)}`} author="SYSVETMAX">
      <PaginaResumo book={book} />
      {itens.map(item => <FolhaMedicamento key={item.stock_item_id} book={book} folha={montarFolha(item)} />)}
    </Document>
  )
  return Buffer.from(await renderToBuffer(doc))
}
