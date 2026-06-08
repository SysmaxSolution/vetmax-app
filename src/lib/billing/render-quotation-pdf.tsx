import 'server-only'

/**
 * Layout fixo Sysmax do documento de Faturamento (Orçamento de Serviços).
 *
 * PDF VETORIAL via @react-pdf/renderer — texto selecionável, multipágina
 * automática (sem html2canvas/jsPDF). Renderiza server-side para Buffer.
 *
 * Requisitos fixos (decisão 08/06): data + hora de impressão no topo direito
 * junto à margem; rodapé "Desenvolvido por Sysmax Software". Layout único,
 * usado por todas as clínicas, exibido só quando o módulo Faturamento ativo.
 */

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import type { BillingDocumentDetail } from '@/lib/actions/billing-documents'

export interface QuotationPdfData {
  doc:     BillingDocumentDetail
  clinic:  {
    name?: string; cnpj?: string; phone?: string; address?: string
    city?: string; state?: string; cep?: string; neighborhood?: string; logo_url?: string
  }
  tutor:   {
    name?: string; cpf?: string; phone?: string; email?: string; address?: string; cep?: string
    street?: string; neighborhood?: string; city?: string; state?: string
    address_number?: string; address_complement?: string
  } | null
  patient: {
    name?: string; species?: string; breed?: string; gender?: string
    birth_date?: string; coat_color?: string; last_known_weight?: number
  } | null
  professional: { full_name?: string; crmv?: string } | null
}

const BRL = (v: number) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const SPECIES: Record<string, string> = {
  dog: 'Canino', cat: 'Felino', bird: 'Ave', rabbit: 'Coelho', rodent: 'Roedor',
  reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}
const GENDER: Record<string, string> = { male: 'Macho', female: 'Fêmea' }

