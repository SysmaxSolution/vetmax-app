// O que o banco exige do PAGADOR para registrar um boleto, e o que falta.
//
// Existe por dois motivos.
//
// O primeiro é um defeito: `emitOrReprintBoleto` montava o pagador assim —
//
//   let pag = { nome: 'Pagador', cpfCnpj: '', endereco: '', bairro: '', cidade: '', cep: '', uf: '' }
//   if (entry.tutor_id) { ... pag = { ..., bairro: '', cidade: '', cep: '', uf: '' } }
//
// Sem tutor ia um pagador fictício com CPF vazio. E MESMO com tutor, bairro,
// cidade, CEP e UF iam vazios por código fixo, porque o `select` buscava só
// `name, cpf, address, email`. O `tutors` sempre teve todos os campos.
//
// O segundo é manutenção preventiva: avisar ANTES de mandar ao banco, para a
// correção já estar em andamento. O aviso é INFORMATIVO, não trava — quem
// decide se emite é o usuário; o que não pode é ele descobrir no 400 do banco.

import { cpfOuCnpjValido, apenasDigitos } from '@/lib/validation/documento'

export interface DadosPagador {
  nome?: string | null
  cpfCnpj?: string | null
  endereco?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  cep?: string | null
  uf?: string | null
  email?: string | null
}

export interface PendenciaPagador {
  campo: string
  /** Como o campo se chama na tela do Tutor/Fornecedor. */
  rotulo: string
  /** O que exatamente está errado — vazio não é a mesma coisa que inválido. */
  motivo: string
}

const vazio = (v: unknown): boolean => !String(v ?? '').trim()

/**
 * O que falta para o banco aceitar este pagador. Lista vazia = pronto.
 *
 * A ordem é a de preenchimento na tela, para o usuário seguir de cima para
 * baixo em vez de caçar campo.
 */
export function pendenciasDoPagador(p: DadosPagador): PendenciaPagador[] {
  const faltas: PendenciaPagador[] = []

  if (vazio(p.nome)) faltas.push({ campo: 'nome', rotulo: 'Nome', motivo: 'não preenchido' })

  if (vazio(p.cpfCnpj)) {
    faltas.push({ campo: 'cpfCnpj', rotulo: 'CPF/CNPJ', motivo: 'não preenchido' })
  } else if (!cpfOuCnpjValido(String(p.cpfCnpj))) {
    // Documento errado só apareceria como recusa do banco, depois da nota
    // numerada. Conferir o dígito aqui custa nada.
    faltas.push({ campo: 'cpfCnpj', rotulo: 'CPF/CNPJ', motivo: 'dígito verificador inválido' })
  }

  if (vazio(p.endereco)) faltas.push({ campo: 'endereco', rotulo: 'Endereço', motivo: 'não preenchido' })
  if (vazio(p.bairro))   faltas.push({ campo: 'bairro', rotulo: 'Bairro', motivo: 'não preenchido' })
  if (vazio(p.cidade))   faltas.push({ campo: 'cidade', rotulo: 'Cidade', motivo: 'não preenchido' })

  if (vazio(p.cep)) {
    faltas.push({ campo: 'cep', rotulo: 'CEP', motivo: 'não preenchido' })
  } else if (apenasDigitos(String(p.cep)).length !== 8) {
    faltas.push({ campo: 'cep', rotulo: 'CEP', motivo: 'deve ter 8 dígitos' })
  }

  if (vazio(p.uf)) {
    faltas.push({ campo: 'uf', rotulo: 'UF', motivo: 'não preenchido' })
  } else if (String(p.uf).trim().length !== 2) {
    faltas.push({ campo: 'uf', rotulo: 'UF', motivo: 'deve ter 2 letras (ex.: SP)' })
  }

  return faltas
}

export const pagadorPronto = (p: DadosPagador): boolean => pendenciasDoPagador(p).length === 0

/**
 * Uma frase para a tela. Informativa de propósito: diz o que falta e onde
 * corrigir, sem impedir o usuário de seguir fazendo outra coisa.
 */
export function avisoDoPagador(p: DadosPagador, ondeCorrigir = 'no cadastro do Tutor'): string | null {
  const faltas = pendenciasDoPagador(p)
  if (!faltas.length) return null
  const lista = faltas.map(f => `${f.rotulo} (${f.motivo})`).join(', ')
  return faltas.length === 1
    ? `Para emitir boleto falta ${lista} — corrija ${ondeCorrigir}.`
    : `Para emitir boleto faltam ${faltas.length} dados: ${lista} — corrija ${ondeCorrigir}.`
}

/**
 * Monta o pagador a partir do cadastro do Tutor.
 *
 * O endereço do boleto junta rua e número: o `tutors` guarda separados e o
 * campo `endereco` do Sicoob é um só.
 */
export function pagadorDeTutor(t: {
  name?: string | null; cpf?: string | null; email?: string | null
  address?: string | null; address_number?: string | null; address_complement?: string | null
  neighborhood?: string | null; city?: string | null; state?: string | null; cep?: string | null
}): DadosPagador {
  const rua = String(t.address ?? '').trim()
  const num = String(t.address_number ?? '').trim()
  return {
    nome:     t.name ?? null,
    cpfCnpj:  t.cpf ?? null,
    endereco: [rua, num].filter(Boolean).join(', ') || null,
    numero:   num || null,
    bairro:   t.neighborhood ?? null,
    cidade:   t.city ?? null,
    cep:      t.cep ?? null,
    uf:       t.state ?? null,
    email:    t.email ?? null,
  }
}
