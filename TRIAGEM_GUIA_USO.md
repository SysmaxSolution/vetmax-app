# 📋 Módulo Triagem Veterinária — Guia de Uso

## Acesso Rápido

| Página | URL | Função |
|--------|-----|--------|
| **Dashboard de Triagem** | `/dashboard/triage` | Fila + Histórico |
| **Tela de Triagem (Novo)** | `/dashboard/triage/[id]` | Formulário + Voz |
| **Editar Triagem** | `/dashboard/triage/[id]?edit=true` | Modo edição |

---

## 1️⃣ Fila de Triagem

Ao entrar em `/dashboard/triage`, você vê:

### 🟦 **Fila de Triagem** (Azul)
Lista de animais que acabaram de chegar e aguardam triagem.

**Informações exibidas:**
- 🐕 Espécie com emoji
- Nome do animal
- Raça
- **🚨 ALERTAS em destaque:**
  - ⚠️ Alergias (fundo vermelho)
  - ⚠️ Doenças Crônicas (fundo amarelo)
- Nome do Tutor
- Telefone
- Status: "Recepção" ou "Triagem"

**Ação:** Clique no card para abrir o formulário de triagem

---

### 🟩 **Triagens Realizadas Hoje** (Verde)
Lista de animais já triados e que seguem para o consultório.

**Informações exibidas:**
- Nome e espécie
- Peso (kg) + Temperatura (°C)
- Status:
  - 🔵 "Em Consulta com MV"
  - 🟠 "Aguardando Exame"
  - 🌸 "Medicação"
  - ✅ "Concluída"

**Ação:** Clique para editar dados da triagem (`?edit=true`)

---

## 2️⃣ Formulário de Triagem

### 📊 Cabeçalho Clínico

```
┌─────────────────────────────────────────────┐
│ Bola (Cachorro • Vira-lata)                 │
│ Pelagem: Amarelo e branco                   │
│ Sexo: Macho                                 │
│                                             │
│ ⚠️ ALERGIAS: Frango                         │
│ ⚠️ DOENÇAS: Diabetes                        │
│                                             │
│ Tutor: João Silva                           │
│ (11) 98765-4321                             │
└─────────────────────────────────────────────┘
```

### 📏 Sinais Vitais

**Obrigatórios:**
- **Peso (kg):** `12.5` ← Crítico (usado para dosagem)
- **Temperatura (°C):** `38.5` ← Crítico (temperatura retal)

**Opcionais:**
- **Frequência Cardíaca (bpm):** `85`
- **Frequência Respiratória (mov/min):** `25`

### 💧 Cor de Mucosa (Visual)

Clique em uma das 4 opções:

```
┌─────────────────────────┐
│ 🟥 Rosa (Normal)        │ ← Padrão
├─────────────────────────┤
│ ⬜ Pálida (Anemia?)      │
├─────────────────────────┤
│ 🟨 Ictérica (Icterícia) │
├─────────────────────────┤
│ 🟦 Cianótica (Falta O₂) │
└─────────────────────────┘
```

**Aviso:** Se não for rosa, o MV verá como alerta!

### ⏱️ TRC (Tempo de Reenchimento Capilar)

Teste: Aperte a mucosa rosada 1 segundo e solte

```
○ < 2 segundos (Normal) ← Padrão
○ 2-3 segundos
○ > 3 segundos (Alerta)
```

---

## 3️⃣ 🎙️ Gravação de Voz (O Diferencial!)

### Como Funciona

1. **Clique no botão azul:** "Gravar Áudio"
2. **Fale naturalmente:**
   - "Cachorro apático, parou de comer há 2 dias"
   - "Gato vomitando amarelo e tem diareia"
   - "Coelho com inchaço nas patas traseiras"
3. **Clique em "Parar Gravação"**
4. **IA Processa:**
   - Toast: "🎙️ Transcrição recebida... analisando com IA"
   - Claude Opus enriquece o texto
5. **Resultado:**
   - Campo "Queixa Principal" é atualizado automaticamente
   - Toast: "✓ Áudio transcrito e processado!"

### Exemplo Real

**Você fala:**
```
"Pastorzinho chegou com muito sangramento nasal, 
 o tutor diz que caiu do sofá. Está ofegante."
```

