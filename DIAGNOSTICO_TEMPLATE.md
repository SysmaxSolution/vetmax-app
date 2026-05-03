# 🔧 Diagnóstico: Erro ao Processar Template

## O Problema
Ao clicar em "Processar com IA", o sistema retorna: **"Erro interno ao processar template"**

---

## ✅ Solução Passo a Passo

### Passo 1: Testar a Configuração da API

Abra seu navegador e acesse:

```
http://localhost:4000/api/test-anthropic
```

**Você verá uma resposta em JSON:**

#### ✅ Se mostrar "OK":
```json
{
  "status": "OK",
  "message": "API do Anthropic está funcionando corretamente",
  "apiKeyConfigured": true,
  "apiKeyPreview": "sk-ant-...",
  "anthropicTest": {
    "status": "SUCCESS",
    "modelUsed": "claude-haiku-4-5-20251001",
    "responseText": "{\"test\": \"ok\"}"
  }
}
```
**👉 Neste caso, a API está funcionando. O problema está em outro lugar.**

#### ❌ Se mostrar "ERROR":
```json
{
  "status": "ERROR",
  "message": "ANTHROPIC_API_KEY não está configurada nas variáveis de ambiente",
  "apiKeyConfigured": false,
  "apiKeyPreview": "NÃO CONFIGURADA"
}
```
**👉 Vá para o Passo 2**

---

### Passo 2: Configurar a Variável de Ambiente

A chave de API não está no `.env.local`. Você precisa:

1. **Abra o arquivo:** `C:\SisMax\vetmax-app\.env.local`

2. **Adicione a linha:**
```
ANTHROPIC_API_KEY=sk-ant-SUA_CHAVE_AQUI
```

3. **Onde conseguir a chave:**
   - Acesse: https://console.anthropic.com/
   - Menu "API Keys"
   - Copie sua chave (começa com `sk-ant-`)

4. **Salve o arquivo**

5. **Reinicie o servidor:**
   - Pare o servidor (Ctrl+C)
   - Execute novamente: `npm run dev`
   - Acesse http://localhost:4000

---

### Passo 3: Teste Novamente

1. Vá para **Gestão** → **Importar Novo Modelo**
2. Preencha:
   - Nome: "Laudo de Ultrassom"
   - Tipo: "Laudo"
3. Clique **"Processar com IA"**
4. Deve funcionar agora! 🎉

---

## 🔍 Se Ainda Tiver Erro

### Verifique o Console

1. **Abra DevTools do Navegador:**
   - Pressione `F12` no navegador
   - Vá para aba "Console"

2. **Clique "Processar com IA"**

3. **Procure por erros na cor vermelha**

4. **Copie a mensagem de erro completa**

### Verifique o Terminal

1. **No terminal onde VetMax está rodando**, procure por linhas assim:

```
Processando template: { name: '...', type: '...' }
Erro ao chamar Claude API: AuthenticationError: ...
```

---

## 💡 Causas Possíveis

| Sintoma | Causa | Solução |
|---------|-------|--------|
| `"API_KEY não configurada"` | `.env.local` sem chave | Adicionar `ANTHROPIC_API_KEY` |
| `"Authentication error"` | Chave inválida | Gerar nova chave em console.anthropic.com |
| `"API rate limit exceeded"` | Muitas requisições rápidas | Aguardar alguns minutos |
| `"Invalid model"` | Modelo não existe | Verificar modelo no prompt (deve ser `claude-haiku-4-5-20251001`) |
| `"JSON parsing error"` | Claude não retornou JSON válido | Verificar prompt enviado (veja logs) |
| `"Tipo de campo inválido"` | Campo com tipo errado | Verificar validação em `route.ts` linha 109 |

---

## 📝 Arquivo de Configuração

O arquivo `.env.local` deve ficar assim:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anonkey-aqui
SUPABASE_SERVICE_ROLE_KEY=seu-service-key-aqui

# Anthropic (ADICIONAR ISTO)
ANTHROPIC_API_KEY=sk-ant-SUA_CHAVE_AQUI
```

---

## 🆘 Se Nada Funcionar

1. **Copie a mensagem de erro completa**
2. **Verifique os logs completos no terminal**
3. **Screenshot do erro (F12 Console)**
4. Mande para análise

---

## ✨ Sucesso!

Quando funcionar, você verá:

1. Step 1: "Processando..." com spinner
2. Step 2: Campos gerados automaticamente pelo Claude
3. Você pode editar/adicionar campos manualmente
4. Step 3: Clicar "Confirmar e Salvar"
5. ✅ Template aparece na listagem "Modelos de Documentos"

---

**Data de Criação:** 2026-04-06  
**Última Atualização:** 2026-04-06  
**Status:** Pronto para diagnóstico
