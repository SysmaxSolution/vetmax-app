# 🔧 Configuração de Navegação e Roles

## Problema Original

O menu de navegação não estava visível. As abas (Triagem, Consultório, etc.) estavam faltando.

## Solução Implementada

### 1. Novo Componente: DashboardHeader

Criado em `src/components/layout/DashboardHeader.tsx`

**O que faz:**
- Renderiza navegação superior com abas
- Mostra abas baseado na `role` do usuário
- Exibe informações do usuário e clínica
- Botões de Configurações e Logout

**Abas por role:**

| Role | Abas Visíveis |
|------|--------------|
| `receptionist` | Recepção |
| `assistant` | Recepção, Triagem, Exames, Farmácia |
| `vet` | Recepção, Consultório, Exames |
| `pharmacist` | Farmácia, Exames |
| `admin` | Todas as abas (Recepção, Triagem, Consultório, Exames, Farmácia) |

### 2. Página de Configurações

Acessível em `/dashboard/settings`

**O que mostra:**
- ✅ UUID do usuário (User ID)
- ✅ Email da conta
- ✅ Nome completo
- ✅ Role atual
- ✅ Clinic ID
- ✅ CRMV (se veterinário)

**Funcionalidade:**
- Botões rápidos para mudar role
- Clique no botão e a role é atualizada automaticamente

---

## Como Usar

### Passo 1: Acessar Configurações

1. Faça login em http://localhost:4000
2. Clique em ⚙️ (Settings) no topo direito
3. Você será redirecionado para `/dashboard/settings`

### Passo 2: Ver seu UUID

A página mostra seu UUID em um box azul no topo:

```
UUID do Usuário (User ID):
a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6
```

**Copie este valor** - você vai usar para referência.

### Passo 3: Atualizar Role

Na mesma página, role a tela para baixo até encontrar **"Alterar Role"**.

Clique no botão correspondente à role desejada:
- 🔴 **ADMIN** — Acesso a tudo
- 🟡 **ASSISTANT** — Acesso a Triagem + Exames + Farmácia
- 🟢 **VET** — Acesso a Consultório + Exames
- 🟣 **RECEPTIONIST** — Acesso a Recepção
- 🟠 **PHARMACIST** — Acesso a Farmácia

**A página recarregará automaticamente** e:
1. Sua role será atualizada
2. O menu de navegação mostrará apenas as abas permitidas
3. Um ✓ aparecerá no botão da nova role

---

## APIs Disponíveis

### GET /api/get-current-user

Retorna informações do usuário logado (apenas logado).

```bash
curl http://localhost:4000/api/get-current-user
```

**Resposta:**
```json
{
  "user_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
  "email": "usuario@exemplo.com",
  "role": "assistant",
  "clinic_id": "clinic-123",
  "full_name": "João Silva"
}
```

### POST /api/update-user-role

Atualiza a role do usuário logado.

```bash
curl -X POST http://localhost:4000/api/update-user-role \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

**Parâmetro obrigatório:**
- `role`: "admin" | "vet" | "assistant" | "receptionist" | "pharmacist"

**Resposta:**
```json
{
  "success": true,
  "user_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
  "new_role": "admin",
  "message": "Role atualizada para 'admin'"
}
```

---

## Estrutura do Menu

```
┌─────────────────────────────────────────────────────────┐
│ VetMax                          Olá, João   🟢 ASSISTANT │
│ Clínica Exemplo                                          │
├─────────────────────────────────────────────────────────┤
│  👋 Recepção  ⚕️ Triagem  🩺 Consultório  🔬 Exames  💊 Farmácia  ⚙️  🚪 │
└─────────────────────────────────────────────────────────┘
```

**Legenda:**
- 👋 Recepção — Check-in de pets
- ⚕️ Triagem — Coleta de sinais vitais (para Auxiliar Vet)
- 🩺 Consultório — Atendimento clínico (para Médico Vet)
- 🔬 Exames — Ordenação e resultados
- 💊 Farmácia — Prescrição e dispensação
- ⚙️ Settings — Configurações da conta
- 🚪 Logout — Sair do sistema

---

## Caso de Uso: Você é um Auxiliar Veterinário

### Situação
Você fez login, mas **não vê a aba de Triagem**.

### Solução
1. Acesse http://localhost:4000/dashboard/settings
2. Role para "Alterar Role"
3. Clique em **ASSISTANT**
4. A página recarrega
5. Agora você vê a aba ⚕️ **Triagem** no menu!

---

## Caso de Uso: Você é um Admin

### Situação
Você quer ver **todas as abas** do sistema.

### Solução
1. Acesse http://localhost:4000/dashboard/settings
2. Role para "Alterar Role"
3. Clique em **ADMIN**
4. Pronto! Agora você vê:
   - 👋 Recepção
   - ⚕️ Triagem
   - 🩺 Consultório
   - 🔬 Exames
   - 💊 Farmácia

---

## Componentes Atualizados

### Páginas com Header
- ✅ `/dashboard/reception` — Agora tem header com navegação
- ✅ `/dashboard/triage` — Agora tem header com navegação
- ✅ `/dashboard/triage/[id]` — Agora tem header com navegação

### Novas Páginas
- ✅ `/dashboard/settings` — Configurações do usuário

### Novos Componentes
- ✅ `DashboardHeader.tsx` — Componente de navegação

### Novos Endpoints
- ✅ `/api/get-current-user` — Obter dados do usuário
- ✅ `/api/update-user-role` — Atualizar role do usuário

---

## Próximos Passos

1. **Páginas do VET:** Criar `/dashboard/vet` com header
2. **Páginas de EXAMES:** Criar `/dashboard/exams` com header
3. **Páginas de FARMÁCIA:** Criar `/dashboard/pharmacy` com header
4. **Logout:** Implementar endpoint `/auth/logout`
5. **Middleware:** Validar roles no servidor (RLS policies)

---

## Debug

### Não vejo o header?
- Verifique se está logado
- Acesse uma página do dashboard (reception ou triage)
- Se ainda não aparecer, recarregue (F5)

### Role não muda?
- Verifique console do navegador (F12)
- Procure por erros de rede
- Certifique-se de que está logado

### Faltam abas?
- Sua role pode não ter permissão
- Role pode estar incorreta no banco de dados
- Verifique em `/dashboard/settings` qual é sua role atual

---

## Estrutura JSON: Roles e Permissions

```javascript
const rolePermissions = {
  admin: {
    description: 'Administrador - acesso total',
    tabs: ['reception', 'triage', 'vet', 'exams', 'pharmacy'],
  },
  vet: {
    description: 'Médico Veterinário',
    tabs: ['reception', 'vet', 'exams'],
  },
  assistant: {
    description: 'Auxiliar Veterinário',
    tabs: ['reception', 'triage', 'exams', 'pharmacy'],
  },
  receptionist: {
    description: 'Recepcionista',
    tabs: ['reception'],
  },
  pharmacist: {
    description: 'Farmacêutico',
    tabs: ['pharmacy', 'exams'],
  },
}
```

---

**Status:** ✅ Implementado
**Build:** ✅ Sem erros
**Servidor:** ✅ Rodando em http://localhost:4000

Próximo passo: Acesse `/dashboard/settings` e atualize sua role! 🎉
