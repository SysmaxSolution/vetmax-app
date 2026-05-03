# Database Architecture — Schema PostgreSQL + RLS

**Data:** 2026-04-06  
**Tecnologia:** Supabase PostgreSQL  
**Security Model:** RLS (Row Level Security) obrigatório

---

## 🔴 Regra de Ouro: Multi-Tenancy

> **TODA query DEVE filtrar por clinic_id**  
> **TODA tabela DEVE ter clinic_id como coluna obrigatória**  
> **RLS é lei, não sugestão**

---

## 📊 Relacionamentos-chave

```
clinics (1) ──→ (N) profiles (roles)
         ├──→ (N) tutors
         ├──→ (N) patients (via tutors)
         ├──→ (N) consultations
         ├──→ (N) triage_forms
         ├──→ (N) prescriptions
         ├──→ (N) exam_orders
         └──→ (N) pharmacy_orders
```

---

## 🔐 RLS Policies (Obrigatório em TODA tabela)

**Pattern:**
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation"
  ON table_name FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

---

## 🗄️ Tipos de Dados Especiais (JSONB)

**vital_signs:**
```json
{
  "weight_kg": 22.5,
  "temperature_rectal": 38.7,
  "mucosa_color": "pink",
  "tcp_seconds": 1.5
}
```

**medications:**
```json
{
  "medications": [
    {
      "drug": "Amoxicilina",
      "dosage_mg": 250,
      "frequency": "a cada 8 horas",
      "duration_days": 10,
      "controlled": false
    }
  ]
}
```

---

## ✅ Checklist de Nova Tabela

- [ ] Tem `clinic_id` como coluna obrigatória?
- [ ] Tem `id` UUID primária?
- [ ] Tem `created_at` e `updated_at` TIMESTAMP?
- [ ] Tem `is_archived` boolean para soft delete?
- [ ] RLS está ENABLED?
- [ ] Policies foram criadas?

---

**Última review:** 2026-04-06
