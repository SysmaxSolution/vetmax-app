# Validation — Regras de Negócio e Data Integrity

**Data:** 2026-04-06  
**Criticidade:** 🟠 IMPORTANTE

---

## 🎯 Regra de Ouro

> **Toda entrada do usuário é validada.**  
> **Toda regra de negócio é executada no servidor.**  
> **Nenhum dado inválido chega ao banco de dados.**

---

## 📋 Validações Clínicas

### Sinais Vitais
```typescript
const validateVitalSigns = (data) => {
  const errors = []

  if (!data.weight_kg || data.weight_kg < 0.5 || data.weight_kg > 150) {
    errors.push('Peso deve estar entre 0.5 kg e 150 kg')
  }

  if (!data.temperature_rectal || data.temperature_rectal < 35 || data.temperature_rectal > 42) {
    errors.push('Temperatura deve estar entre 35°C e 42°C')
  }

  if (!data.tcp_seconds || data.tcp_seconds < 0.5 || data.tcp_seconds > 5) {
    errors.push('TPC deve estar entre 0.5 e 5 segundos')
  }

  return errors.length ? { isValid: false, errors } : { isValid: true }
}
```

### Prescrição
```typescript
const validatePrescription = (prescription) => {
  const errors = []

  // Medicamento existe?
  if (!medications.find(m => m.id === prescription.drug_id)) {
    errors.push('Medicamento não encontrado')
  }

  // Dosagem razoável?
  const pet = await getPatient(prescription.patient_id)
  const maxDosage = calculateMaxDosage(pet.weight_kg)
  if (prescription.dosage > maxDosage) {
    errors.push(`Dosagem acima do limite seguro (${maxDosage}mg)`)
  }

  // Pet tem alergia a este medicamento?
  if (pet.allergies.includes(prescription.drug_id)) {
    errors.push('ALERTA: Pet tem alergia a este medicamento!')
  }

  return errors.length ? { isValid: false, errors } : { isValid: true }
}
```

---

## 🔐 Input Sanitization

```typescript
import DOMPurify from 'dompurify'

// Sanitizar inputs de texto
const sanitize = (input) => DOMPurify.sanitize(input)

// Exemplo: observações do vet
const observations = sanitize(userInput) // Remove XSS attempts
```

---

## 🔗 Data Integrity

**Regra: Tutor + Pet relacionados**
```typescript
const validateConsultation = async (consultation) => {
  // Pet pertence ao Tutor?
  const pet = await getPatient(consultation.patient_id)
  if (pet.tutor_id !== consultation.tutor_id) {
    throw new Error('Pet não pertence a este Tutor')
  }

  // Tutor pertence à clínica?
  if (pet.clinic_id !== consultation.clinic_id) {
    throw new Error('Cross-clinic integrity violation')
  }
}
```

---

## 🚫 Business Rule Validations

**Regra: Triagem obrigatória antes de consulta**
```typescript
if (consultation.status === 'ready_for_vet') {
  const triage = await getTriageForConsultation(consultation.id)
  if (!triage || triage.status !== 'completed') {
    throw new Error('Triagem obrigatória antes de consulta')
  }
}
```

**Regra: Medicamento controlado = receituário azul**
```typescript
if (isControlledDrug(medication)) {
  const receipt = await generateBlueReceipt(prescription)
  if (!receipt) {
    throw new Error('Falha ao gerar receituário azul')
  }
}
```

---

## 🛡️ Rate Limiting

```typescript
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 tentativas
  message: 'Muitas tentativas de login. Tente novamente depois.'
})

export async function loginAction(email, password) {
  // ... validação contra rate limiter
}
```

---

## ✅ Checklist de Validação

**Frontend (UX):**
- [ ] Campo obrigatório marcado (*)
- [ ] Validação instant feedback (ex: peso negativo)
- [ ] Mensagem clara e acionável

**Backend (Security):**
- [ ] Todos os inputs validados (server-side)
- [ ] Regras de negócio executadas
- [ ] Data integrity garantida
- [ ] Rate limiting configurado

---

**Última revisão:** 2026-04-06
