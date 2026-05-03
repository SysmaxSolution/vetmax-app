# Sprint: Módulo de Gestão e Templates Inteligentes

**Data:** 2026-04-06  
**Status:** ✅ **COMPLETO E FUNCIONANDO**

---

## 📋 O Que Foi Implementado

### 1. ✅ Migration: document_templates

**Arquivo:** `supabase/migrations/0007_document_templates.sql`

Nova tabela para armazenar templates customizados por clínica:
- `id` (UUID primary key)
- `clinic_id` (FK, obrigatório, isolamento multi-tenancy)
- `name` (texto, nome do documento)
- `type` (enum: laudo/receita/encaminhamento/termo/exame/outro)
- `file_url` (opcional, para upload real em sprint futuro)
- `extracted_fields` (JSONB array com schema dos campos)
- `created_at`, `updated_at` (timestamps)

**Segurança:** RLS habilitado com policies de clinic isolation

---

### 2. ✅ Skill: document_processing.md

**Arquivo:** `skills/document_processing.md`

Guia completo para implementação e segurança de document templates:
- Schema JSONB obrigatório (field_name, label, type, description, required)
- Nunca enviar PII ao processar templates
- Tipos de campos permitidos: text, number, date, select, boolean, textarea
- Contexto por tipo de documento (laudo, receita, etc)
- Integração com auto-preenchimento por voz (sprint futura)

---

### 3. ✅ Tipos TypeScript

**Arquivo:** `src/types/index.ts`

Interfaces adicionadas:
- `TemplateType` = 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
- `FieldType` = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea'
- `ExtractedField` (field_name, label, type, description, required)
- `DocumentTemplate` (id, clinic_id, name, type, file_url, extracted_fields, created_at)
- `SaveTemplatePayload` para criação

---

### 4. ✅ Server Actions: templates.ts

**Arquivo:** `src/lib/actions/templates.ts`

3 actions implementadas:

- **`getTemplates()`** → `DocumentTemplate[] | { error }`
  - Lista todos os templates da clínica
  - Filtra automaticamente por clinic_id via RLS
  - Ordena por data (mais recentes primeiro)

- **`saveTemplate(payload)`** → `{ id: string } | { error }`
  - Valida nome, tipo, campos
  - Verifica se usuário é admin
  - Insere via admin client (bypass RLS)
  - Revalida cache

- **`deleteTemplate(id)`** → `{ success: true } | { error }`
  - Apenas admin pode deletar
  - Filtra por clinic_id para segurança
  - Revalida cache

---

### 5. ✅ API Route: /api/process-template

**Arquivo:** `src/app/api/process-template/route.ts`

POST endpoint que processa novo template via Claude:

**Input:** `{ name: string, type: string }`  
**Output:** `{ fields: ExtractedField[] } | { error }`

**Fluxo:**
1. Validação de input
2. Monta prompt contextual (tipo-específico)
3. Chama Claude Haiku com prompt de extração de campos
4. Faz parsing JSON da resposta
5. Valida tipos de campo
6. Retorna array de `ExtractedField`

**Modelo:** `claude-haiku-4-5-20251001` (otimizado para custo/velocidade)

---

### 6. ✅ DashboardHeader: Aba Gestão

**Arquivo:** `src/components/layout/DashboardHeader.tsx`

- Importado `BarChart3` icon
- Adicionado tab ao array `allTabs`:
  - Label: "Gestão"
  - Href: "/dashboard/management"
  - Roles: ['admin'] (visível apenas para admin)
  - Icon: BarChart3

---

### 7. ✅ Page: /dashboard/management/page.tsx

**Arquivo:** `src/app/dashboard/management/page.tsx`

Server Component que:
- Auth check + redirect se não autenticado
- Validação de admin role (redireciona se não admin)
- Carrega templates via `getTemplates()`
- Renderiza `<DashboardHeader>` + `<ManagementWorkspace>`
- Padrão exato das outras páginas de dashboard

---

### 8. ✅ Component: ManagementWorkspace.tsx

**Arquivo:** `src/components/management/ManagementWorkspace.tsx`

Client Component com:

**Features:**
- Header com título e descrição
- Seção "Modelos de Documentos" com contador
- Botão "Importar Novo Modelo" (abre modal)
- Listagem de templates com:
  - Nome do template
  - Badge com tipo (cores específicas por tipo)
  - Contagem de campos
  - Data de criação
  - Botão deletar
  - Preview dos campos (primeiros 3 + contador de mais)

**Estado:**
- `templates` — lista de templates
- `showModal` — controla abertura/fechamento do modal
- `deletingId` — controla estado de loading ao deletar
- `toast` — notificações de sucesso/erro

**Cores por tipo:**
- laudo → blue
- receita → green
- encaminhamento → orange
- termo → purple
- exame → teal
- outro → slate

---

### 9. ✅ Component: ImportTemplateModal.tsx

**Arquivo:** `src/components/management/ImportTemplateModal.tsx`

Modal em 3 steps com fluxo completo:

