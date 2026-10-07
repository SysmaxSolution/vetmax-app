// Esquemas das entradas que mexem com dinheiro e documento fiscal.
//
// Deliberadamente NÃO usam `.strict()`: a tela manda campos a mais em vários
// fluxos e recusar por isso quebraria o que hoje funciona. O que estes
// esquemas garantem é que o que CHEGA ao banco tem forma válida — valor
// finito, positivo, com 2 casas; data que existe; id que é uuid; documento
// fiscal com dígito conferido.
//
// A autorização (de qual clínica é este dado, quem pode fazer isto) NÃO está
// aqui — continua em cada action, com clinic_id do servidor e RLS.

import { z } from 'zod'
import { zDinheiro, zDinheiroOuZero, zDataISO, zUuid, zTexto, zCpfCnpj, zParcela } from './primitivos'

/** Aceita id opcional que a tela manda como '' quando o campo está vazio. */
const zUuidOpcional = z.preprocess(
  v => (v === '' || v === null ? undefined : v),
  zUuid.optional(),
)

const zTextoOpcional = (max: number) => z.preprocess(
  v => (v === '' || v === null ? undefined : v),
  z.string().trim().max(max).optional(),
)

const zDataOpcional = z.preprocess(
  v => (v === '' || v === null ? undefined : v),
  zDataISO.optional(),
)

// ─── financial.createEntry ────────────────────────────────────────────────────

export const EsquemaCriarTitulo = z.object({
  type:                 z.enum(['receivable', 'payable']),
  description:          zTexto(500, 'Descrição'),
  amount:               zDinheiro,
  due_date:             zDataISO,
  issue_date:           zDataOpcional,
  discount:             zDinheiroOuZero.optional(),
  payment_method:       zTextoOpcional(60),
  tutor_id:             zUuidOpcional,
  patient_id:           zUuidOpcional,
  category:             zTextoOpcional(100),
  notes:                zTextoOpcional(2000),
  professional_id:      zUuidOpcional,
  chart_of_accounts_id: zUuidOpcional,
  beneficiary:          zTextoOpcional(255),
  supplier_id:          zUuidOpcional,
  purchase_order_id:    zUuidOpcional,
  document_number:      zTextoOpcional(60),
  especie:              zTextoOpcional(20),
  installment_number:   zParcela.nullish(),
  total_installments:   zParcela.nullish(),
})
  // Desconto maior que o valor inverteria o sinal do título.
  .refine(d => (d.discount ?? 0) <= d.amount, {
    message: 'Desconto não pode ser maior que o valor do título.', path: ['discount'],
  })
  // Parcela 3 de 2 não existe.
  .refine(d => !d.installment_number || !d.total_installments || d.installment_number <= d.total_installments, {
    message: 'Número da parcela não pode ser maior que o total de parcelas.', path: ['installment_number'],
  })

/** Edição: mesmos campos, todos opcionais, mas cada um ainda validado. */
export const EsquemaAtualizarTitulo = z.object({
  type:                 z.enum(['receivable', 'payable']).optional(),
  description:          zTexto(500, 'Descrição').optional(),
  amount:               zDinheiro.optional(),
  due_date:             zDataISO.optional(),
  issue_date:           zDataOpcional,
  discount:             zDinheiroOuZero.optional(),
  payment_method:       zTextoOpcional(60),
  tutor_id:             zUuidOpcional,
  patient_id:           zUuidOpcional,
  category:             zTextoOpcional(100),
  notes:                zTextoOpcional(2000),
  professional_id:      zUuidOpcional,
  chart_of_accounts_id: zUuidOpcional,
  beneficiary:          zTextoOpcional(255),
  supplier_id:          zUuidOpcional,
  purchase_order_id:    zUuidOpcional,
  document_number:      zTextoOpcional(60),
  especie:              zTextoOpcional(20),
  installment_number:   zParcela.nullish(),
  total_installments:   zParcela.nullish(),
})

// ─── financial.baixarTitulo ───────────────────────────────────────────────────

export const EsquemaBaixarTitulo = z.object({
  payment_date:        zDataISO,
  payment_method:      zTexto(60, 'Modalidade de recebimento'),
  settlement_bank_id:  zUuidOpcional,
  interest:            zDinheiroOuZero.optional(),
  discount:            zDinheiroOuZero.optional(),
  amount_received:     zDinheiroOuZero.optional(),
})

// ─── cashier-manual.recordManualInflow ────────────────────────────────────────

export const EsquemaEntradaManual = z.object({
  amount:         zDinheiro,
  reason:         zTexto(255, 'Motivo'),
  payment_method: zTextoOpcional(60),
  effective_date: zDataOpcional,
})

// ─── sales.createSale ─────────────────────────────────────────────────────────

const EsquemaItemVenda = z.object({
  stock_item_id: zUuidOpcional.nullish(),
  description:   zTexto(255, 'Descrição do item'),
  quantity:      z.coerce.number().positive('Quantidade deve ser maior que zero.'),
  unit_price:    zDinheiroOuZero,
  discount:      zDinheiroOuZero,
})

const EsquemaSplit = z.object({
  amount:              zDinheiro,
  payment_method:      zTexto(60, 'Forma de pagamento'),
  payment_card_id:     zUuidOpcional.nullish(),
  installments:        zParcela.optional(),
  card_acquirer:       zTextoOpcional(60).nullish(),
  card_brand:          zTextoOpcional(40).nullish(),
  card_nsu:            zTextoOpcional(60).nullish(),
  card_authorization:  zTextoOpcional(60).nullish(),
  transaction_date:    zDataOpcional.nullish(),
})

export const EsquemaCriarVenda = z.object({
  clinic_id:       zUuid,
  items:           z.array(EsquemaItemVenda).min(1, 'Adicione pelo menos um item à venda.'),
  payment_method:  z.enum(['cash', 'credit', 'debit', 'pix', 'convenio', 'other']),
  discount_amount: zDinheiroOuZero.optional(),
  tutor_id:        zUuidOpcional.nullish(),
  consultation_id: zUuidOpcional.nullish(),
  patient_id:      zUuidOpcional.nullish(),
  notes:           zTextoOpcional(2000).nullish(),
  splits:          z.array(EsquemaSplit).optional(),
})
  // Desconto acima do bruto deixaria a venda negativa.
  .refine(d => {
    const bruto = d.items.reduce((s, i) => s + i.quantity * i.unit_price - i.discount, 0)
    return (d.discount_amount ?? 0) <= bruto + 0.005
  }, { message: 'Desconto não pode ser maior que o total da venda.', path: ['discount_amount'] })

// ─── Documento fiscal ─────────────────────────────────────────────────────────

/**
 * CNPJ/CPF do emitente ou do tomador da NFS-e. Documento errado aqui volta
 * como rejeição da prefeitura, depois da nota já ter sido numerada.
 */
export const EsquemaDocumentoFiscal = z.object({
  cnpj:               zCpfCnpj,
  inscricao_municipal: zTextoOpcional(30),
  razao_social:        zTexto(255, 'Razão social'),
})
