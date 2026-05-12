# Plano de Integração NFS-e — SysVetMax
**Versão:** 1.0 | **Data:** 2026-05-12 | **Status:** Aprovado (planejamento)

---

## Contexto

Clínicas veterinárias emitem **Nota Fiscal de Serviço Eletrônica (NFS-e)** para consultas, cirurgias, banho e tosa, e demais serviços. O VetMax precisa de uma solução que:

1. Permita configuração rápida por clínica (cada município tem regras diferentes)
2. Emita NFS-e automaticamente após confirmação de pagamento no Caixa
3. Notifique o tutor por e-mail com o PDF
4. Seja agnóstica ao provedor/agregador de NFS-e

---

## Decisão de Arquitetura

### Por que usar um Agregador Nacional?

Existem 5.568 municípios no Brasil, cada um com seu próprio sistema de NFS-e (ou sem sistema). Um agregador nacional lida com toda essa complexidade:

| Critério           | Integração Direta  | Agregador Nacional |
|--------------------|--------------------|--------------------|
| Cobertura          | 1 município        | 5.000+ municípios  |
| Manutenção         | Alta (cada prefeitura muda) | Zero (agregador absorve) |
| Custo por nota     | Gratuito (taxas municipais) | ~R$0,08–0,12/nota |
| Tempo implementação| 3–6 meses/município | 1–2 semanas total |
| Certificado digital| Necessário         | Necessário         |

**Conclusão:** Usar agregador para os primeiros 12 meses. Reavaliar integração direta se volume justificar.

### Agregadores Recomendados (em ordem de preferência)

1. **Focus NFe** — `focusnfe.com.br` — API REST, 5.568 municípios, R$0,10/nota
2. **NFe.io** — `nfe.io` — SDK JavaScript nativo, documentação excelente
3. **eNotas** — `enotas.com.br` — Melhor suporte, ligeiramente mais caro
4. **Nota.AI** — `nota.ai` — Mais barato, cobertura menor

---

## Banco de Dados (Migration 0113)

```sql
CREATE TABLE IF NOT EXISTS nfse_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID NOT NULL UNIQUE REFERENCES clinics(id),
  provider         TEXT NOT NULL DEFAULT 'focus_nfe'
                   CHECK (provider IN ('focus_nfe','nfeio','enotas','nota_ai')),
  api_key_enc      TEXT,          -- Armazenar via Supabase Vault
  company_cnpj     TEXT NOT NULL,
  company_ie       TEXT,
  municipio_code   TEXT NOT NULL,  -- Código IBGE 7 dígitos
  municipio_name   TEXT,
  rps_serie        TEXT DEFAULT '1',
  rps_numero_atual INTEGER DEFAULT 1,
  service_code     TEXT NOT NULL,  -- Código do serviço na prefeitura
  cnae             TEXT,           -- CNAE principal (ex: 7500100)
  tax_iss          NUMERIC(5,2),   -- Alíquota ISS (%)
  description_template TEXT,      -- Template da descrição da nota
  is_active        BOOLEAN DEFAULT FALSE,
  emit_on_payment  BOOLEAN DEFAULT TRUE,  -- Emitir automaticamente?
  notify_tutor     BOOLEAN DEFAULT TRUE,  -- Enviar e-mail ao tutor?
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfse_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID NOT NULL REFERENCES clinics(id),
  consultation_id   UUID REFERENCES consultations(id),
  cashier_entry_id  UUID,
  provider_id       TEXT,          -- ID no provedor (Focus NFe, etc.)
  numero            TEXT,          -- Número da NFS-e emitida
  rps_numero        TEXT,
  verificacao_code  TEXT,          -- Código de verificação da prefeitura
  status            TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','issued','error','cancelled')),
  taker_name        TEXT NOT NULL,
  taker_cpf         TEXT,
  taker_cnpj        TEXT,
  taker_email       TEXT,
  taker_address     TEXT,
  service_description TEXT,
  service_value     NUMERIC(12,2) NOT NULL,
  tax_iss_value     NUMERIC(12,2),
  pdf_url           TEXT,
  xml_url           TEXT,
  error_message     TEXT,
  retry_count       INTEGER DEFAULT 0,
  issued_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Fases de Implementação

### Fase 1 — Configuração da Clínica (Sprint 1 · ~2 dias)

**Arquivos:**
- `src/app/dashboard/settings/nfse/page.tsx`
- `src/components/settings/NFSeConfigForm.tsx`
- `src/lib/actions/nfse-config.ts`

**Funcionalidades:**
- Formulário: CNPJ, razão social, município (busca via IBGE API), código do serviço, alíquota ISS, série RPS, API Key do provedor
- Teste de conexão: verificar API Key e emitir RPS de teste
- Toggle "Emissão automática" e "Notificar tutor"
- Armazenar API Key via `Supabase Vault` (nunca em texto plano)

```typescript
// IBGE API para busca de municípios (gratuito)
// GET https://servicodados.ibge.gov.br/api/v1/localidades/municipios
// Filtrar por nome, retornar código IBGE (7 dígitos)
```

---

### Fase 2 — Emissão Manual (Sprint 2 · ~3 dias)

**Arquivos:**
- `src/components/cashier/NFSeEmitButton.tsx`
- `src/lib/actions/nfse-emit.ts`
- Supabase Edge Function: `supabase/functions/emit-nfse/index.ts`

**Fluxo:**
```
Consulta fechada → Pagamento confirmado no Caixa
  → Botão "Emitir NFS-e" aparece
  → Modal: confirmar dados do tomador (tutor)
  → Cria nfse_documents (status: pending)
  → Chama Edge Function emit-nfse
  → Provedor retorna protocol_id
  → Webhook atualiza status → issued / error
  → PDF enviado por e-mail ao tutor (via Resend)