**IA transcreve e processa:**
```
"Epitaxe (sangramento nasal) pós-trauma. 
 Animal apresenta taquipneia. Necessário avaliação 
 de fratura nasal e comprometimento de vias aéreas."
```

✅ Texto já está no formulário!

### Navegadores Compatíveis

| Navegador | Suporte | Nota |
|-----------|---------|------|
| Chrome/Brave | ✅ Sim | Melhor compatibilidade |
| Firefox | ✅ Sim | Pode ser mais lento |
| Safari | ✅ Sim | iOS 14.5+ |
| Edge | ✅ Sim | Completo |

**Se não funcionar:** Digite manualmente na área de texto

---

## 4️⃣ Queixa Principal (Obrigatório)

**Campo:** Textarea grande

**Pode vir de:**
- 🎙️ Transcrição de voz (IA + processamento)
- ⌨️ Digitação manual
- 🔗 Ambos combinados

**Exemplo:**
```
Cachorro apático há 3 dias. 
Vômito amarelo e espumoso. 
Tutor relata diminuição de apetite progressiva.
Não há antecedentes recentes de trauma.
```

**Validação:** Não pode estar vazio ao enviar

---

## 5️⃣ Envio para Consultório

### Botão: "Finalizar e Enviar ao Médico"

**O que acontece:**

1. ✅ Valida peso > 0
2. ✅ Valida temperatura > 0
3. ✅ Valida queixa principal não vazia
4. 💾 Salva tudo em `vital_signs` (JSONB)
5. 🔄 Atualiza status: `triage` → `in_progress`
6. ↩️ Redireciona para `/dashboard/triage`
7. 📢 Toast: "✓ Triagem enviada ao médico!"

### Estrutura Salva no BD

```sql
consultations.vital_signs = {
  "weight": 12.5,
  "temperature": 38.5,
  "heart_rate": 85,
  "respiratory_rate": 25,
  "mucous_color": "pink",
  "crt": "2s",
  "chief_complaint": "Cachorro apático, vômito há 2 dias..."
}
```

**Status transição:**
```
reception/triage → in_progress (aguardando MV)
```

---

## 6️⃣ Modo Edição

**Para entrar:** Clique em card na seção "Triagens Realizadas Hoje"

**URL:** `/dashboard/triage/[id]?edit=true`

**Diferenças:**
- ✏️ Badge azul: "Modo Edição"
- 📝 Botão muda para: "Atualizar Triagem"
- Não altera status (já está em `in_progress`)

---

## ⚠️ Validações e Alertas

| Campo | Validação | Msg Erro |
|-------|-----------|----------|
| Peso | > 0 | "Peso é obrigatório e deve ser > 0" |
| Temperatura | > 0 | "Temperatura é obrigatória e deve ser > 0" |
| Queixa Principal | Não vazio | "Queixa principal é obrigatória" |

---

## 📱 Fluxo Visual Completo

```
┌─────────────────────────────────────────┐
│     RECEPÇÃO → TRIAGEM → MV             │
├─────────────────────────────────────────┤
│                                         │
│  1. Animal chega → Status: "reception"  │
│                                         │
│  2. Aparece na fila azul (/dashboard)   │
│                                         │
│  3. Clique abre tela de triagem         │
│                                         │
│  4. Pesar + Temperatura (obrigatório)   │
│                                         │
│  5. Sinais vitais (opcionais)           │
│                                         │
│  6. 🎙️ Gravar áudio + IA processa       │
│                                         │
│  7. Clique "Finalizar e Enviar"         │
│                                         │
│  8. Status → "in_progress" ✅           │
│                                         │
│  9. MV vê na fila dele                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔒 Segurança

✅ Multi-tenancy: Cada clínica vê só seus dados
✅ RLS policies: Supabase valida clinic_id
✅ Server Actions: Dados validados no backend
✅ Sem exposição de IDs

---

## 📞 Suporte

**Problema:** Voz não funciona
**Solução:** Verifique permissões do navegador (microfone)

**Problema:** Peso não salva
**Solução:** Certifique-se que é > 0

**Problema:** Queixa vazia após voz
**Solução:** Digite manualmente ou repita gravação

---

**Próximo módulo:** Workspace do Médico Veterinário 🩺
