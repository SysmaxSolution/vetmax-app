# VetMax Core Management — Usage Examples

## 1. Grooming Cashier Integration

### Example: Complete Grooming Session Workflow

```typescript
// src/app/(dashboard)/grooming/session-card.tsx

'use client'

import { finishGroomingSessionAndRecord, updateGroomingStatusViaRPC } from '@/lib/actions/grooming-cashier'
import { useState } from 'react'

export function GroomingSessionCard({ session }) {
  const [loading, setLoading] = useState(false)
  const [cashierId, setCashierId] = useState<string | null>(null)

  // Step 1: Receptionist marks as arrived
  async function handleArrive() {
    setLoading(true)
    const res = await updateGroomingStatusViaRPC(
      session.id,
      'arrived',
      'Recepcionista confirmou chegada'
    )
    if ('error' in res) {
      alert(res.error)
    }
    setLoading(false)
  }

  // Step 2: Assistant marks bathing
  async function handleBathing() {
    setLoading(true)
    const res = await updateGroomingStatusViaRPC(
      session.id,
      'bathing',
      'Auxiliar iniciou banho'
    )
    if ('error' in res) {
      alert(res.error)
    }
    setLoading(false)
  }

  // Step 3: Receptionist finishes + push payment to cashier
  async function handleFinish() {
    setLoading(true)
    const res = await finishGroomingSessionAndRecord(
      session.id,
      `Sessão finalizada. Valor: R$ ${session.price_total}`
    )
    
    if ('error' in res) {
      alert(res.error)
    } else {
      // ✅ Automatic: Session status → "paid", Cashier entry created
      setCashierId(res.cashier_entry_id || null)
      alert(`✅ Sessão finalizada! Entrada cashier: ${res.cashier_entry_id}`)
    }
    setLoading(false)
  }

  return (
    <div className="card">
      <h3>{session.patient.name}</h3>
      <p>Status: {session.current_status}</p>
      <p>Preço: R$ {session.price_total}</p>

      <div className="buttons">
        <button onClick={handleArrive} disabled={loading}>
          ✓ Chegou
        </button>
        <button onClick={handleBathing} disabled={loading}>
          🚿 Banho
        </button>
        <button onClick={handleFinish} disabled={loading}>
          💰 Finalizar & Pagar
        </button>
      </div>

      {cashierId && (
        <p className="success">
          💳 Cashier Entry ID: {cashierId}
        </p>
      )}
    </div>
  )
}
```

---

## 2. Scheduling Slot Validation

### Example: Book Grooming Appointment

```typescript
// src/app/(dashboard)/grooming/booking-form.tsx

'use client'

import { validateSchedulingSlot, getAvailableSlots } from '@/lib/actions/scheduling-validation'
import { useEffect, useState } from 'react'

export function GroomingBookingForm({ clinicId }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [duration] = useState(60) // 1 hour session

  // Fetch available slots when date changes
  useEffect(() => {
    if (!selectedDate) return

    getAvailableSlots({
      clinic_id: clinicId,
      scheduled_date: selectedDate,
      interval_minutes: 30,
      duration_minutes: duration,
    }).then((res) => {
      setAvailableSlots(res.slots)
      setSelectedTime('') // Reset time
    })
  }, [selectedDate, clinicId, duration])

  // Validate slot when time is selected
  async function handleTimeSelect(time: string) {
    setSelectedTime(time)
    
    const result = await validateSchedulingSlot({
      clinic_id: clinicId,
      scheduled_date: selectedDate,
      scheduled_time: time,
      duration_minutes: duration,
    })

    setIsValid(result.valid)
    if (!result.valid) {
      alert(`❌ ${result.reason}`)
    } else {
      alert('✅ Horário disponível!')
    }
  }

  return (
    <form>
      <label>
        Data:
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </label>

      <label>
        Horário:
        <select value={selectedTime} onChange={(e) => handleTimeSelect(e.target.value)}>
          <option value="">Selecione...</option>
          {availableSlots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </label>

      {isValid !== null && (
        <p className={isValid ? 'success' : 'error'}>
          {isValid ? '✅ Slot válido' : '❌ Slot inválido'}
        </p>
      )}

      <button type="submit" disabled={!isValid}>
        Confirmar Agendamento
      </button>
    </form>
  )
}
```