function ageOf(birth?: string): string {
  if (!birth) return '—'
  const b = new Date(birth); if (Number.isNaN(b.getTime())) return '—'
  const months = (Date.now() - b.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  if (months < 12) return `${Math.max(0, Math.floor(months))} meses`
  return `${Math.floor(months / 12)} ano(s)`
}

const styles = StyleSheet.create({
  page:       { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 34, fontSize: 9, fontFamily: 'Helvetica', color: '#1e293b' },
  printStamp: { position: 'absolute', top: 12, right: 34, fontSize: 7, color: '#94a3b8' },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: '#16a34a', paddingBottom: 8, marginBottom: 10 },
  logo:       { width: 54, height: 54, objectFit: 'contain', marginRight: 10 },
  clinicName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  clinicMeta: { fontSize: 8, color: '#475569', marginTop: 2 },
  docBadge:   { alignItems: 'flex-end' },
  docType:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#16a34a' },
  docNumber:  { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  docDate:    { fontSize: 8, color: '#64748b', marginTop: 2 },
  section:    { marginBottom: 9, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 8 },
  sectionTitle:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#16a34a', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  row:        { flexDirection: 'row', flexWrap: 'wrap' },
  field:      { width: '50%', marginBottom: 2, flexDirection: 'row' },
  fieldFull:  { width: '100%', marginBottom: 2, flexDirection: 'row' },
  label:      { fontFamily: 'Helvetica-Bold', color: '#475569' },
  value:      { color: '#0f172a' },
  // tabela
  tHead:      { flexDirection: 'row', backgroundColor: '#16a34a', color: '#ffffff', paddingVertical: 4, paddingHorizontal: 4, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tRow:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 4, paddingHorizontal: 4 },
  tRowAlt:    { backgroundColor: '#f8fafc' },
  cDesc:      { width: '52%' },
  cQty:       { width: '12%', textAlign: 'center' },
  cUnit:      { width: '18%', textAlign: 'right' },
  cTotal:     { width: '18%', textAlign: 'right' },
  totalBar:   { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalBox:   { backgroundColor: '#0f172a', color: '#ffffff', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 4 },
  totalLabel: { fontSize: 8, color: '#cbd5e1' },
  totalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  signature:  { marginTop: 34, alignItems: 'center' },
  sigLine:    { borderTopWidth: 1, borderTopColor: '#94a3b8', width: 220, marginBottom: 3 },
  sigName:    { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  sigCrmv:    { fontSize: 8, color: '#64748b' },
  footer:     { position: 'absolute', bottom: 18, left: 34, right: 34, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#94a3b8' },
  footerBrand:{ fontSize: 7, color: '#16a34a', fontFamily: 'Helvetica-Bold' },
  validity:   { fontSize: 8, color: '#b45309', marginTop: 4 },
})

function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <View style={full ? styles.fieldFull : styles.field}>
      <Text style={styles.label}>{label}: </Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  )
}

function tutorAddress(t: QuotationPdfData['tutor']): string {
  if (!t) return ''
  const street = [t.street || t.address, t.address_number].filter(Boolean).join(', ')
  const parts = [street, t.neighborhood, [t.city, t.state].filter(Boolean).join('/'), t.cep ? `CEP ${t.cep}` : null]
  return parts.filter(Boolean).join(' · ')
}

function QuotationDocument({ data }: { data: QuotationPdfData }) {
  const { doc, clinic, tutor, patient, professional } = data
  const printStamp = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const issue = new Date(doc.issue_date).toLocaleDateString('pt-BR')
  const docTypeLabel = doc.doc_type === 'nfse' ? 'NOTA FISCAL DE SERVIÇO' : 'ORÇAMENTO DE SERVIÇOS'

  // formas de pagamento / descontos vindas do snapshot (opcionais)
  const payment = (doc.payload?.payment_methods as string | undefined) ?? null
  const discount = (doc.payload?.discount_note as string | undefined) ?? null
  const observations = (doc.payload?.observations as string | undefined) ?? null

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* data/hora de impressão — topo direito junto à margem (requisito fixo) */}
        <Text style={styles.printStamp} fixed>Impresso em {printStamp}</Text>

        {/* Cabeçalho */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', maxWidth: '62%' }}>
            {clinic.logo_url ? <Image style={styles.logo} src={clinic.logo_url} /> : null}
            <View>
              <Text style={styles.clinicName}>{clinic.name || 'Clínica Veterinária'}</Text>
              {clinic.cnpj ? <Text style={styles.clinicMeta}>CNPJ: {clinic.cnpj}</Text> : null}
              {clinic.phone ? <Text style={styles.clinicMeta}>Tel: {clinic.phone}</Text> : null}
              {clinic.address ? (
                <Text style={styles.clinicMeta}>
                  {[clinic.address, clinic.neighborhood, [clinic.city, clinic.state].filter(Boolean).join('/'), clinic.cep ? `CEP ${clinic.cep}` : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.docBadge}>
            <Text style={styles.docType}>{docTypeLabel}</Text>
            <Text style={styles.docNumber}>Nº {doc.doc_number}</Text>
            <Text style={styles.docDate}>Emissão: {issue}</Text>
            {doc.valid_until ? (
              <Text style={styles.validity}>Válido até {new Date(doc.valid_until).toLocaleDateString('pt-BR')}</Text>
            ) : null}
          </View>
        </View>

        {/* Animal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Animal</Text>
          <View style={styles.row}>
            <Field label="Nome" value={patient?.name} />
            <Field label="Espécie" value={patient?.species ? (SPECIES[patient.species] ?? patient.species) : null} />
            <Field label="Raça" value={patient?.breed} />
            <Field label="Sexo" value={patient?.gender ? (GENDER[patient.gender] ?? patient.gender) : null} />
            <Field label="Idade" value={ageOf(patient?.birth_date)} />
            <Field label="Peso" value={patient?.last_known_weight ? `${patient.last_known_weight} kg` : null} />
          </View>
        </View>

        {/* Responsável */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Responsável</Text>
          <View style={styles.row}>
            <Field label="Nome" value={tutor?.name} />
            <Field label="CPF" value={tutor?.cpf} />
            <Field label="Telefone" value={tutor?.phone} />
            <Field label="E-mail" value={tutor?.email} />
            <Field label="Endereço" value={tutorAddress(tutor)} full />
          </View>
        </View>

        {/* Tabela de Serviços */}
        <Text style={styles.sectionTitle}>Serviços / Itens ({doc.items.length})</Text>
        <View style={styles.tHead}>
          <Text style={styles.cDesc}>Serviço</Text>
          <Text style={styles.cQty}>Qtd</Text>
          <Text style={styles.cUnit}>Valor Unit.</Text>
          <Text style={styles.cTotal}>Subtotal</Text>
        </View>
        {doc.items.map((it, idx) => (
          <View key={it.id ?? idx} style={[styles.tRow, ...(idx % 2 ? [styles.tRowAlt] : [])]} wrap={false}>
            <Text style={styles.cDesc}>{it.description}</Text>
            <Text style={styles.cQty}>{Number(it.quantity).toLocaleString('pt-BR')}</Text>
            <Text style={styles.cUnit}>{BRL(it.unit_price)}</Text>
            <Text style={styles.cTotal}>{BRL(it.total_price)}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalBar}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>VALOR TOTAL</Text>
            <Text style={styles.totalValue}>{BRL(doc.total_amount)}</Text>
          </View>
        </View>

        {/* Formas de pagamento / descontos / observações (snapshot) */}
        {(payment || discount || observations) ? (
          <View style={[styles.section, { marginTop: 8 }]}>
            <Text style={styles.sectionTitle}>Condições</Text>
            {payment ?      <Field label="Formas de pagamento" value={payment} full /> : null}
            {discount ?     <Field label="Descontos" value={discount} full /> : null}
            {observations ? <Field label="Observações" value={observations} full /> : null}
          </View>
        ) : null}

        {/* Assinatura do profissional */}
        <View style={styles.signature}>
          <View style={styles.sigLine} />
          <Text style={styles.sigName}>{professional?.full_name || 'Profissional responsável'}</Text>
          {professional?.crmv ? <Text style={styles.sigCrmv}>CRMV {professional.crmv}</Text> : null}
        </View>

        {/* Rodapé fixo (requisito) */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {[clinic.name, clinic.phone].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.footerBrand}>Desenvolvido por Sysmax Software</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderQuotationPdfBuffer(data: QuotationPdfData): Promise<Buffer> {
  const buf = await renderToBuffer(<QuotationDocument data={data} />)
  return buf as Buffer
}
