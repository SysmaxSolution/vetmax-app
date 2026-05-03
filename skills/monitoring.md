# Monitoring — Observabilidade, Logs, Alertas, Health Checks

**Data:** 2026-04-06  
**Criticidade:** 🔴 CRÍTICO — Bloqueador de Produção

---

## 📊 Regra de Ouro

> **Se não for monitorado, não existe em produção.**  
> **Erros devem ser alertados em < 5 minutos.**  
> **Downtime deve ser detectado automaticamente.**

---

## 📝 Logging Estruturado

**Formato padrão (JSON):**
```json
{
  "timestamp": "2026-04-06T14:30:00Z",
  "level": "ERROR",
  "service": "vetmax",
  "environment": "production",
  "user_id": "uuid-here",
  "clinic_id": "uuid-here",
  "action": "prescribe_medication",
  "error": "invalid_dosage",
  "message": "Dosage calculation failed",
  "stack_trace": "...",
  "request_id": "req-123456"
}
```

**O que logar:**
- ✅ Erros (ERROR level)
- ✅ Avisos críticos (WARN: medicamento controlado)
- ✅ Eventos importantes (INFO: prescrição criada)
- ❌ Senhas, tokens, dados sensíveis

**Serviço:** Cloudwatch (AWS) ou Datadog

---

## 🚨 Error Tracking

**Ferramenta:** Sentry (integração automática)

**Captura:**
```typescript
import * as Sentry from '@sentry/nextjs'

export async function prescribeAction(data: FormData) {
  try {
    // ... prescrever
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        action: 'prescribe',
        clinic_id: clinicId,
      },
      level: 'error',
    })
    throw error
  }
}
```

**Alertas automáticos:**
- ❌ Prescrição falhou (XYZ vezes/hora)
- ❌ Triagem não salva (servidor)
- ❌ Medicamento controlado: receituário não gerado

---

## 💨 Performance Monitoring (APM)

**Métricas:**
- Tempo de resposta (< 500ms para API calls)
- Database query performance (slow queries > 1s)
- Memory usage (< 512MB)
- Uptime (99.9% SLA)

**Ferramenta:** New Relic ou Datadog

**Alertas:**
- 🔴 API latency > 1s
- 🟠 DB query > 2s
- 🟡 Memory > 80% capacity

---

## 🏥 Health Checks

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-06T14:30:00Z",
  "services": {
    "database": "ok",
    "supabase_auth": "ok",
    "openai_api": "ok",
    "storage": "ok"
  },
  "latency_ms": 45
}
```

**Frequência:** Checkado a cada 60s por monitoring service

---

## 📊 Dashboards Obrigatórios

**Dashboard 1: Health Overview**
- Uptime (%)
- Active users
- API latency (p50, p95, p99)
- Error rate (%)

**Dashboard 2: Clinical Metrics**
- Consultas criadas/dia
- Prescrições geradas/dia
- Receituários azuis/dia
- Taxa de erro em prontuários

**Dashboard 3: Infrastructure**
- CPU usage
- Memory usage
- Database connections
- Network I/O

---

## 🔔 Alerting Rules

| Métrica | Threshold | Ação |
|---------|-----------|------|
| API latency p95 | > 1s | Notify dev team |
| Error rate | > 1% | Notify dev team |
| Uptime | < 99% | Page on-call engineer |
| DB query slow | > 2s | Log warning |
| Prescription create fails | > 5/hour | Notify vet team + admin |

---

## 📱 Notification Channels

- **Slack:** Alertas de erro (dev channel)
- **PagerDuty:** Critical outages (on-call engineer)
- **Email:** Weekly summary report
- **SMS:** P1 incidents only (database down)

---

## ✅ Checklist Pre-Produção

- [ ] Sentry configured e funcionando
- [ ] Logging estruturado em JSON
- [ ] Health check endpoint testado
- [ ] Dashboards criados (3 principais)
- [ ] Alerting rules configurados
- [ ] On-call schedule estabelecido

---

**Última revisão:** 2026-04-06  
**Status:** ✅ Obrigatório antes de produção