---

## 3. Product Prices Management

### Example: Pricing Dashboard

```typescript
// src/app/(dashboard)/settings/pricing.tsx

'use client'

import {
  listProductPrices,
  upsertProductPrice,
  deactivateProductPrice,
} from '@/lib/actions/core-management'
import { useEffect, useState } from 'react'
import type { ProductPrice } from '@/lib/actions/core-management'

export function PricingPage() {
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [formData, setFormData] = useState({
    name: '',
    category: 'grooming_supplies',
    price: '',
  })
  const [loading, setLoading] = useState(false)

  // Load prices on mount
  useEffect(() => {
    loadPrices()
  }, [])

  async function loadPrices() {
    const result = await listProductPrices({ is_active: true })
    if ('error' in result) {
      alert(result.error)
    } else {
      setPrices(result)
    }
  }

  async function handleAddPrice(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const result = await upsertProductPrice({
      name: formData.name,
      category: formData.category,
      price: parseFloat(formData.price),
    })

    if ('error' in result) {
      alert(`❌ ${result.error}`)
    } else {
      alert(`✅ Produto "${formData.name}" criado (ID: ${result.id})`)
      setFormData({ name: '', category: 'grooming_supplies', price: '' })
      await loadPrices()
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Deletar este produto?')) return

    const result = await deactivateProductPrice(id)
    if ('error' in result) {
      alert(result.error)
    } else {
      alert('✅ Produto desativado')
      await loadPrices()
    }
  }

  return (
    <div className="page">
      <h1>Gerenciar Preços</h1>

      <form onSubmit={handleAddPrice}>
        <input
          type="text"
          placeholder="Nome do produto"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <select
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
        >
          <option value="grooming_supplies">Suprimentos de Grooming</option>
          <option value="medications">Medicamentos</option>
          <option value="exams">Exames</option>
          <option value="services">Serviços</option>
          <option value="other">Outro</option>
        </select>
        <input
          type="number"
          placeholder="Preço (R$)"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          step="0.01"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Adicionando...' : 'Adicionar Produto'}
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Categoria</th>
            <th>Preço</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => (
            <tr key={price.id}>
              <td>{price.name}</td>
              <td>{price.category}</td>
              <td>R$ {price.price.toFixed(2)}</td>
              <td>
                <button onClick={() => handleDelete(price.id)}>Deletar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 4. Central Cashier Ledger

### Example: Accounting Dashboard

```typescript
// src/app/(dashboard)/accounting/cashier.tsx

'use client'

import {
  listCashierEntries,
  getCashierSummary,
  verifyCashierEntry,
  recordCashierEntry,
} from '@/lib/actions/core-management'
import { useEffect, useState } from 'react'

