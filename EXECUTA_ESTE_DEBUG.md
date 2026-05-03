# 🔍 Debug de Agendamentos - Instruções

## 📋 Problema
- Clínica **PetCare** (nova, sem dados) mostra "Hoje [3] Agendamentos"
- Múltiplas clínicas mostram o **mesmo número (3)**
- Isso indica vazamento de dados entre clínicas

## 🚀 Como Executar o Debug

### Passo 1: Abrir Supabase Console
1. Acesse: https://app.supabase.com
2. Selecione projeto: `yivjuhurcadxtllmkkqd`
3. Clique em **SQL Editor** (menu esquerda)

### Passo 2: Executar as Queries
1. Abra arquivo: `DEBUG_APPOINTMENTS_PETCARE.sql`
2. **Copie TODO o conteúdo**
3. Cole no **SQL Editor** do Supabase
4. Clique em **Run** (botão azul)

### Passo 3: Analisar Resultados
Execute cada query uma por uma para ver os resultados:

---

## 📊 Queries e o que Esperar

### Query 1: Total de Agendamentos na PetCare
```sql
SELECT COUNT(*) as total_agendamentos_petcare
FROM appointments
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid;
```
**Esperado:** `0` (clínica é nova)  
**Se retornar:** > 0 = agendamentos foram criados com clinic_id errado

---

### Query 2: Agendamentos por Data na PetCare
```sql
SELECT DATE(appointment_datetime) as data, COUNT(*) as total
FROM appointments
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid
GROUP BY DATE(appointment_datetime)
ORDER BY data DESC;
```
**Esperado:** Sem resultados (vazio)

---

### Query 3: Agendamentos para Hoje (2026-04-16) na PetCare
```sql
SELECT COUNT(*) as agendamentos_petcare_hoje
FROM appointments
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid
AND DATE(appointment_datetime) = '2026-04-16';
```
**Esperado:** `0`

---

### Query 4: Usuários da PetCare
```sql
SELECT id, full_name, role
FROM profiles
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid;
```
**Esperado:** Ver os usuários da PetCare

---

### Query 5: **CRÍTICA** - Qual Clínica Tem os 3 Agendamentos de Hoje?
```sql
SELECT clinic_id, COUNT(*) as total_agendamentos
FROM appointments
WHERE DATE(appointment_datetime) = '2026-04-16'
GROUP BY clinic_id
ORDER BY total_agendamentos DESC;
```
**Esperado:** Mostrar qual clinic_id tem 3 agendamentos  
**ISTO REVELAR O PROBLEMA!**

---

### Query 6: Resumo de Todas as Clínicas
```sql
SELECT
  c.id, c.name,
  COUNT(a.id) as total_agendamentos,
  COUNT(CASE WHEN DATE(a.appointment_datetime) = '2026-04-16' THEN 1 END) as agendamentos_hoje
FROM clinics c
LEFT JOIN appointments a ON c.id = a.clinic_id
GROUP BY c.id, c.name
ORDER BY total_agendamentos DESC;
```
**Resultado:** Visão geral de todas as clínicas

---

### Query 7: Detalhes dos 3 Agendamentos
```sql
SELECT
  a.id, c.name as clinic_name, a.clinic_id,
  a.appointment_datetime, a.status, a.reason
FROM appointments a
LEFT JOIN clinics c ON a.clinic_id = c.id
WHERE DATE(a.appointment_datetime) = '2026-04-16'
ORDER BY a.appointment_datetime;
```
**Resultado:** Quem criou esses 3 agendamentos?

---

## 🎯 Depois de Executar

### Se Query 5 retornar clinic_id ≠ PetCare

**DIAGNÓSTICO:** Os agendamentos pertencem a **outra clínica**!

**CAUSA PROVÁVEL:**
O usuário da PetCare está logado, mas `auth.clinicId` está retornando clinic_id de **outra clínica**

**SOLUÇÃO:**
1. Verifique função `getUserClinic()` em `src/lib/actions/appointments.ts`
2. Adicione log:
```typescript
async function getUserClinic() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  console.log('[DEBUG] user.id =', user?.id);
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  
  console.log('[DEBUG] profile.clinic_id =', profile?.clinic_id);
  return { clinicId: profile.clinic_id, userId: user.id }
}
```

3. Abra DevTools no navegador
4. Verifique os logs ao carregar o calendário

---

## 📝 Me Responda Com:

1. **Query 1:** Quantos agendamentos a PetCare tem?
2. **Query 5:** Qual clinic_id tem os 3 agendamentos de 2026-04-16?
3. **Query 6:** Nome da clínica que tem os 3 agendamentos?
4. **Query 7:** Qual é o `reason` dos 3 agendamentos?

Isso vai revelar exatamente onde o problema está!