**Step 1: Upload**
- Input "Nome do Documento" (obrigatório)
- Select "Tipo de Documento" (6 opções)
- Dropzone visual (drag-and-drop HTML5 nativo, sem react-dropzone)
- Botão "Processar com IA"

**Step 2: Review**
- Loading state enquanto processa
- Lista de campos detectados pela IA
- Preview de cada campo: label, type badge, description, field_name
- Botão "Remover" para cada campo
- Botão "Adicionar Campo Manual"
- Botão "Confirmar e Salvar"

**Step 3: Adding Field (Inline)**
- Form para adicionar campo manualmente:
  - Label (obrigatório)
  - Field Name (auto-gerado ou manual)
  - Type select (6 tipos)
  - Description (obrigatório)
  - Checkbox "Obrigatório"
- Validação de campos
- Voltar para Step 2

**Features extras:**
- Error handling em cada step
- Toast de sucesso/erro
- Desabilitar botões durante loading
- Modal com backdrop blur
- Ícones e estados visuais

---

## 🚀 Como Usar (User Manual)

### Fazer Upload do Primeiro Modelo

1. **Login** na clínica com usuário admin
2. **Clicar em "Gestão"** no header (aba nova)
3. **Clicar "Importar Novo Modelo"**
4. **Preencher:**
   - Nome: "Laudo de Ultrassom" (ex)
   - Tipo: "Laudo"
5. **Clicar "Processar com IA"**
   - IA vai gerar campos automaticamente (ex: Achados, Conclusão, Recomendações)
6. **Review os campos:**
   - Pode remover campos que não faz sentido
   - Pode adicionar campos manualmente
7. **Clicar "Confirmar e Salvar"**
8. **Sucesso!** Template aparece na listagem

### Adicionar Campo Manual

1. No Step 2, clicar "Adicionar Campo Manual"
2. Preencher:
   - Label: "Veterinário Responsável"
   - Field Name: auto-gerado como `veterinario_responsavel`
   - Type: "text"
   - Description: "Nome do médico veterinário"
   - Obrigatório: sim/não
3. Clicar "Adicionar e Voltar"
4. Campo aparece na listagem

### Deletar Template

1. Na listagem, clicar no ícone 🗑️
2. Template é deletado imediatamente (sem confirmação)
3. Lista atualiza automaticamente

---

## 📊 Arquivos Criados

```
supabase/
  migrations/
    0007_document_templates.sql         ✅ Novo

skills/
  document_processing.md                ✅ Novo

src/
  types/
    index.ts                            ✅ Editado (tipos adicionados)
  
  lib/
    actions/
      templates.ts                      ✅ Novo (3 server actions)
  
  app/
    api/
      process-template/
        route.ts                        ✅ Novo (POST endpoint)
    
    dashboard/
      management/
        page.tsx                        ✅ Novo (server component)
  
  components/
    layout/
      DashboardHeader.tsx               ✅ Editado (aba Gestão adicionada)
    
    management/
      ManagementWorkspace.tsx           ✅ Novo (client component)
      ImportTemplateModal.tsx           ✅ Novo (modal 3-steps)
```

---

## 🧪 Build Status

✅ **Build passou com sucesso!**

Routes criadas:
- ✅ `GET /dashboard/management`
- ✅ `POST /api/process-template`

TypeScript type checking: ✅ Passou

---

## 🎯 Próximos Passos (Sprint Futura)

### Sprint N+1: Upload Real de Arquivos
- Supabase Storage integration
- Armazenar arquivo real (PDF/DOCX)
- Parser avançado para extrair campos automaticamente

### Sprint N+2: Auto-Preenchimento por Voz
- Usar `extracted_fields` do template para mapear campos
- Integração com transcrição (já existe em Web Speech API)
- Pré-preenchimento automático durante ditado

### Sprint N+3: Gestão Avançada
- Duplicar template
- Editar template existente
- Drag-and-drop para reordenar campos
- Preview de documento final

---

## 🔒 Segurança Implementada

✅ **Multi-tenancy:** clinic_id em toda parte + RLS policies  
✅ **Role-based:** Apenas admin pode gerenciar templates  
✅ **No PII:** Nunca enviar dados sensíveis ao Claude  
✅ **Validação:** Todos os inputs validados server-side + client-side  
✅ **Error Handling:** Try-catch com mensagens em PT-BR  
✅ **Revalidation:** Cache revalidado após mudanças  

---

## ✅ Checklist Final

- [x] Migration criada e com RLS
- [x] Skill de document_processing criada
- [x] Tipos TypeScript adicionados
- [x] 3 Server Actions implementadas
- [x] API Route para Claude integration
- [x] DashboardHeader atualizado
- [x] Page de management criada
- [x] ManagementWorkspace implementado
- [x] ImportTemplateModal com 3 steps
- [x] Build passou (TypeScript + Next.js)
- [x] Documentação completa

**STATUS:** 🟢 **PRONTO PARA TESTES**

---

**Próximo comando:** Faça o upload do seu primeiro modelo de laudo na área de Gestão! 🎉
