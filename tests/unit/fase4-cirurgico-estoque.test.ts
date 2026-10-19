// Fase 4 — regras de conferência do kit, reposição de estoque e gate
// pré-anestésico. São as três decisões que mexem em dinheiro e em segurança do
// paciente: o que volta para a prateleira, o que se compra e quando, e o que
// impede um animal de entrar na sala.

import {
  conferirDevolucaoDoKit,
  resumirConferencia,
  type ItemAplicado,
} from '@/lib/stock/kit-conferencia'
import {
  sugerirCompra,
  ordenarSugestoes,
  alertasDeValidade,
  descreverValidade,
  diasEntre,
  PARAMETROS_PADRAO,
  type ItemParaRepor,
  type LoteComValidade,
} from '@/lib/stock/reposicao'
import {
  avaliarGate,
  lerConfigGate,
  CONFIG_GATE_PADRAO,
  ROTULO_EXIGENCIA,
} from '@/lib/surgery/gate-preanestesico'

// ─── 4.1 conferência do kit ─────────────────────────────────────────────────

const compressa: ItemAplicado = {
  id: 'i1', item_name: 'Compressa estéril', unit: 'un',
  quantity_planned: 10, unit_price: 2.5, returnable: true,
}
const frasco: ItemAplicado = {
  id: 'i2', item_name: 'Propofol 20ml', unit: 'ml',
  quantity_planned: 20, unit_price: 3, returnable: false,
}

describe('conferência da devolução do kit (item 4.1)', () => {
  it('sem marcação nenhuma, entende que tudo foi usado', () => {
    const r = conferirDevolucaoDoKit([compressa], [])
    expect(r.linhas[0].consumido).toBe(10)
    expect(r.total_devolvido).toBe(0)
    expect(r.total_abatimento).toBe(0)
    expect(r.avisos).toEqual([])
  })

  it('devolve o que voltou fechado e abate da conta do tutor', () => {
    const r = conferirDevolucaoDoKit([compressa], [{ item_id: 'i1', devolvido: 4 }])
    expect(r.linhas[0].devolvido).toBe(4)
    expect(r.linhas[0].consumido).toBe(6)
    expect(r.total_abatimento).toBe(10) // 4 × 2,50
  })

  it('item que não volta depois de aberto vira perda, não devolução', () => {
    const r = conferirDevolucaoDoKit([frasco], [{ item_id: 'i2', devolvido: 12 }])
    expect(r.linhas[0].devolvido).toBe(0)
    expect(r.linhas[0].perdido).toBe(12)
    expect(r.avisos[0]).toContain('não volta ao estoque')
  })

  it('marcação maior do que saiu é ajustada, e o ajuste é avisado', () => {
    const r = conferirDevolucaoDoKit([compressa], [{ item_id: 'i1', devolvido: 25 }])
    expect(r.linhas[0].devolvido).toBe(10)
    expect(r.linhas[0].consumido).toBe(0)
    expect(r.avisos[0]).toContain('passava do que saiu')
  })

  it('devolução e perda juntas não passam do que saiu', () => {
    const r = conferirDevolucaoDoKit([compressa], [{ item_id: 'i1', devolvido: 7, perdido: 6 }])
    const l = r.linhas[0]
    expect(l.devolvido + l.perdido).toBeLessThanOrEqual(10)
    expect(l.consumido).toBeGreaterThanOrEqual(0)
    expect(r.avisos.length).toBe(1)
  })

  it('número negativo na marcação é tratado como zero', () => {
    const r = conferirDevolucaoDoKit([compressa], [{ item_id: 'i1', devolvido: -5 }])
    expect(r.linhas[0].devolvido).toBe(0)
    expect(r.linhas[0].consumido).toBe(10)
  })

  it('quantidade fracionada mantém precisão de três casas', () => {
    const seringa: ItemAplicado = {
      id: 'i3', item_name: 'Cetamina', unit: 'ml',
      quantity_planned: 2.5, unit_price: 8, returnable: true,
    }
    const r = conferirDevolucaoDoKit([seringa], [{ item_id: 'i3', devolvido: 0.75 }])
    expect(r.linhas[0].consumido).toBe(1.75)
    expect(r.total_abatimento).toBe(6)
  })

  it('kit misto soma devolução, perda e abatimento corretamente', () => {
    const r = conferirDevolucaoDoKit(
      [compressa, frasco],
      [{ item_id: 'i1', devolvido: 3 }, { item_id: 'i2', perdido: 8 }],
    )
    expect(r.total_devolvido).toBe(3)
    expect(r.total_perdido).toBe(8)
    expect(r.total_abatimento).toBe(31.5) // 3×2,50 + 8×3,00
    expect(resumirConferencia(r)).toContain('devolvido')
  })

  it('resumo diz com clareza quando nada voltou', () => {
    const r = conferirDevolucaoDoKit([compressa], [])
    expect(resumirConferencia(r)).toBe('Kit conferido: tudo foi usado.')
  })
})