export function CashierPage() {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  async function loadData() {
    setLoading(true)

    // Fetch entries
    const entriesRes = await listCashierEntries({
      from_date: dateFrom,
      to_date: dateTo,
    })
    if ('error' in entriesRes) {
      alert(entriesRes.error)
    } else {
      setEntries(entriesRes)
    }

    // Fetch summary
    const summaryRes = await getCashierSummary({
      from_date: dateFrom,
      to_date: dateTo,
    })
    if ('error' in summaryRes) {
      alert(summaryRes.error)
    } else {
      setSummary(summaryRes)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo])

  async function handleVerify(entryId: string) {
    const res = await verifyCashierEntry(entryId)
    if ('error' in res) {
      alert(res.error)
    } else {
      alert('✅ Entrada verificada')
      await loadData()
    }
  }

  return (
    <div className="page">
      <h1>Caixa Central</h1>

      <div className="date-filter">
        <label>
          De:
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label>
          Até:
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

      {summary && (
        <div className="summary-cards">
          <div className="card">
            <h3>Total Registrado</h3>
            <p className="amount">R$ {summary.total_recorded.toFixed(2)}</p>
          </div>
          <div className="card">
            <h3>Total Verificado</h3>
            <p className="amount">R$ {summary.total_verified.toFixed(2)}</p>
          </div>
          <div className="card">
            <h3>Entradas</h3>
            <p>{summary.entry_count}</p>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Módulo</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Motivo</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.created_at).toLocaleDateString('pt-BR')}</td>
              <td>{entry.source_module}</td>
              <td>
                <span className={entry.amount > 0 ? 'credit' : 'debit'}>
                  R$ {Math.abs(entry.amount).toFixed(2)}
                </span>
              </td>
              <td>
                <span className={`status-${entry.status}`}>{entry.status}</span>
              </td>
              <td>{entry.reason || '—'}</td>
              <td>
                {entry.status === 'recorded' && (
                  <button onClick={() => handleVerify(entry.id)}>
                    Verificar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 5. Module Governance

### Example: Enable Module with Protection

```typescript
// src/app/(dashboard)/settings/modules.tsx

'use server'

import { canEnableModule } from '@/lib/module-governance'
import { createClient } from '@/lib/supabase/server'

export async function enableModule(
  moduleName: string,
  masterKey?: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  
  // 1. Get user role
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return { success: false, message: 'Perfil não encontrado' }

  // 2. Check governance
  const result = canEnableModule(profile.role, moduleName, {
    masterKey,
    requireVerification: process.env.MODULE_GOVERNANCE_STRICT === 'true',
  })

  if (!result.allowed) {
    return { success: false, message: result.reason || 'Acesso negado' }
  }

  // 3. Enable module
  const { data: clinic } = await supabase
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()

  const activeModules = Array.isArray(clinic?.active_modules)
    ? clinic.active_modules
    : []

  if (!activeModules.includes(moduleName)) {
    activeModules.push(moduleName)

    const { error } = await supabase
      .from('clinics')
      .update({ active_modules: activeModules })
      .eq('id', profile.clinic_id)

    if (error) {
      return { success: false, message: `Erro ao ativar: ${error.message}` }
    }
  }

  return { success: true, message: `✅ Módulo "${moduleName}" habilitado!` }
}
```

```typescript
// Client form
'use client'

import { enableModule } from './actions'

export function ModuleToggle() {
  const [masterKey, setMasterKey] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleEnable(moduleName: string) {
    setLoading(true)
    const res = await enableModule(moduleName, masterKey)
    alert(res.message)
    setLoading(false)
  }

  return (
    <div>
      <input
        type="password"
        placeholder="Chave Mestra (se necessária)"
        value={masterKey}
        onChange={(e) => setMasterKey(e.target.value)}
      />
      <button onClick={() => handleEnable('grooming')} disabled={loading}>
        Habilitar Grooming
      </button>
    </div>
  )
}
```

---

## 6. Raw SQL Queries (Reference)

### List All Cashier Entries for a Clinic

```sql
SELECT
  id,
  source_module,
  amount,
  status,
  created_at,
  reason
FROM central_cashier
WHERE clinic_id = 'your-clinic-uuid'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

### Sum by Module

```sql
SELECT
  source_module,
  COUNT(*) as count,
  SUM(amount) as total
FROM central_cashier
WHERE clinic_id = 'your-clinic-uuid'
  AND status != 'archived'
GROUP BY source_module;
```

### Get Business Hours for a Clinic

```sql
SELECT
  id,
  business_hours,
  working_days,
  holiday_work
FROM clinics
WHERE id = 'your-clinic-uuid';
```

---

## Notes

- All examples use TypeScript `'use client'` for client components
- Server Actions handle auth + clinic isolation
- RPC functions run in database (no N+1 queries)
- Cashier entries immutable after creation (WORM audit trail)
- Always validate scheduling against `clinic_settings` before creating sessions
