# Error Handling — Tratamento de Erros e UX

**Data:** 2026-04-06  
**Criticidade:** 🟠 IMPORTANTE

---

## 🎯 Regra de Ouro

> **Nunca mostre erro genérico "Something went wrong" para o usuário.**  
> **Classificar erro: user error vs system error vs external API.**  
> **Sempre oferecer ação seguinte (retry, contact support, etc).**

---

## 📋 Classificação de Erros

### User Errors (400)
- CPF inválido
- Peso do animal negativo
- Dosagem acima de limite seguro
- Medicamento não encontrado

**Mensagem:** "O peso deve ser positivo. Digite um valor entre 0.5 kg e 100 kg."

### System Errors (500)
- Banco de dados indisponível
- Falha ao gerar receituário
- Erro ao salvar prontuário

**Mensagem:** "Erro ao salvar prescrição. Tente novamente em alguns segundos. Se persistir, contate suporte."

### External API Errors (503)
- OpenAI API down (transcrição falha)
- Supabase down
- Serviço de assinatura digital indisponível

**Mensagem:** "Serviço de transcrição indisponível. Tente novamente em 5 minutos."

---

## 💻 Try-Catch Pattern

```typescript
'use server'

export async function prescribeAction(data: FormData) {
  try {
    // Validação
    const validation = validatePrescription(data)
    if (!validation.isValid) {
      return { error: validation.message, code: 'VALIDATION_ERROR' }
    }

    // Ação
    const prescription = await savePrescription(data)
    return { success: true, prescription }

  } catch (error) {
    // Classificar erro
    if (error instanceof ValidationError) {
      return { error: error.message, code: 'USER_ERROR' }
    }
    if (error instanceof DatabaseError) {
      Sentry.captureException(error)
      return { error: 'Database unavailable', code: 'SYSTEM_ERROR' }
    }
    if (error instanceof ExternalAPIError) {
      return { error: 'External service unavailable', code: 'API_ERROR' }
    }
    // Default
    return { error: 'Unknown error', code: 'UNKNOWN_ERROR' }
  }
}
```

---

## 🔄 Retry Logic

**Automático (no backend):**
```typescript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(Math.pow(2, i) * 1000) // exponential backoff
    }
  }
}
```

**Manual (no UI):**
```typescript
{error && (
  <div className="error-banner">
    {error.message}
    <button onClick={() => retry()}>
      🔄 Tentar novamente
    </button>
  </div>
)}
```

---

## 🎭 Error UI Components

**Toast (ephemeral):**
```typescript
showToast({
  type: 'error',
  message: 'Medicamento não encontrado',
  action: { label: 'Procurar outra opção', onClick: () => ... }
})
```

**Modal (blocking):**
```typescript
<ErrorModal
  title="Falha ao salvar prescrição"
  message="Database indisponível. Contate TI."
  actions={[
    { label: 'Tentar novamente', onClick: retry },
    { label: 'Contatar suporte', onClick: openSupport }
  ]}
/>
```

---

## 🚫 Proibições

- ❌ `console.error(error)` sem logging estruturado
- ❌ Mostrar stack trace para usuário
- ❌ Erros genéricos ("Something went wrong")
- ❌ Falhar silenciosamente (sem notificação)
- ❌ Salvar estado inconsistente (prescrição sem medicamento)

---

**Última revisão:** 2026-04-06
