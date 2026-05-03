# Legal Compliance — LGPD, CFMV, Anvisa

**Data:** 2026-04-06  
**Jurisdição:** Brasil

---

## 📋 LGPD (Lei Geral de Proteção de Dados)

**Dados Sensíveis do Tutor:**
- CPF
- Telefone
- Endereço
- Email

**Obrigações:**
- Criptografia em repouso
- Acesso restrito por RLS
- Direito ao esquecimento (soft delete após período)
- Consentimento explícito para marketing

---

## 🏥 CFMV (Conselho Federal de Medicina Veterinária)

**Resoluções Aplicáveis:**
- CFMV 1138/2016 — Prontuário eletrônico
- CFMV 1176/2018 — Assinatura digital

**Prontuário Eletrônico:**
- Nunca deletar registros revisados (`is_reviewed_by_vet = true`)
- Retenção mínima: 5 anos
- Assinatura digital do veterinário obrigatória

---

## 💊 Anvisa/MAPA — Medicamentos Controlados

**Medicamentos que exigem Receituário Azul:**
- Opióides (tramadol, morfina)
- Benzodiazepínicos
- Anabolizantes
- Antimicrobianos específicos em gatos

**Sistema DEVE:**
- Gerar Receituário Azul automaticamente
- Registrar número de receita no prontuário
- Arquivar cópia assinada

---

**Última revisão:** 2026-04-06