// ─── 4.4 sugestão de compra ─────────────────────────────────────────────────

const base: ItemParaRepor = {
  stock_item_id: 's1', name: 'Soro fisiológico 500ml', unit: 'un',
  quantity: 100, min_quantity: 10,
  consumo_periodo: 60, dias_periodo: 30,
  lead_time_days: 7, coverage_days: 30,
  purchase_multiple: null, purchase_minimum: null,
  shelf_code: 'A-3-2', location_name: 'Estoque central', supplier_name: 'Distribuidora X',
}

describe('sugestão de compra pela saída (item 4.4)', () => {
  it('item com folga não entra na lista', () => {
    // 2/dia, 100 em estoque = 50 dias. Ponto de pedido = 14.
    expect(sugerirCompra(base)).toBeNull()
  })

  it('no ponto de pedido entra, porque acaba antes de a entrega chegar', () => {
    const s = sugerirCompra({ ...base, quantity: 12 })!
    expect(s).not.toBeNull()
    expect(s.ponto_de_pedido).toBe(14)
    expect(s.consumo_diario).toBe(2)
    expect(s.dias_restantes).toBe(6)
    expect(s.urgencia).toBe('critico') // 6 dias ≤ 7 de entrega
    expect(s.sugerido).toBe(62) // 2/dia × (30 + 7) − 12
  })

  it('saldo negativo é crítico e manda conferir antes de comprar', () => {
    const s = sugerirCompra({ ...base, quantity: -3 })!
    expect(s.urgencia).toBe('critico')
    expect(s.motivo).toContain('Saldo negativo')
  })

  it('embalagem fechada arredonda para cima', () => {
    const s = sugerirCompra({ ...base, quantity: 12, purchase_multiple: 50 })!
    expect(s.sugerido).toBe(100) // 62 → próxima caixa de 50
  })

  it('pedido mínimo do fornecedor é respeitado', () => {
    // 0,5/dia, saldo 3 → abaixo do ponto de pedido (3,5). A necessidade real é
    // de ~16 un, mas o fornecedor não vende menos de 200.
    const s = sugerirCompra({ ...base, quantity: 3, consumo_periodo: 15, purchase_minimum: 200 })!
    expect(s.sugerido).toBe(200)
  })

  it('item sem consumo medido só entra se estiver abaixo do mínimo', () => {
    expect(sugerirCompra({ ...base, consumo_periodo: 0, quantity: 50 })).toBeNull()
    const s = sugerirCompra({ ...base, consumo_periodo: 0, quantity: 5 })!
    expect(s.motivo).toContain('mínimo')
    expect(s.sugerido).toBeGreaterThan(0)
  })

  it('prazo de entrega longo antecipa a compra', () => {
    const curto = sugerirCompra({ ...base, quantity: 30, lead_time_days: 2 })
    const longo = sugerirCompra({ ...base, quantity: 30, lead_time_days: 20 })
    expect(curto).toBeNull()            // 15 dias de saldo, entrega em 2
    expect(longo).not.toBeNull()        // mesma folga, entrega em 20 → pedir já
    expect(longo!.ponto_de_pedido).toBe(40)
  })

  it('usa o padrão da clínica quando o item não tem parâmetro próprio', () => {
    const s = sugerirCompra({ ...base, quantity: 12, lead_time_days: null, coverage_days: null })!
    expect(s.ponto_de_pedido).toBe(2 * PARAMETROS_PADRAO.lead_time_default)
  })

  it('ordena pelo que queima primeiro', () => {
    const lista = [
      sugerirCompra({ ...base, stock_item_id: 'a', name: 'Atencao', quantity: 9, consumo_periodo: 3 })!,
      sugerirCompra({ ...base, stock_item_id: 'b', name: 'Critico', quantity: -1 })!,
    ]
    expect(ordenarSugestoes(lista)[0].name).toBe('Critico')
  })
})

// ─── 4.4 alerta de validade ─────────────────────────────────────────────────

const lote = (over: Partial<LoteComValidade>): LoteComValidade => ({
  batch_id: 'b1', stock_item_id: 's1', item_name: 'Cefalexina', unit: 'cp',
  batch_number: 'L-990', expiry_date: '2026-11-15', quantity: 30,
  shelf_code: 'B-1-1', location_name: 'Farmácia', is_controlled: false, ...over,
})

