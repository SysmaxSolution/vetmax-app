# Clinical Flow — Fluxo Clínico Veterinário

**Data:** 2026-04-06  
**Regulamentação:** CFMV (Conselho Federal de Medicina Veterinária)

---

## 🎯 Princípio Central

> **O Tutor é cliente financeiro/legal. O Pet é paciente clínico.**
> Separar completamente no banco de dados, na UI e nas regras de negócio.

---

## 📋 Fluxo de Consulta Completo

```
1. RECEPÇÃO → 2. TRIAGEM → 3. CONSULTÓRIO → 4. EXAMES → 5. FARMÁCIA → 6. ALTA
```

---

## 🔧 Sinais Vitais Obrigatórios na Triagem

| Sinal | Range Normal | Crítico Se | Unidade |
|-------|--------------|-----------|---------|
| **Peso** | Varia/espécie | < 2kg ou > 100kg | kg |
| **Temp Retal** | 37.5-39.0 | < 37.0 ou > 40.5 | °C |
| **Cor Mucosas** | Rosa brilhante | Pálida/Cianótica | Visual |
| **TPC** | 1-2 seg | > 3 seg | seg |

---

## 💊 Prescrição e Medicamentos

**Controlados (Receituário Azul):**
- Opióides (tramadol, morfina)
- Benzodiazepínicos (diazepam)
- Anabolizantes

**Regra de Dosagem:**
- NUNCA prescrever sem peso do animal
- Fórmula: `dose (mg/kg) × peso (kg) = dose total`

---

## 📄 Prontuário Eletrônico (CFMV)

**O que é Documento Legal (nunca delete):**
- Qualquer registro com `is_reviewed_by_vet = true`
- Prescrições de medicamentos
- Diagnósticos documentados

**Retenção CFMV:**
- Mínimo **5 anos** após última consulta

---

**Referência:** CFMV Resolução 1138/2016  
**Última revisão:** 2026-04-06
