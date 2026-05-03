# Document Processing — Upload e Extração Automática de Campos

**Data:** 2026-04-06  
**Status:** 🟢 Novo (Sprint Gestão de Templates)

---

## 📋 Regra de Ouro

> **Documentos veterinários NUNCA contêm dados do paciente — apenas estrutura clínica.**  
> **Nunca enviar PII ao processar templates.**  
> **Extracted fields são SCHEMA, não dados.**

---

## 🎯 Conceito

Templates são **modelos vazios de documentos** que a clínica customiza:
- Laudo de Ultrassom (campos: Achados, Conclusão, Recomendações)
- Receita (campos: Medicamento, Dosagem, Frequência)
- Encaminhamento (campos: Motivo, MV Responsável, Especialidade)

Cada template define quais **campos** (extratos de informação) devem ser preenchidos automaticamente quando o MV ditava por voz.

---

## 📊 Schema JSONB: extracted_fields

**Estrutura obrigatória:**

```json
[
  {
    "field_name": "diagnostico_presuntivo",
    "label": "Diagnóstico Presuntivo",
    "type": "text",
    "description": "Resumo da suspeita clínica",
    "required": true
  },
  {
    "field_name": "medicacao_recomendada",
    "label": "Medicação Recomendada",
    "type": "select",
    "description": "Opção de medicamento",
    "required": false
  }
]
```

**Campo-por-campo:**

| Campo | Tipo | Obrigatório | Regra |
|-------|------|-------------|-------|
| `field_name` | string | ✅ | snake_case sem espaços, ex: `achados_ultrassom` |
| `label` | string | ✅ | PT-BR, para exibir na UI, ex: "Achados Ultrassom" |
| `type` | enum | ✅ | text / number / date / select / boolean / textarea |
| `description` | string | ✅ | Contexto para a IA saber o que preencher, ex: "Descrição dos achados encontrados" |
| `required` | boolean | ✅ | Se o campo é obrigatório no documento |

---

## 🤖 Integração com IA (Claude)

**Quando:** Admin faz upload de novo template

**Fluxo:**
1. Frontend: usuário preenche nome do documento (ex: "Laudo de Ultrassom") + seleciona tipo ("laudo")
2. Frontend: chama `POST /api/process-template` com `{ name, type }`
3. Backend: chama Claude Haiku com prompt estruturado
4. Claude: retorna `extracted_fields[]` como JSON puro (sem markdown)
5. Frontend: exibe campos para review + opção de adicionar manualmente
6. Admin: confirma → salva em `document_templates` via `saveTemplate()`

**Prompt para Claude:**

```
Você é um especialista em documentação veterinária brasileira.
Gere um array JSON de campos necessários para preencher um "[NOME DO DOC]" veterinário.
Tipo de documento: [TIPO]. Ex: laudo = resultado de exame, receita = prescrição medicamentosa.

Cada campo deve ter:
- field_name (snake_case, único)
- label (PT-BR, para UI)
- type (text / number / date / select / boolean / textarea)
- description (contexto para IA saber o que preencher)
- required (true/false)

Responda APENAS com o array JSON válido, sem markdown, sem explicações adicionais.
```

**Modelo:** `claude-haiku-4-5-20251001` (custo-benefício melhor para extração de schema)

**Exemplo de retorno esperado:**
```json
[
  { "field_name": "achados_ultrassom", "label": "Achados Ultrassonográficos", "type": "textarea", "description": "Descrição detalhada dos achados encontrados no exame", "required": true },
  { "field_name": "conclusao", "label": "Conclusão", "type": "text", "description": "Diagnóstico presuntivo baseado nos achados", "required": true },
  { "field_name": "recomendacoes", "label": "Recomendações", "type": "textarea", "description": "Próximos passos ou investigações recomendadas", "required": false }
]
```

---

## 🔒 Segurança: Nunca Enviar PII

**PROIBIDO ao processar templates:**
- ❌ Nomes de pacientes/tutores
- ❌ CPF/RG
- ❌ Datas de nascimento
- ❌ Resultados de exames reais
- ❌ Diagnósticos reais

**PERMITIDO:**
- ✅ Nome do template ("Laudo de Ultrassom")
- ✅ Tipo do documento ("laudo", "receita")
- ✅ Estrutura esperada de campos

O processamento é **apenas estrutural** — nunca contém dados clínicos reais.

---

## 📝 Tipos de Documentos

| Tipo | Exemplos de Campos | Uso |
|------|-------------------|-----|
| `laudo` | Achados, Conclusão, Recomendações | Resultados de exames (ultrassom, raio-x, lab) |
| `receita` | Medicamento, Dosagem, Frequência, Duração, Instruções | Prescrições medicamentosas |
| `encaminhamento` | Motivo, Especialidade, Histórico Relevante, MV Responsável | Referência para outro especialista |
| `termo` | Tipo (consentimento/cessão/liberdade), Responsável, Data | Documentos legais |
| `exame` | Tipo de Exame, Protocolo, Material Coletado | Solicitações de exame |
| `outro` | Customizado pela clínica | Qualquer documento não padronizado |

---

## 🔗 Integração com Auto-Preenchimento por Voz (Sprint Futura)

Quando o MV ditar:
> "Animal apresenta síndrome do vômito crônico, peso 15kg, suspeita de doença inflamatória intestinal..."

O sistema usará os `extracted_fields` do template selecionado para:
1. Mapear texto transcrito → campo (ex: "síndrome do vômito" → `diagnostico_presuntivo`)
2. Pré-preencher documento com valores extraídos
3. MV revisa e confirma antes de gerar final

---

## ✅ Checklist: Novo Template

Ao criar um novo template, validar:

- [ ] `field_name` é único (não duplica em outro template da clínica)
- [ ] `field_name` segue snake_case (ex: `numero_receita`)
- [ ] `label` é claro em PT-BR
- [ ] `type` é válido (text/number/date/select/boolean/textarea)
- [ ] `description` descreve o que a IA deve extrair
- [ ] `required` reflete importância do campo
- [ ] Nenhum PII no `description` ou `label`

---

## 🚫 Proibições

- ❌ Nomes de pacientes em templates
- ❌ Dados sensíveis hardcoded
- ❌ Campos com `field_name` duplicado na mesma clínica
- ❌ Tipos de campo não listados (apenas: text, number, date, select, boolean, textarea)
- ❌ Enviar conteúdo de arquivo real ao Claude ao processar

---

**Última revisão:** 2026-04-06  
**Status:** ✅ Guia para implementação de document templates