describe('alerta de validade (item 4.4)', () => {
  it('conta os dias sem tropeçar em fuso', () => {
    expect(diasEntre('2026-10-19', '2026-11-15')).toBe(27)
    expect(diasEntre('2026-10-19', '2026-10-19')).toBe(0)
    expect(diasEntre('2026-10-19', '2026-10-01')).toBe(-18)
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1) // 2026 não é bissexto
  })

  it('pega o que vence dentro da janela e ignora o resto', () => {
    const a = alertasDeValidade([
      lote({ batch_id: 'perto', expiry_date: '2026-11-15' }),
      lote({ batch_id: 'longe', expiry_date: '2027-06-01' }),
    ], '2026-10-19', 60)
    expect(a.map(x => x.batch_id)).toEqual(['perto'])
  })

  it('lote já vencido vem primeiro e é marcado como vencido', () => {
    const a = alertasDeValidade([
      lote({ batch_id: 'vence_breve', expiry_date: '2026-11-10' }),
      lote({ batch_id: 'vencido', expiry_date: '2026-10-01' }),
    ], '2026-10-19', 60)
    expect(a[0].batch_id).toBe('vencido')
    expect(a[0].situacao).toBe('vencido')
    expect(a[0].dias_para_vencer).toBeLessThan(0)
  })

  it('lote zerado e lote sem validade não geram alerta', () => {
    const a = alertasDeValidade([
      lote({ batch_id: 'zerado', quantity: 0 }),
      lote({ batch_id: 'sem_validade', expiry_date: null }),
    ], '2026-10-19', 60)
    expect(a).toEqual([])
  })

  it('descreve o alerta na linguagem de quem vai agir', () => {
    const [vencido] = alertasDeValidade([lote({ expiry_date: '2026-10-09' })], '2026-10-19', 60)
    expect(descreverValidade(vencido)).toContain('Venceu há 10 dia(s)')
    expect(descreverValidade(vencido)).toContain('L-990')

    const [hoje] = alertasDeValidade([lote({ expiry_date: '2026-10-19' })], '2026-10-19', 60)
    expect(descreverValidade(hoje)).toContain('Vence hoje')
  })
})

// ─── 4.2 gate do pré-anestésico ─────────────────────────────────────────────

describe('gate do pré-anestésico (item 4.2)', () => {
  it('padrão não trava nada — ligar a trava é ato de configuração', () => {
    const r = avaliarGate({ checklist: {}, asaRisk: null })
    expect(r.liberado).toBe(true)
    expect(r.bloqueios).toEqual([])
    expect(r.avisos.length).toBe(4)
    expect(r.mensagem).toContain('Pendentes')
  })

  it('com jejum configurado como trava, barra quem não confirmou', () => {
    const r = avaliarGate({
      checklist: { fasting_confirmed: false },
      asaRisk: 'ASA II',
      config: { trava: ['jejum'], avisa: ['exames_preop', 'consentimento', 'asa'] },
    })
    expect(r.liberado).toBe(false)
    expect(r.bloqueios).toEqual(['jejum'])
    expect(r.mensagem).toContain('liberar com motivo')
  })

  it('checklist cumprido libera sem aviso nenhum', () => {
    const r = avaliarGate({
      checklist: { fasting_confirmed: true, preop_exams_ok: true, consent_signed: true },
      asaRisk: 'ASA I',
    })
    expect(r.liberado).toBe(true)
    expect(r.avisos).toEqual([])
    expect(r.mensagem).toBe('')
  })

  it('risco ASA em branco conta como não classificado', () => {
    const cfg = { trava: ['asa' as const], avisa: [] }
    expect(avaliarGate({ checklist: {}, asaRisk: '   ', config: cfg }).liberado).toBe(false)
    expect(avaliarGate({ checklist: {}, asaRisk: 'ASA III', config: cfg }).liberado).toBe(true)
  })

  it('exigência que trava não se repete na lista de avisos', () => {
    const r = avaliarGate({
      checklist: {}, asaRisk: null,
      config: { trava: ['jejum'], avisa: ['jejum', 'consentimento'] },
    })
    expect(r.bloqueios).toContain('jejum')
    expect(r.avisos).not.toContain('jejum')
  })

  it('checklist ausente não derruba a avaliação', () => {
    expect(avaliarGate({ checklist: null, asaRisk: undefined }).liberado).toBe(true)
    expect(avaliarGate({ checklist: undefined, asaRisk: null }).avisos.length).toBe(4)
  })

  it('lê a configuração do flow_config e ignora chave inválida', () => {
    expect(lerConfigGate({ gate_pre_anestesico: ['jejum', 'asa'] }).trava).toEqual(['jejum', 'asa'])
    expect(lerConfigGate({ gate_pre_anestesico: ['jejum', 'inventado'] }).trava).toEqual(['jejum'])
    expect(lerConfigGate({ gate_pre_anestesico: 'nao_e_lista' })).toEqual(CONFIG_GATE_PADRAO)
    expect(lerConfigGate(null)).toEqual(CONFIG_GATE_PADRAO)
  })

  it('o que trava sai da lista de avisos ao ler a configuração', () => {
    const cfg = lerConfigGate({ gate_pre_anestesico: ['jejum'] })
    expect(cfg.avisa).toEqual(['exames_preop', 'consentimento', 'asa'])
  })

  it('toda exigência tem rótulo para a tela', () => {
    for (const e of ['jejum', 'exames_preop', 'consentimento', 'asa'] as const) {
      expect(ROTULO_EXIGENCIA[e]).toBeTruthy()
    }
  })
})