```

---

### Fase 3 — Emissão Automática (Sprint 3 · ~3 dias)

**Trigger:** Após `cashier_sessions` registrar pagamento de consulta com `is_nfse_required = true`

**Implementação:**
- Supabase Database Trigger em `central_cashier` (ou `cashier_outflows`)
- Ao INSERT com `source = 'consultation'` e `clinic_id` com `nfse_configs.emit_on_payment = true`
- Enfileira tarefa de emissão (Edge Function via `pg_net`)
- Edge Function chama API do provedor e registra resultado

```sql
-- Trigger concept (simplified)
CREATE OR REPLACE FUNCTION queue_nfse_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source = 'consultation' THEN
    PERFORM net.http_post(
      url := current_setting('app.edge_function_url') || '/emit-nfse',
      body := json_build_object('consultation_id', NEW.consultation_id)::text
    );
  END IF;
  RETURN NEW;
END;
$$;
```

---

### Fase 4 — Relatórios e Reprocessamento (Sprint 4 · ~2 dias)

**Arquivos:**
- `src/app/dashboard/settings/nfse/relatorio/page.tsx`

**Funcionalidades:**
- Dashboard: notas emitidas / erro / pendentes por mês
- Tabela com filtros: status, período, tutor
- Botão "Reprocessar" para notas com erro
- Exportação CSV para contador
- Badge de alerta no header quando há notas com erro

---

## Integração Focus NFe — Exemplo de Request

```typescript
// POST https://api.focusnfe.com.br/v2/nfse?ref={seu_ref}
// Authorization: Token {api_key}:
const payload = {
  data_emissao:       "2026-05-12",
  prestador: {
    cnpj:             "12.345.678/0001-90",
    inscricao_municipal: "12345",
    codigo_municipio: "3550308",  // São Paulo
  },
  tomador: {
    cpf:              "123.456.789-09",
    razao_social:     "João da Silva",
    email:            "joao@email.com",
  },
  servico: {
    aliquota:         0.02,          // 2% ISS
    base_calculo:     150.00,
    discriminacao:    "Consulta Veterinária - Canino - Labrador",
    iss_retido:       false,
    codigo_municipio: "3550308",
    codigo_tributario_municipio: "01.01",
    item_lista_servico: "0701",
  },
}
```

---

## Checklist de Pré-Requisitos por Clínica

Para cada clínica poder emitir NFS-e:

- [ ] CNPJ da clínica ativo na Receita Federal
- [ ] Inscrição Municipal ativa na prefeitura
- [ ] Certificado Digital A1 (para municípios que exigem)
- [ ] Código do serviço na tabela municipal
- [ ] Alíquota ISS confirmada com o contador
- [ ] Conta no provedor escolhido com saldo/crédito

---

## Estimativa de Custo Operacional

Considerando 100 consultas/mês por clínica:
- Focus NFe: 100 × R$0,10 = **R$10/mês/clínica**
- NFe.io:    100 × R$0,09 = **R$9/mês/clínica**

Custo mínimo para viabilizar: 20+ consultas/mês (comum para qualquer clínica ativa).

---

## Próximos Passos

1. Contratar conta no Focus NFe (ou provedor escolhido pelo cliente)
2. Criar Migration 0113 (schema acima)
3. Implementar Fase 1 (configuração) como MVP para testar 1 clínica piloto
4. Validar emissão em ambiente sandbox antes de produção
5. Rollout gradual: habilitar módulo `nfse` em `active_modules` clínica por clínica
