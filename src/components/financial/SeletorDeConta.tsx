'use client'

import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { listBankAccounts } from '@/lib/actions/financial'
import { listCompanies } from '@/lib/actions/companies'

/**
 * Escolhe a conta bancária que vai operar — e, por tabela, a empresa.
 *
 * Existe porque a clínica pode ter vários CNPJs no mesmo banco, cada um com
 * sua credencial e seu certificado e-CNPJ. Sem escolher, o sistema usava
 * sempre a conta padrão: na Animais isso significava buscar o DDA de uma
 * empresa e emitir o boleto de outra, sem ninguém perceber.
 *
 * Com UMA conta cadastrada o seletor se cala e apenas informa qual é — não faz
 * sentido pedir escolha onde não há escolha.
 */

export interface ContaOperacao {
  id:           string
  name:         string
  bank_code:    string | null
  agency:       string | null
  account:      string | null
  company_id:   string | null
  company_name: string | null
}

interface Props {
  value:     string | null
  onChange:  (id: string | null, conta: ContaOperacao | null) => void
  /** Restringe a um banco (ex.: '756' nas telas que só falam com o Sicoob). */
  bankCode?: string
  label?:    string
  className?: string
}

export default function SeletorDeConta({
  value, onChange, bankCode, label = 'Conta', className = '',
}: Props) {
  const [contas, setContas] = useState<ContaOperacao[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    async function carregar() {
      const [cs, es] = await Promise.all([listBankAccounts(), listCompanies()])
      if (!vivo) return
      const empresas = Array.isArray(es) ? es : []
      const lista: ContaOperacao[] = (Array.isArray(cs) ? cs : [])
        .filter(c => !bankCode || String(c.bank_code ?? '').replace(/\D/g, '') === bankCode)
        .map(c => {
          const cid = (c as { company_id?: string | null }).company_id ?? null
          return {
            id: c.id, name: c.name,
            bank_code: c.bank_code ?? null, agency: c.agency ?? null, account: c.account ?? null,
            company_id: cid,
            company_name: cid ? empresas.find(e => e.id === cid)?.name ?? null : null,
          }
        })
      setContas(lista)
      setCarregando(false)
      // Escolhe sozinho quando não há escolha a fazer.
      if (!value && lista.length) onChange(lista[0].id, lista[0])
    }
    void carregar()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankCode])

  if (carregando || contas.length === 0) return null

  const atual = contas.find(c => c.id === value) ?? null
  const rotulo = (c: ContaOperacao) =>
    `${c.name}${c.company_name ? ` · ${c.company_name}` : ''}`

  if (contas.length === 1) {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] text-slate-600 ${className}`}>
        <Landmark className="h-3.5 w-3.5 text-slate-400" />
        <span>{rotulo(contas[0])}</span>
      </div>
    )
  }

  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-semibold text-slate-500 uppercase">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => {
          const c = contas.find(x => x.id === e.target.value) ?? null
          onChange(c?.id ?? null, c)
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      >
        {contas.map(c => <option key={c.id} value={c.id}>{rotulo(c)}</option>)}
      </select>
      {atual && !atual.company_id && (
        <span className="mt-1 block text-[10px] text-amber-700">
          Esta conta não está vinculada a uma empresa faturante — vai usar o certificado geral da clínica.
        </span>
      )}
    </label>
  )
}
