# GROOMING_ARCHITECTURE.md — Phase 2 (ARCHITECT_AGENT)

**Versão:** 2.0  
**Data:** 2026-04-23  
**Status:** Architecture Complete  
**Architect Agent:** Mozart Phase 2 (ARCHITECT_AGENT)  
**Base Spec:** GROOMING_SPEC.md (Phase 1 — 9 User Stories, 25 Business Rules)

---

## 📋 ÍNDICE

1. [Schema ER Completo — 7 Tabelas Novas](#schema-er-completo--7-tabelas-novas)
2. [Alterações em Tabelas Existentes](#alterações-em-tabelas-existentes)
3. [API Endpoints — 10 Rotas](#api-endpoints--10-rotas)
4. [RPC Supabase — 4 Funções](#rpc-supabase--4-funções)
5. [Fluxo de Integração com Recepção](#fluxo-de-integração-com-recepção)
6. [Event-Driven Patterns](#event-driven-patterns)
7. [Dependências e Integrações Externas](#dependências-e-integrações-externas)
8. [Performance e Índices](#performance-e-índices)
9. [RLS Policies e Segurança](#rls-policies-e-segurança)
10. [Glossário e Referências](#glossário-e-referências)

---

## SCHEMA ER COMPLETO — 7 TABELAS NOVAS

### 1. `professional_schedules` — Agendas por Profissional

**Finalidade:** Definir disponibilidade de profissional em blocos de tempo (slots)

```sql
CREATE TABLE IF NOT EXISTS professional_schedules (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id       uuid            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date                  date            NOT NULL,
  start_time            time            NOT NULL,
  end_time              time            NOT NULL,
  available             boolean         DEFAULT true,
  capacity              integer         DEFAULT 3
    CHECK (capacity BETWEEN 1 AND 5),
  service_type          text            NOT NULL DEFAULT 'banho_tosa'
    CHECK (service_type IN ('banho', 'tosa', 'banho_tosa')),
  notes                 text,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT valid_time_range CHECK (start_time < end_time),
  CONSTRAINT no_overlapping_schedules UNIQUE (clinic_id, professional_id, date, start_time)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prof_schedules_clinic_date
  ON professional_schedules(clinic_id, date);

CREATE INDEX IF NOT EXISTS idx_prof_schedules_professional
  ON professional_schedules(professional_id, clinic_id);

CREATE INDEX IF NOT EXISTS idx_prof_schedules_availability
  ON professional_schedules(clinic_id, available, date)
  WHERE available = true;

-- Trigger updated_at
CREATE TRIGGER trg_professional_schedules_updated_at
  BEFORE UPDATE ON professional_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE professional_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_prof_schedules"
  ON professional_schedules FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

**Campos:**
- `id` (uuid, PK): Identificador único
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `professional_id` (uuid, FK profiles): Profissional (banhista, tosador, multi-skill)
- `date` (date): Data da agenda
- `start_time` (time): Horário início (ex: 09:00)
- `end_time` (time): Horário fim (ex: 10:00)
- `available` (boolean, default true): Flag para marcar como indisponível
- `capacity` (int, default 3): Máximo de pets simultâneos
- `service_type` (enum): Tipo de serviço que oferece
- `notes` (text, nullable): Observações (ex: "feriado", "manutenção")
- `created_at`, `updated_at` (timestamps UTC)

---

### 2. `grooming_slots` — Slots Gerenciais (Agregação)

**Finalidade:** Gerenciar slots por profissional com contagem de bookings

```sql
CREATE TABLE IF NOT EXISTS grooming_slots (
  id                        uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_schedule_id  uuid            NOT NULL REFERENCES professional_schedules(id) ON DELETE CASCADE,
  date                      date            NOT NULL,
  start_time                time            NOT NULL,
  end_time                  time            NOT NULL,
  capacity                  integer         NOT NULL DEFAULT 3,
  booked_count              integer         NOT NULL DEFAULT 0
    CHECK (booked_count >= 0),
  status                    text            NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'full', 'cancelled')),
  created_at                timestamptz     NOT NULL DEFAULT now(),
  updated_at                timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT slot_not_overbooked CHECK (booked_count <= capacity)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_grooming_slots_clinic_date
  ON grooming_slots(clinic_id, date, start_time);

CREATE INDEX IF NOT EXISTS idx_grooming_slots_professional
  ON grooming_slots(professional_schedule_id, status);

CREATE INDEX IF NOT EXISTS idx_grooming_slots_availability
  ON grooming_slots(clinic_id, status, date)
  WHERE status != 'cancelled';

-- Trigger updated_at
CREATE TRIGGER trg_grooming_slots_updated_at
  BEFORE UPDATE ON grooming_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE grooming_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_grooming_slots"
  ON grooming_slots FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

**Campos:**
- `id` (uuid, PK): Identificador único do slot
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `professional_schedule_id` (uuid, FK professional_schedules): Link para agenda profissional
- `date` (date): Data do slot
- `start_time`, `end_time` (time): Horário
- `capacity` (int): Máximo de pets (herda de professional_schedules)
- `booked_count` (int, default 0): Número de pets já agendados
- `status` (enum): available, full, cancelled
- `created_at`, `updated_at` (timestamps UTC)

---

### 3. `grooming_slot_assignments` — Posição em Fila

**Finalidade:** Rastrear posição do pet na fila de um slot

```sql
CREATE TABLE IF NOT EXISTS grooming_slot_assignments (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id   uuid            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  grooming_slot_id      uuid            NOT NULL REFERENCES grooming_slots(id) ON DELETE CASCADE,
  professional_id       uuid            NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  position_in_queue     integer         NOT NULL DEFAULT 0,
  assigned_at           timestamptz     NOT NULL DEFAULT now(),
  created_at            timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT unique_session_slot UNIQUE (grooming_session_id, grooming_slot_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_slot_assignments_slot_position
  ON grooming_slot_assignments(grooming_slot_id, position_in_queue);

CREATE INDEX IF NOT EXISTS idx_slot_assignments_professional
  ON grooming_slot_assignments(professional_id, clinic_id);

CREATE INDEX IF NOT EXISTS idx_slot_assignments_session
  ON grooming_slot_assignments(grooming_session_id);

-- RLS
ALTER TABLE grooming_slot_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_slot_assignments"
  ON grooming_slot_assignments FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

**Campos:**
- `id` (uuid, PK): Identificador único
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `grooming_session_id` (uuid, FK grooming_sessions): Link para sessão
- `grooming_slot_id` (uuid, FK grooming_slots): Link para slot
- `professional_id` (uuid, FK profiles): Profissional atribuído
- `position_in_queue` (int): Posição sequencial (0-indexed)
- `assigned_at` (timestamptz): Momento da atribuição
- `created_at` (timestamptz): Timestamp de criação

---

### 4. `grooming_status_transitions` — Audit Log Imutável (WORM)

**Finalidade:** Registrar cada mudança de status (Write Once Read Many)

```sql
CREATE TABLE IF NOT EXISTS grooming_status_transitions (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id   uuid            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  from_status           text            NOT NULL
    CHECK (from_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
  to_status             text            NOT NULL
    CHECK (to_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
  actor_id              uuid            NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role            text            NOT NULL
    CHECK (actor_role IN ('tutor', 'recepcionista', 'banhista', 'tosador', 'gerente', 'admin')),
  reason                text,
  metadata              jsonb           DEFAULT '{}',
  timestamp             timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT no_self_transition CHECK (from_status != to_status)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transitions_session
  ON grooming_status_transitions(clinic_id, grooming_session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_transitions_actor
  ON grooming_status_transitions(actor_id, clinic_id);

CREATE INDEX IF NOT EXISTS idx_transitions_status
  ON grooming_status_transitions(clinic_id, from_status, to_status);

-- RLS (WORM — append only)
ALTER TABLE grooming_status_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_transitions"
  ON grooming_status_transitions FOR SELECT TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "append_only_transitions"
  ON grooming_status_transitions FOR INSERT TO authenticated
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- NO UPDATE/DELETE policies (WORM enforcement)
```

**Campos:**
- `id` (uuid, PK): Identificador único (imutável)
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `grooming_session_id` (uuid, FK grooming_sessions): Link para sessão
- `from_status`, `to_status` (enum): Estados anterior e novo
- `actor_id` (uuid, FK profiles): Quem realizou a transição
- `actor_role` (enum): Papel do ator no momento
- `reason` (text): Motivo/observação (ex: "check-in realizado", "fila aguardando")
- `metadata` (jsonb): Dados adicionais (ex: `{professional_assigned: true, slot_id: "..."}`)
- `timestamp` (timestamptz, UTC): Momento exato (imutável)

**Restrição de Segurança:** Apenas INSERT e SELECT permitidos, nunca UPDATE/DELETE.

---

### 5. `professional_unavailability` — Períodos de Indisponibilidade

**Finalidade:** Marcar férias, licenças, emergências

```sql
CREATE TABLE IF NOT EXISTS professional_unavailability (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id       uuid            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date            date            NOT NULL,
  end_date              date            NOT NULL,
  reason                text            NOT NULL DEFAULT 'vacation'
    CHECK (reason IN ('vacation', 'sick_leave', 'emergency', 'training', 'other')),
  notes                 text,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT valid_date_range CHECK (start_date <= end_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_unavailability_professional
  ON professional_unavailability(professional_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_unavailability_date_range
  ON professional_unavailability(clinic_id, start_date, end_date);

-- Trigger updated_at
CREATE TRIGGER trg_unavailability_updated_at
  BEFORE UPDATE ON professional_unavailability
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE professional_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_unavailability"
  ON professional_unavailability FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

**Campos:**
- `id` (uuid, PK): Identificador único
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `professional_id` (uuid, FK profiles): Profissional indisponível
- `start_date`, `end_date` (date): Período (inclusive em ambos os lados)
- `reason` (enum): vacation, sick_leave, emergency, training, other
- `notes` (text): Detalhes adicionais
- `created_at`, `updated_at` (timestamps UTC)

---

### 6. `grooming_product_log` — Consumo de Produtos

**Finalidade:** Rastrear produtos utilizados por sessão para controle de estoque e custo

```sql
CREATE TABLE IF NOT EXISTS grooming_product_log (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  grooming_session_id   uuid            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  clinic_id             uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  product_id            uuid            NOT NULL REFERENCES clinic_catalog(id) ON DELETE SET NULL,
  quantity_used         numeric(10,3)   NOT NULL,
  unit                  text            NOT NULL DEFAULT 'ml'
    CHECK (unit IN ('ml', 'g', 'unit')),
  stage                 text            NOT NULL DEFAULT 'bathing'
    CHECK (stage IN ('bathing', 'grooming', 'drying')),
  recorded_by           uuid            NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT valid_quantity CHECK (quantity_used > 0)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_product_log_session
  ON grooming_product_log(grooming_session_id, stage);

CREATE INDEX IF NOT EXISTS idx_product_log_product
  ON grooming_product_log(product_id, clinic_id);

CREATE INDEX IF NOT EXISTS idx_product_log_date
  ON grooming_product_log(clinic_id, created_at DESC);

-- RLS
ALTER TABLE grooming_product_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_product_log"
  ON grooming_product_log FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

**Campos:**
- `id` (uuid, PK): Identificador único
- `grooming_session_id` (uuid, FK grooming_sessions): Link para sessão
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `product_id` (uuid, FK clinic_catalog): Link para produto do catálogo
- `quantity_used` (numeric): Quantidade utilizada (pode ser fração)
- `unit` (enum): ml, g, unit (unidade)
- `stage` (enum): bathing, grooming, drying (em qual etapa foi usado)
- `recorded_by` (uuid, FK profiles): Quem registrou o uso
- `created_at` (timestamptz): Timestamp de registro

---

### 7. `grooming_documents` — Documentos Gerados

**Finalidade:** Armazenar comprovantes, recibos, termos assinados

```sql
CREATE TABLE IF NOT EXISTS grooming_documents (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  grooming_session_id   uuid            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  clinic_id             uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  document_type        text            NOT NULL
    CHECK (document_type IN ('receipt', 'term', 'checklist', 'note', 'photo')),
  file_url              text,
  file_path             text,
  document_data         jsonb,
  created_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT one_of_file_or_data CHECK ((file_url IS NOT NULL) OR (document_data IS NOT NULL))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_documents_session
  ON grooming_documents(grooming_session_id, document_type);

CREATE INDEX IF NOT EXISTS idx_documents_clinic
  ON grooming_documents(clinic_id, created_at DESC);

-- RLS
ALTER TABLE grooming_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_documents"
  ON grooming_documents FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

**Campos:**
- `id` (uuid, PK): Identificador único
- `grooming_session_id` (uuid, FK grooming_sessions): Link para sessão
- `clinic_id` (uuid, FK clinic): Isolamento multi-tenant
- `document_type` (enum): receipt, term, checklist, note, photo
- `file_url` (text): URL de arquivo (cloud storage)
- `file_path` (text): Caminho local/relativo
- `document_data` (jsonb): Dados estruturados (ex: JSON de recibo)
- `created_by` (uuid, FK profiles): Criador
- `created_at` (timestamptz): Timestamp de criação

---

## ALTERAÇÕES EM TABELAS EXISTENTES

### `grooming_sessions` — Extensão (Migration 0041_extend_grooming_sessions)

Estender tabela existente com novos campos para suportar agendamento rigoroso:

```sql
-- Novos campos
ALTER TABLE grooming_sessions
  ADD COLUMN IF NOT EXISTS professional_schedule_id uuid REFERENCES professional_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grooming_slot_id uuid REFERENCES grooming_slots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_in_queue integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'scheduled'
    CHECK (current_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
  ADD COLUMN IF NOT EXISTS check_in_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS check_out_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS term_signed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_in_checklist jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS receipt_json jsonb DEFAULT NULL;

-- Índices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_slot
  ON grooming_sessions(grooming_slot_id);

CREATE INDEX IF NOT EXISTS idx_grooming_sessions_assigned
  ON grooming_sessions(assigned_to, clinic_id)
  WHERE current_status NOT IN ('cancelled', 'delivered');

CREATE INDEX IF NOT EXISTS idx_grooming_sessions_status_date
  ON grooming_sessions(clinic_id, current_status, scheduled_at DESC);
```

**Novos Campos:**
- `professional_schedule_id`: FK para agenda do profissional (para rastrear qual profissional)
- `grooming_slot_id`: FK para slot (para rastrear em qual slot foi agendado)
- `assigned_to`: FK para profissional atribuído (pode ser diferente durante o dia)
- `position_in_queue`: Posição sequencial (se em fila)
- `current_status`: Estado atual unificado (substitui antigo `status`)
- `check_in_by`: Recepcionista que fez check-in
- `check_out_by`: Recepcionista que fez checkout
- `arrived_at`: Timestamp de chegada
- `delivered_at`: Timestamp de entrega
- `term_signed`: Flag se tutor assinou termo
- `check_in_checklist`: JSONB com checklist de check-in (alergias confirmadas, etc.)
- `receipt_json`: JSONB com dados de recibo (preços, desconto, etc.)

---

### `profiles` — Campo de Tipo Profissional (Migration 0041)

Adicionar informação sobre tipo de profissional de grooming:

```sql
-- Estender tipos de role se necessário
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS professional_type text
    CHECK (professional_type IN ('banhista', 'tosador', 'multi_skill', NULL));

-- Índice para filtrar profissionais de grooming
CREATE INDEX IF NOT EXISTS idx_profiles_grooming
  ON profiles(clinic_id, professional_type)
  WHERE professional_type IS NOT NULL;
```

---

### `clinic_catalog` — Já Estendido (Migration 0040)

Verificar que `item_type` inclui 'grooming' — JÁ FEITO NA MIGRATION 0040:

```sql
-- Já existe em 0040:
ALTER TABLE clinic_catalog
  ADD CONSTRAINT clinic_catalog_item_type_check
  CHECK (item_type IN ('consultation', 'medication', 'exam', 'other', 'grooming'));
```

---

## API ENDPOINTS — 10 ROTAS

Implementação em `/src/app/api/grooming/`:

### 1. POST `/api/grooming/professional-schedules`

**Descrição:** Criar agenda de profissional (slots para semana/mês)

**Permissão:** GERENTE, ADMIN

**Payload:**
```json
{
  "clinic_id": "uuid",
  "professional_id": "uuid",
  "schedules": [
    {
      "date": "2026-04-28",
      "start_time": "09:00",
      "end_time": "10:00",
      "capacity": 3,
      "service_type": "banho_tosa",
      "notes": "segunda-feira normal"
    },
    {
      "date": "2026-04-28",
      "start_time": "10:00",
      "end_time": "11:00",
      "capacity": 3,
      "service_type": "banho_tosa"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "created_count": 2,
  "schedules": [
    {
      "id": "uuid",
      "professional_id": "uuid",
      "date": "2026-04-28",
      "start_time": "09:00",
      "end_time": "10:00",
      "capacity": 3,
      "created_at": "2026-04-23T14:30:00Z"
    }
  ]
}
```

**Validações:**
- Usuário deve ser GERENTE ou ADMIN da clínica
- `professional_id` deve existir e ser da clínica
- Não permitir overlapping de slots para mesmo profissional
- `start_time < end_time`

**Lógica de Negócio:**
- Para cada schedule, criar row em `professional_schedules`
- Também criar row em `grooming_slots` (agregação)

---

### 2. GET `/api/grooming/available-slots`

**Descrição:** Listar slots disponíveis para agendamento

**Permissão:** TUTOR, RECEPCIONISTA, GERENTE, ADMIN

**Query Params:**
```
?clinic_id=uuid
&date_start=2026-04-28
&date_end=2026-05-04
&service_type=banho_tosa
&professional_id=uuid (opcional, filtro)
```

**Response:**
```json
{
  "slots": [
    {
      "id": "uuid",
      "date": "2026-04-28",
      "start_time": "09:00",
      "end_time": "10:00",
      "professional_id": "uuid",
      "professional_name": "João (Banhista)",
      "capacity": 3,
      "booked_count": 2,
      "available": true,
      "service_type": "banho_tosa"
    }
  ],
  "total": 45,
  "page": 1,
  "page_size": 20
}
```

**Validações:**
- Filtrar por `available = true` e `status != 'cancelled'`
- Filtrar por `booked_count < capacity`
- Respeitar RLS (TUTOR vê apenas slots da clínica onde agendou)

---

### 3. POST `/api/grooming/schedule-session`

**Descrição:** Agendar pet em slot disponível

**Permissão:** TUTOR (próprios pets), RECEPCIONISTA, GERENTE, ADMIN

**Payload:**
```json
{
  "clinic_id": "uuid",
  "patient_id": "uuid",
  "slot_id": "uuid",
  "professional_id": "uuid",
  "service_type": "banho",
  "price_total": 50.00,
  "wait_list": false
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "status": "scheduled",
    "patient_name": "Rex",
    "scheduled_at": "2026-04-28T09:00:00Z",
    "confirmation_code": "GRM-20260428-001",
    "confirmation_token": "token_string"
  },
  "message": "Agendamento confirmado"
}
```

**Validações:**
- `slot.booked_count < slot.capacity` (hard block)
- Se lotado: oferece alternativa `wait_list = true`
- Tutor só pode agendar seus próprios pets (RLS)
- Pet deve estar ativo

**Lógica de Negócio:**
- Criar row em `grooming_sessions` com `status = 'scheduled'`
- Incrementar `grooming_slots.booked_count`
- Criar row em `grooming_slot_assignments` com `position_in_queue`
- Enviar SMS/WhatsApp: "Agendamento confirmado para 28/04 às 09:00"
- Notificar profissional (opcional)

---

### 4. POST `/api/grooming/check-in`

**Descrição:** Check-in do pet na recepção

**Permissão:** RECEPCIONISTA, GERENTE, ADMIN

**Payload:**
```json
{
  "session_id": "uuid",
  "patient_id": "uuid",
  "checked_in_by": "uuid",
  "term_signed": true,
  "checklist": {
    "allergy_confirmed": true,
    "behavior_noted": "tranquilo",
    "emergency_contact_verified": true
  },
  "notes": "Tutor avisou sobre alergias adicionais"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "status": "arrived",
    "patient_name": "Rex",
    "arrived_at": "2026-04-28T09:15:00Z",
    "assigned_to": "uuid",
    "professional_name": "João (Banhista)"
  },
  "checklist_validated": true
}
```

**Validações:**
- Session deve ter `status = 'scheduled'`
- Período agendado (`scheduled_at`) já passou
- Tutor assinou termo
- Checklist preenchida

**Lógica de Negócio:**
- Atualizar `grooming_sessions`: `status = 'arrived'`, `arrived_at = now()`, `check_in_by = user_id`, `term_signed = true`, `check_in_checklist = checklist`
- Criar row em `grooming_status_transitions` com `from_status = 'scheduled'`, `to_status = 'arrived'`
- Atualizar `patient_reception.status` (integração Recepção)
- Enviar WhatsApp ao profissional: "Novo pet aguardando: Rex (Shih Tzu, P), alergias: [...]"
- Gerar comprovante e salvar em `grooming_documents`

---

### 5. POST `/api/grooming/assign-professional`

**Descrição:** Atribuir profissional a sessão

**Permissão:** RECEPCIONISTA, GERENTE, ADMIN

**Payload:**
```json
{
  "session_id": "uuid",
  "professional_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "assigned_to": "uuid",
    "professional_name": "João (Banhista)",
    "status": "arrived"
  }
}
```

**Validações:**
- Session deve estar em status `'arrived'`
- Profissional deve ter `professional_type` compatível
- Profissional não pode estar marcado como indisponível

**Lógica de Negócio:**
- Atualizar `grooming_sessions.assigned_to = professional_id`
- Notificar profissional: "Pet Rex foi atribuído a você"

---

### 6. POST `/api/grooming/update-status`

**Descrição:** Atualizar status de sessão (transição de estado)

**Permissão:** BANHISTA (bathing/drying), TOSADOR (grooming), RECEPCIONISTA (check-in/checkout/paid)

**Payload:**
```json
{
  "session_id": "uuid",
  "new_status": "bathing",
  "reason": "iniciado banho",
  "notes": "pet um pouco agitado, usar técnica suave"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "status": "bathing",
    "transition": {
      "id": "uuid",
      "from_status": "arrived",
      "to_status": "bathing",
      "timestamp": "2026-04-28T09:30:00Z"
    }
  }
}
```

**Validações:**
- Usar RPC `rpc_grooming_update_status` para garantir atomicidade
- Validar transição de estado (máquina de estados)
- Validar papel do usuário (BANHISTA pode marcar apenas bathing/drying)

**Lógica de Negócio:**
- Chamar RPC `rpc_grooming_update_status` que:
  - Valida transição
  - Atualiza `grooming_sessions.current_status`
  - Cria row em `grooming_status_transitions`
  - Notifica tutor via SMS/WhatsApp com status update

---

### 7. POST `/api/grooming/checkout`

**Descrição:** Checkout e finalização da sessão

**Permissão:** RECEPCIONISTA, GERENTE, ADMIN

**Payload:**
```json
{
  "session_id": "uuid",
  "payment_status": "paid",
  "payment_method": "credit_card",
  "discount_percent": 10,
  "discount_value": 5.00,
  "checked_out_by": "uuid",
  "notes": "Cliente solicitou desconto de fidelidade"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "status": "delivered",
    "receipt": {
      "id": "uuid",
      "total": 45.00,
      "discount": 5.00,
      "subtotal": 40.00,
      "payment_method": "credit_card"
    }
  }
}
```

**Validações:**
- Session deve estar em `status = 'waiting_pickup'`
- `payment_status` deve ser 'paid' ou 'waived'

**Lógica de Negócio:**
- Atualizar `grooming_sessions`: `status = 'paid'` → `status = 'delivered'`, `check_out_by = user_id`, `delivered_at = now()`
- Criar 2 transições em `grooming_status_transitions`
- Chamar RPC `rpc_generate_grooming_receipt` para gerar recibo
- Salvar recibo em `grooming_documents`
- Atualizar `patient_reception.status` (integração)
- Enviar SMS/WhatsApp: "Rex foi retirado com sucesso. Avaliação: [link]"

---

### 8. GET `/api/grooming/sessions`

**Descrição:** Listar sessões com filtros

**Permissão:** RECEPCIONISTA, GERENTE, ADMIN, BANHISTA (próprias), TOSADOR (próprias)

**Query Params:**
```
?clinic_id=uuid
&status=arrived
&date=2026-04-28
&professional_id=uuid (opcional)
&page=1
&limit=50
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "patient_name": "Rex",
      "tutor_name": "João Silva",
      "status": "arrived",
      "assigned_to": "uuid",
      "professional_name": "Maria (Banhista)",
      "scheduled_at": "2026-04-28T09:00:00Z",
      "services": ["banho", "tosa"],
      "price_total": 120.00
    }
  ],
  "total": 15,
  "page": 1,
  "page_size": 50
}
```

**Validações:**
- Respeitar RLS (usuário vê apenas sessões da clínica)
- BANHISTA vê apenas suas próprias sessões (`assigned_to = user_id`)

---

### 9. GET `/api/grooming/professional/:id/agenda`

**Descrição:** Agenda de profissional (semana/mês)

**Permissão:** PROFISSIONAL (própria), RECEPCIONISTA, GERENTE, ADMIN

**Query Params:**
```
?clinic_id=uuid
&week_start=2026-04-21
&week_end=2026-04-27
```

**Response:**
```json
{
  "professional": {
    "id": "uuid",
    "name": "João (Banhista)",
    "professional_type": "banhista"
  },
  "schedule": [
    {
      "date": "2026-04-28",
      "slots": [
        {
          "id": "uuid",
          "start_time": "09:00",
          "end_time": "10:00",
          "booked_count": 2,
          "capacity": 3,
          "bookings": [
            {
              "session_id": "uuid",
              "pet_name": "Rex",
              "service_type": "banho",
              "status": "scheduled"
            }
          ]
        }
      ]
    }
  ]
}
```

**Validações:**
- Profissional vê apenas sua própria agenda (RLS)
- Gerente vê todas as agendas da clínica

---

### 10. GET `/api/grooming/audit-log`

**Descrição:** Histórico de transições (auditoria)

**Permissão:** GERENTE, ADMIN

**Query Params:**
```
?clinic_id=uuid
&session_id=uuid (opcional)
&date_start=2026-04-01
&date_end=2026-04-30
&limit=100
&offset=0
```

**Response:**
```json
{
  "transitions": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "from_status": "scheduled",
      "to_status": "arrived",
      "actor": {
        "id": "uuid",
        "name": "Maria Silva",
        "role": "recepcionista"
      },
      "timestamp": "2026-04-28T09:15:00Z",
      "reason": "check-in realizado",
      "metadata": {
        "term_signed": true,
        "tutor_present": true
      }
    }
  ],
  "total": 245,
  "page": 1,
  "page_size": 100
}
```

**Validações:**
- Apenas GERENTE e ADMIN (RLS)
- Apenas transições da clínica

---

## RPC SUPABASE — 4 FUNÇÕES

### 1. `rpc_grooming_update_status` — Transição de Estado (Atomic)

**Propósito:** Atualizar status com validação de máquina de estados, criar audit trail

**Assinatura:**
```sql
CREATE OR REPLACE FUNCTION rpc_grooming_update_status(
  p_session_id uuid,
  p_new_status text,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  success boolean,
  session_id uuid,
  new_status text,
  transition_id uuid,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_clinic_id uuid;
  v_transition_id uuid;
  v_valid_transition boolean;
BEGIN
  -- Buscar sessão e status atual
  SELECT current_status, clinic_id INTO v_current_status, v_clinic_id
    FROM grooming_sessions WHERE id = p_session_id;
  
  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT false, p_session_id, NULL::text, NULL::uuid, 'Sessão não encontrada'::text;
    RETURN;
  END IF;

  -- Validar transição (máquina de estados)
  v_valid_transition := (
    (v_current_status = 'scheduled' AND p_new_status = 'arrived') OR
    (v_current_status = 'arrived' AND p_new_status = 'bathing') OR
    (v_current_status = 'bathing' AND p_new_status = 'grooming') OR
    (v_current_status = 'grooming' AND p_new_status = 'drying') OR
    (v_current_status = 'drying' AND p_new_status = 'waiting_pickup') OR
    (v_current_status = 'waiting_pickup' AND p_new_status = 'paid') OR
    (v_current_status = 'paid' AND p_new_status = 'delivered') OR
    (v_current_status != 'delivered' AND v_current_status != 'cancelled' AND p_new_status = 'cancelled')
  );

  IF NOT v_valid_transition THEN
    RETURN QUERY SELECT false, p_session_id, NULL::text, NULL::uuid, 
      format('Transição inválida: %s → %s', v_current_status, p_new_status)::text;
    RETURN;
  END IF;

  -- Validar permissões do ator
  IF p_actor_role = 'banhista' AND p_new_status NOT IN ('bathing', 'drying', 'waiting_pickup') THEN
    RETURN QUERY SELECT false, p_session_id, NULL::text, NULL::uuid, 
      'Banhista pode apenas marcar bathing, drying ou waiting_pickup'::text;
    RETURN;
  END IF;

  IF p_actor_role = 'tosador' AND p_new_status NOT IN ('grooming', 'drying') THEN
    RETURN QUERY SELECT false, p_session_id, NULL::text, NULL::uuid, 
      'Tosador pode apenas marcar grooming ou drying'::text;
    RETURN;
  END IF;

  -- Atualizar status na sessão
  UPDATE grooming_sessions
    SET current_status = p_new_status,
        updated_at = now()
  WHERE id = p_session_id;

  -- Criar entrada no audit log (WORM)
  INSERT INTO grooming_status_transitions (
    clinic_id, grooming_session_id, from_status, to_status,
    actor_id, actor_role, reason, metadata, timestamp
  ) VALUES (
    v_clinic_id, p_session_id, v_current_status, p_new_status,
    p_actor_id, p_actor_role, p_reason, p_metadata, now()
  ) RETURNING id INTO v_transition_id;

  RETURN QUERY SELECT true, p_session_id, p_new_status, v_transition_id, NULL::text;
END;
$$;
```

**Validações Internas:**
- Máquina de estados rigorosa
- Permissões por papel
- Atomicidade (transaction)

---

### 2. `rpc_professional_check_availability` — Verificar Disponibilidade

**Propósito:** Retornar slots disponíveis de profissional (levando em conta indisponibilidades)

**Assinatura:**
```sql
CREATE OR REPLACE FUNCTION rpc_professional_check_availability(
  p_professional_id uuid,
  p_clinic_id uuid,
  p_date_start date,
  p_date_end date
)
RETURNS TABLE (
  date date,
  start_time time,
  end_time time,
  capacity integer,
  booked_count integer,
  available boolean,
  service_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ps.date,
    ps.start_time,
    ps.end_time,
    ps.capacity,
    COALESCE(gs.booked_count, 0) AS booked_count,
    (ps.available = true AND 
     COALESCE(gs.booked_count, 0) < ps.capacity AND
     NOT EXISTS (
       SELECT 1 FROM professional_unavailability pu
       WHERE pu.professional_id = p_professional_id
       AND pu.start_date <= ps.date
       AND pu.end_date >= ps.date
     )) AS available,
    ps.service_type
  FROM professional_schedules ps
  LEFT JOIN grooming_slots gs ON ps.id = gs.professional_schedule_id
  WHERE ps.professional_id = p_professional_id
    AND ps.clinic_id = p_clinic_id
    AND ps.date BETWEEN p_date_start AND p_date_end
  ORDER BY ps.date, ps.start_time;
$$;
```

---

### 3. `rpc_reserve_slot` — Reservar Slot (Increment Booking)

**Propósito:** Incrementar `booked_count` de forma transacional

**Assinatura:**
```sql
CREATE OR REPLACE FUNCTION rpc_reserve_slot(
  p_slot_id uuid,
  p_session_id uuid,
  p_position_in_queue integer
)
RETURNS TABLE (
  success boolean,
  slot_id uuid,
  booked_count integer,
  position integer,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_capacity integer;
  v_current_booked integer;
BEGIN
  -- Buscar slot com lock
  SELECT capacity, booked_count INTO v_capacity, v_current_booked
    FROM grooming_slots
    WHERE id = p_slot_id
    FOR UPDATE;

  IF v_current_booked >= v_capacity THEN
    RETURN QUERY SELECT false, p_slot_id, v_current_booked, NULL::integer, 
      'Slot lotado'::text;
    RETURN;
  END IF;

  -- Incrementar booked_count
  UPDATE grooming_slots
    SET booked_count = booked_count + 1,
        status = CASE WHEN booked_count + 1 >= capacity THEN 'full' ELSE 'available' END
  WHERE id = p_slot_id;

  -- Criar assignment
  INSERT INTO grooming_slot_assignments (
    grooming_session_id, grooming_slot_id, position_in_queue
  ) VALUES (p_session_id, p_slot_id, p_position_in_queue);

  RETURN QUERY SELECT true, p_slot_id, v_current_booked + 1, p_position_in_queue, NULL::text;
END;
$$;
```

---

### 4. `rpc_generate_grooming_receipt` — Gerar Recibo

**Propósito:** Compilar dados da sessão e gerar recibo estruturado

**Assinatura:**
```sql
CREATE OR REPLACE FUNCTION rpc_generate_grooming_receipt(
  p_session_id uuid
)
RETURNS TABLE (
  receipt_id uuid,
  receipt_data jsonb,
  pdf_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt jsonb;
  v_receipt_id uuid;
  v_session grooming_sessions;
  v_patient patients;
  v_tutor tutors;
BEGIN
  -- Buscar dados da sessão
  SELECT * INTO v_session FROM grooming_sessions WHERE id = p_session_id;
  SELECT * INTO v_patient FROM patients WHERE id = v_session.patient_id;
  SELECT * INTO v_tutor FROM tutors WHERE id = v_session.tutor_id;

  -- Compilar dados de recibo
  v_receipt := jsonb_build_object(
    'receipt_number', 'REC-' || to_char(now(), 'YYYYMMDD-HHmmss'),
    'session_id', p_session_id,
    'date', now()::date,
    'clinic', (SELECT name FROM clinics WHERE id = v_session.clinic_id),
    'patient', jsonb_build_object(
      'name', v_patient.name,
      'species', v_patient.species,
      'breed', v_patient.breed,
      'size', v_patient.size
    ),
    'tutor', jsonb_build_object(
      'name', v_tutor.name,
      'phone', v_tutor.phone,
      'email', v_tutor.email
    ),
    'services', v_session.service_prices,
    'subtotal', v_session.price_total,
    'discount_percent', v_session.discount_percent,
    'discount_value', (v_session.price_total * v_session.discount_percent / 100),
    'total', v_session.price_total - (v_session.price_total * v_session.discount_percent / 100),
    'payment_status', v_session.payment_status,
    'scheduled_at', v_session.scheduled_at,
    'delivered_at', v_session.delivered_at
  );

  -- Salvar em grooming_documents
  INSERT INTO grooming_documents (
    grooming_session_id, clinic_id, document_type, document_data
  ) VALUES (p_session_id, v_session.clinic_id, 'receipt', v_receipt)
  RETURNING id INTO v_receipt_id;

  -- Atualizar session com receipt_json
  UPDATE grooming_sessions
    SET receipt_json = v_receipt
  WHERE id = p_session_id;

  RETURN QUERY SELECT v_receipt_id, v_receipt, NULL::text;
END;
$$;
```

---

## FLUXO DE INTEGRAÇÃO COM RECEPÇÃO

### Sequência Temporal Completa

```
TIMELINE: Fluxo completo de Grooming integrado com Recepção

┌─────────────────────────────────────────────────────────────────────────────┐
│ DIA ANTERIOR: Tutor Agenda (ou Recepcionista agenda para tutor)            │
└─────────────────────────────────────────────────────────────────────────────┘

TUTOR (App Mobile) ou RECEPCIONISTA (Web)
   │
   ├─→ Acessa "Agendar Grooming"
   │
   ├─→ GET /api/grooming/available-slots
   │   ├─ clinic_id=X
   │   ├─ date_start=2026-04-28
   │   └─ service_type=banho_tosa
   │
   ├─→ Resposta: Lista de 45 slots disponíveis
   │
   ├─→ Seleciona: João (Banhista), 28/04 09:00-10:00, Banho+Tosa
   │
   ├─→ POST /api/grooming/schedule-session
   │   ├─ patient_id=pet-rex
   │   ├─ slot_id=slot-123
   │   ├─ service_type=banho_tosa
   │   └─ price_total=120.00
   │
   ├─→ Supabase:
   │   ├─ INSERT grooming_sessions (status=scheduled, scheduled_at=2026-04-28T09:00Z)
   │   ├─ UPDATE grooming_slots: booked_count += 1
   │   ├─ INSERT grooming_status_transitions (scheduled→scheduled, "agendado")
   │   └─ CREATE grooming_documents (type=confirmation)
   │
   └─→ Resposta: Confirmação + SMS ao Tutor
       └─ "Agendamento confirmado para 28/04 às 09:00 com João"

┌─────────────────────────────────────────────────────────────────────────────┐
│ DIA DO AGENDAMENTO: Check-in na Recepção                                   │
└─────────────────────────────────────────────────────────────────────────────┘

RECEPCIONISTA (App Web/Tablet)
   │
   ├─→ Busca pet: "Rex" ou pesquisa rápida
   │
   ├─→ GET /api/grooming/sessions?status=scheduled&date=2026-04-28
   │
   ├─→ Encontra: Rex, agendado para 09:00 com João
   │
   ├─→ Clica em "Check-in"
   │
   ├─→ Validações de Check-in:
   │   ├─ Tutor presente? ✓
   │   ├─ Alguma alergia notificada? Confirma
   │   ├─ Comportamento normal? Nota
   │   ├─ Tutor assina termo (tablet)? ✓
   │   └─ Contato de emergência verificado? ✓
   │
   ├─→ POST /api/grooming/check-in
   │   ├─ session_id=session-abc
   │   ├─ checked_in_by=recepcionista-123
   │   ├─ term_signed=true
   │   └─ checklist={allergy_confirmed: true, behavior_noted: "tranquilo", ...}
   │
   ├─→ Supabase:
   │   ├─ RPC rpc_grooming_update_status(session, 'arrived', recepcionista, 'check-in realizado')
   │   │  ├─ Valida transição: scheduled → arrived ✓
   │   │  ├─ UPDATE grooming_sessions (status=arrived, arrived_at=now(), check_in_by=recep_id)
   │   │  └─ INSERT grooming_status_transitions (scheduled→arrived, timestamp=now())
   │   │
   │   ├─ UPDATE patient_reception (status="Grooming em andamento")
   │   │
   │   └─ CREATE grooming_documents (type=checklist)
   │
   └─→ Respostas simultâneas:
       ├─ Recepção: "Check-in confirmado" + "Status: Na fila"
       ├─ WhatsApp Profissional: "Novo pet: Rex (Shih Tzu, P), Alergias: nenhuma"
       └─ SMS Tutor: "Rex foi recebido com sucesso. Será entregue em ~2h"

┌─────────────────────────────────────────────────────────────────────────────┐
│ PROCESSAMENTO: Profissionais fazem o trabalho (status tracking)            │
└─────────────────────────────────────────────────────────────────────────────┘

BANHISTA (App Mobile/Tablet)
   │
   ├─→ Abre "Minha Fila"
   │
   ├─→ GET /api/grooming/professional/:id/agenda?date=2026-04-28
   │
   ├─→ Vê pet Rex atribuído, posição 1 de 3
   │
   ├─→ Clica "Iniciando banho"
   │
   ├─→ POST /api/grooming/update-status
   │   ├─ session_id=session-abc
   │   ├─ new_status=bathing
   │   └─ reason="iniciado banho"
   │
   ├─→ Supabase:
   │   ├─ RPC rpc_grooming_update_status(session, 'bathing', banhista_id, 'banhista')
   │   │  ├─ Valida transição: arrived → bathing ✓
   │   │  ├─ UPDATE grooming_sessions (status=bathing)
   │   │  └─ INSERT grooming_status_transitions (arrived→bathing, timestamp=now())
   │   │
   │   └─ Realtime evento: Atualiza Kanban em tempo real
   │
   └─→ Status muda: "No banho" (Coluna 2 do Kanban)
       └─ SMS Tutor: "Rex está sendo banhado agora"

   [10 minutos depois...]
   │
   ├─→ Banho concluído
   │
   ├─→ POST /api/grooming/update-status
   │   ├─ new_status=grooming
   │   └─ reason="banho concluído, iniciando tosa"
   │
   └─→ Status muda: "Na tosa" (Coluna 3)
       └─ Evento realtime para Kanban

TOSADOR (App Mobile/Tablet)
   │
   ├─→ Vê Rex pronto para tosa em "Awaiting Groomer"
   │
   ├─→ Clica "Iniciando tosa"
   │
   ├─→ POST /api/grooming/update-status
   │   ├─ new_status=grooming
   │   └─ reason="tosa iniciada"
   │
   └─→ [Tosa ~20 minutos depois...]
       │
       ├─→ POST /api/grooming/update-status
       │   ├─ new_status=drying
       │   └─ reason="tosa concluída, iniciando secagem"
       │
       └─→ Status muda: "Secando" (Coluna 4)

BANHISTA (ou SECADOR especializado)
   │
   ├─→ Seca e finaliza grooming
   │
   ├─→ POST /api/grooming/update-status
   │   ├─ new_status=waiting_pickup
   │   └─ reason="grooming concluído, aguardando tutor"
   │
   ├─→ Supabase:
   │   ├─ RPC rpc_grooming_update_status(session, 'waiting_pickup', banhista_id, 'banhista')
   │   │  ├─ Valida transição: drying → waiting_pickup ✓
   │   │  ├─ UPDATE grooming_sessions (status=waiting_pickup)
   │   │  └─ INSERT grooming_status_transitions (drying→waiting_pickup)
   │   │
   │   └─ Notificação: SMS ao Tutor
   │       "Rex está pronto! Retire em até 30min."
   │
   └─→ Status muda: "Aguardando Tutor" (Coluna 5)

┌─────────────────────────────────────────────────────────────────────────────┐
│ CHECKOUT: Entrega ao tutor e finalização                                   │
└─────────────────────────────────────────────────────────────────────────────┘

RECEPCIONISTA (App Web)
   │
   ├─→ Tutor chega para retirada
   │
   ├─→ Busca pet: "Rex"
   │
   ├─→ Vê status: "Aguardando Tutor" (waiting_pickup)
   │
   ├─→ Clica "Checkout"
   │
   ├─→ Dialog de Pagamento:
   │   ├─ Subtotal: R$ 120.00
   │   ├─ Desconto: 0%
   │   └─ Total a pagar: R$ 120.00
   │
   ├─→ POST /api/grooming/checkout
   │   ├─ session_id=session-abc
   │   ├─ payment_status=paid
   │   ├─ payment_method=credit_card
   │   └─ checked_out_by=recepcionista-123
   │
   ├─→ Supabase:
   │   ├─ RPC rpc_grooming_update_status(session, 'paid', recep_id, 'recepcionista')
   │   │  ├─ Valida transição: waiting_pickup → paid ✓
   │   │  ├─ UPDATE grooming_sessions (status=paid)
   │   │  └─ INSERT grooming_status_transitions (waiting_pickup→paid)
   │   │
   │   ├─ RPC rpc_grooming_update_status(session, 'delivered', recep_id, 'recepcionista')
   │   │  ├─ Valida transição: paid → delivered ✓
   │   │  ├─ UPDATE grooming_sessions (status=delivered, delivered_at=now())
   │   │  └─ INSERT grooming_status_transitions (paid→delivered)
   │   │
   │   ├─ RPC rpc_generate_grooming_receipt(session)
   │   │  ├─ Compila dados: paciente, tutor, serviços, preços
   │   │  ├─ Gera JSON e salva em grooming_documents
   │   │  └─ UPDATE grooming_sessions (receipt_json=data)
   │   │
   │   ├─ UPDATE patient_reception (status="Saída finalizada")
   │   │
   │   └─ Webhook: /webhooks/grooming-notification
   │       └─ SMS Tutor: "Rex foi retirado com sucesso! [link avaliação]"
   │
   ├─→ Resposta na Recepção:
   │   ├─ "Checkout confirmado"
   │   ├─ Imprimir ou Enviar Recibo
   │   └─ Assinatura do tutor (opcional)
   │
   └─→ Status muda: "Entregue" (Coluna 6 / TERMINAL)
       └─ Kanban remove do fluxo

┌─────────────────────────────────────────────────────────────────────────────┐
│ PÓS-ENTREGA: Feedback e Análise                                            │
└─────────────────────────────────────────────────────────────────────────────┘

TUTOR (App Mobile)
   │
   ├─→ Recebe SMS: "Avalie seu atendimento [★★★★★]"
   │
   ├─→ Clica e avalia (star rating + comentário opcional)
   │
   └─→ Integração com Histórico de Serviços
       └─ Próxima vez que agendar, recomenda "João (Banhista)" com rating

GERENTE (Dashboard)
   │
   ├─→ GET /api/grooming/analytics?month=2026-04
   │   ├─ total_sessions: 127
   │   ├─ avg_duration: 45 min
   │   ├─ professional_utilization: {João: 95%, Maria: 87%}
   │   ├─ revenue: R$ 15.240
   │   └─ avg_feedback: 4.7 stars
   │
   └─→ GET /api/grooming/audit-log?session_id=session-abc
       └─ Timeline completa de transições com timestamps e atores
```

---

## EVENT-DRIVEN PATTERNS

### Supabase Realtime Subscriptions

**Tabelas com Realtime habilitado:**
- `grooming_sessions` — mudanças de status
- `grooming_status_transitions` — novo audit log entry
- `professional_schedules` — nova agenda ou indisponibilidade
- `grooming_slots` — mudança em booked_count ou status

**Eventos de Recepção:**

```typescript
// Cliente React na Recepção
supabase
  .channel('grooming_updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'grooming_sessions',
    filter: `clinic_id=eq.${clinicId}`
  }, (payload) => {
    // Atualizar Kanban em tempo real
    updateKanbanCard(payload.new);
    
    // Se novo status = 'waiting_pickup', notificar visualmente
    if (payload.new.current_status === 'waiting_pickup') {
      showNotification(`${payload.new.patient_name} está pronto!`);
    }
  })
  .subscribe();
```

### Webhooks/Notificações

**Integração com WhatsApp/SMS (Twilio ou similar):**

```typescript
// Trigger: grooming_status_transitions INSERT
// Endpoint: /api/webhooks/grooming-notification

POST /api/webhooks/grooming-notification
{
  "event": "status_changed",
  "session_id": "uuid",
  "old_status": "arrived",
  "new_status": "bathing",
  "tutor_phone": "+5511999999999",
  "pet_name": "Rex",
  "professional_name": "João"
}

// Lógica:
switch(new_status) {
  case 'arrived':
    sendWhatsApp(tutor_phone, `Rex foi recebido com sucesso. Será entregue em ~2h`);
    break;
  case 'bathing':
    sendWhatsApp(tutor_phone, `Rex está sendo banhado agora`);
    break;
  case 'waiting_pickup':
    sendWhatsApp(tutor_phone, `Rex está pronto! Retire em até 30min`);
    break;
  case 'delivered':
    sendWhatsApp(tutor_phone, `Rex foi retirado com sucesso! Avalie: [link]`);
    break;
}
```

### Analytics Events

**Envio para analytics backend (Mixpanel, PostHog, etc.):**

```typescript
// Evento: sessão criada
analytics.track('grooming_session_created', {
  clinic_id: sessionData.clinic_id,
  professional_id: sessionData.professional_id,
  service_type: 'banho_tosa',
  price: 120.00,
  timestamp: now()
});

// Evento: status transicionado
analytics.track('grooming_status_transitioned', {
  from_status: 'bathing',
  to_status: 'grooming',
  actor_role: 'banhista',
  duration_sec: 600,
  session_id: uuid
});

// Evento: slot reservado
analytics.track('grooming_slot_booked', {
  slot_id: uuid,
  professional_id: uuid,
  position_in_queue: 1,
  timestamp: now()
});

// Evento: profissional utilização
analytics.track('professional_utilization', {
  professional_id: uuid,
  slots_filled: 3,
  total_slots: 3,
  utilization_percent: 100,
  date: '2026-04-28'
});
```

---

## DEPENDÊNCIAS E INTEGRAÇÕES EXTERNAS

### 1. Integração com Módulo Recepção

**Tabelas Existentes (Reutilização):**
- `patient_reception` — status de check-in/checkout
  - Novo status: "Grooming em andamento" (quando check-in grooming)
  - Novo status: "Saída finalizada" (quando checkout grooming)
- `consultations` — visit_reason pode ser 'grooming' (extensão futura)

**API Sync Points:**
```typescript
// Ao fazer check-in de grooming:
await updatePatientReception(patientId, {
  status: 'grooming_in_progress',
  service_module: 'grooming',
  professional: assignedTo,
  eta: estimatedReadyTime
});

// Ao fazer checkout:
await updatePatientReception(patientId, {
  status: 'exit_authorized',
  service_module: 'grooming',
  exit_timestamp: now()
});
```

### 2. Integração com WhatsApp/SMS

**Serviço Existente:** Supabase + Twilio (ver migration 0026_whatsapp_notifications.sql)

**Webhook de Notificação:**
```typescript
POST /api/webhooks/grooming-notification
{
  event: 'status_changed',
  tutor_phone: string,
  message_template: 'grooming_check_in' | 'grooming_ready' | 'grooming_delivered',
  variables: {
    pet_name: string,
    service_type: string,
    professional_name: string,
    estimated_time: string
  }
}
```

### 3. Integração com Estoque (Catálogo)

**Tabela Existente:** `clinic_catalog` com `item_type = 'grooming'`

**Trigger de Decremento:**
```sql
-- Ao inserir em grooming_product_log:
CREATE TRIGGER trg_grooming_product_log_insert
AFTER INSERT ON grooming_product_log
FOR EACH ROW EXECUTE FUNCTION decrement_product_quantity();

-- Função:
CREATE OR REPLACE FUNCTION decrement_product_quantity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE clinic_catalog
    SET quantity = quantity - NEW.quantity_used,
        updated_at = now()
  WHERE id = NEW.product_id;
  
  -- Alerta se estoque baixo
  IF (SELECT quantity FROM clinic_catalog WHERE id = NEW.product_id) < 
     (SELECT min_quantity FROM clinic_catalog WHERE id = NEW.product_id) THEN
    INSERT INTO notifications (clinic_id, title, message)
    VALUES (NEW.clinic_id, 'Estoque baixo', 'Produto precisa reposição');
  END IF;
  
  RETURN NEW;
END;
$$;
```

### 4. Integração com Faturamento (Finance Module)

**Webhook de Checkout:**
```typescript
POST /webhooks/grooming-checkout
{
  event: 'grooming_checkout',
  session_id: uuid,
  clinic_id: uuid,
  patient_id: uuid,
  tutor_id: uuid,
  service_type: 'banho_tosa',
  subtotal: 120.00,
  discount_percent: 0,
  total: 120.00,
  payment_status: 'paid',
  payment_method: 'credit_card',
  receipt_id: uuid,
  timestamp: now()
}
```

---

## PERFORMANCE E ÍNDICES

### Índices Críticos (7 Total)

```sql
-- 1. Busca rápida de agendas por profissional e data
CREATE INDEX IF NOT EXISTS idx_prof_schedules_clinic_date
  ON professional_schedules(clinic_id, date)
  WHERE available = true;

-- 2. Slots disponíveis por data e status
CREATE INDEX IF NOT EXISTS idx_grooming_slots_availability
  ON grooming_slots(clinic_id, date, start_time, status)
  WHERE status != 'cancelled';

-- 3. Transições por sessão (audit trail)
CREATE INDEX IF NOT EXISTS idx_transitions_session
  ON grooming_status_transitions(clinic_id, grooming_session_id, timestamp DESC)
  INCLUDE (from_status, to_status, actor_role);

-- 4. Sessões de profissional (My Queue)
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_assigned
  ON grooming_sessions(assigned_to, clinic_id)
  WHERE current_status NOT IN ('cancelled', 'delivered');

-- 5. Status de sessão para filtros em tempo real
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_status
  ON grooming_sessions(clinic_id, current_status, scheduled_at DESC);

-- 6. Produtos consumidos por sessão
CREATE INDEX IF NOT EXISTS idx_product_log_session
  ON grooming_product_log(grooming_session_id, stage);

-- 7. Indisponibilidades por período
CREATE INDEX IF NOT EXISTS idx_unavailability_date_range
  ON professional_unavailability(professional_id, start_date, end_date);
```

### Cache Strategy

**Redis TTLs:**
- Slots disponíveis: TTL 5 min
- Professional availability: TTL 10 min
- Session status (para Kanban): TTL 2 min (realtime preferred)

**Caching Pattern:**
```typescript
// get-available-slots endpoint
const CACHE_KEY = `grooming:slots:${clinicId}:${dateStart}:${dateEnd}`;
const cached = await redis.get(CACHE_KEY);
if (cached) return JSON.parse(cached);

const slots = await supabase.rpc('rpc_professional_check_availability', {...});
await redis.setex(CACHE_KEY, 300, JSON.stringify(slots)); // 5 min TTL
return slots;
```

### Query Optimization

**Large Tables:**
- `grooming_sessions` — pagination limit 50
- `grooming_status_transitions` — pagination limit 100 (audit log)
- `grooming_product_log` — monthly aggregation queries

**Aggregation Query Example:**
```sql
-- Consumo por mês
SELECT 
  DATE_TRUNC('month', gpl.created_at) AS month,
  cc.name AS product_name,
  SUM(gpl.quantity_used) AS total_quantity,
  cc.unit_price * SUM(gpl.quantity_used) AS total_cost
FROM grooming_product_log gpl
JOIN clinic_catalog cc ON gpl.product_id = cc.id
WHERE gpl.clinic_id = $1
  AND gpl.created_at >= NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', gpl.created_at), cc.id, cc.name
ORDER BY month DESC;
```

---

## RLS POLICIES E SEGURANÇA

### 6 RLS Policies

#### 1. Professional Schedules — Clinic Isolation

```sql
CREATE POLICY "clinic_isolation_prof_schedules"
  ON professional_schedules FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

#### 2. Grooming Slots — Clinic Isolation

```sql
CREATE POLICY "clinic_isolation_grooming_slots"
  ON grooming_slots FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

#### 3. Slot Assignments — Clinic Isolation

```sql
CREATE POLICY "clinic_isolation_slot_assignments"
  ON grooming_slot_assignments FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

#### 4. Status Transitions — WORM (Append Only)

```sql
-- READ: Clinic isolation
CREATE POLICY "clinic_isolation_transitions"
  ON grooming_status_transitions FOR SELECT TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- INSERT: Append only (WORM)
CREATE POLICY "append_only_transitions"
  ON grooming_status_transitions FOR INSERT TO authenticated
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- NO UPDATE/DELETE policies enforced
```

#### 5. Professional Unavailability — Clinic Isolation

```sql
CREATE POLICY "clinic_isolation_unavailability"
  ON professional_unavailability FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

#### 6. Product Log & Documents — Clinic Isolation

```sql
CREATE POLICY "clinic_isolation_product_log"
  ON grooming_product_log FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "clinic_isolation_documents"
  ON grooming_documents FOR ALL TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
```

### RBAC Enforcement (API Level)

```typescript
// Middleware: checkGroomingPermission
export async function checkGroomingPermission(
  action: 'create_schedule' | 'check_in' | 'update_status' | 'checkout' | 'view_audit',
  userRole: string,
  sessionStatus?: string
): Promise<boolean> {
  const permissions: Record<string, string[]> = {
    create_schedule: ['gerente', 'admin'],
    check_in: ['recepcionista', 'gerente', 'admin'],
    update_status: ['banhista', 'tosador', 'recepcionista', 'gerente', 'admin'],
    checkout: ['recepcionista', 'gerente', 'admin'],
    view_audit: ['gerente', 'admin']
  };

  // Additional constraint: BANHISTA only for bathing/drying
  if (userRole === 'banhista' && action === 'update_status') {
    return ['bathing', 'drying', 'waiting_pickup'].includes(sessionStatus);
  }

  return permissions[action]?.includes(userRole) ?? false;
}
```

---

## GLOSSÁRIO E REFERÊNCIAS

| Termo | Definição | Exemplo |
|-------|-----------|---------|
| **Slot** | Bloco de tempo de 1h com capacidade fixa | João (Banhista), 28/04 09:00-10:00, cap 3 |
| **Professional Schedule** | Agenda de profissional (1+ slots) | João trabalha seg-sex 09:00-17:00 |
| **Grooming Slot** | Agregação de schedule com booked_count | Slot com 2/3 pets agendados |
| **Slot Assignment** | Posição do pet em fila | Rex é o 1º de 3 no slot |
| **Status Transition** | Mudança de estado (auditada) | scheduled → arrived, por recepcionista |
| **WORM** | Write Once Read Many (imutável) | grooming_status_transitions nunca é deletada |
| **Check-in** | Recepção do pet na clínica | Tutor assina termo, checklist confirmada |
| **Checkout** | Entrega do pet ao tutor | Pagamento confirmado, recibo gerado |
| **Professional Type** | Especialização (banhista, tosador, multi) | João é multi_skill (banho + tosa) |
| **Unavailability** | Período sem disponibilidade | Férias (2026-05-01 a 2026-05-15) |
| **Multi-tenant** | Isolamento por clinic_id | Cada clínica vê apenas seus dados |
| **RLS** | Row Level Security (Supabase) | Usuário vê apenas rows da clínica |
| **Audit Trail** | Histórico imutável de transições | Quem, quando, por quê para cada mudança |
| **KPI** | Key Performance Indicator | Utilização de profissional: 95% |

---

## ROADMAP DE IMPLEMENTAÇÃO

### Phase 1: Infrastructure (1 semana)
- [ ] Migration 0041: professional_schedules, grooming_slots, slot_assignments
- [ ] Migration 0041b: grooming_status_transitions, professional_unavailability
- [ ] Migration 0041c: grooming_product_log, grooming_documents
- [ ] RLS policies para todas as 7 tabelas
- [ ] 7 índices de performance
- [ ] RPC functions (4 funções)

### Phase 2: Core Features (2 semanas)
- [ ] US-G001: Criar professional_schedules (POST /api/grooming/professional-schedules)
- [ ] US-G002: Agendar sessão (POST /api/grooming/schedule-session)
- [ ] US-G003: Visualizar availability (GET /api/grooming/available-slots)
- [ ] US-G004: Check-in (POST /api/grooming/check-in)
- [ ] US-G005: Checkout (POST /api/grooming/checkout)

### Phase 3: Status & Tracking (1.5 semanas)
- [ ] US-G006: Rastrear status real-time (GET /api/grooming/sessions + realtime)
- [ ] US-G007: Atribuição profissional (Minha Fila)
- [ ] POST /api/grooming/update-status com máquina de estados
- [ ] Webhooks de notificação

### Phase 4: Integrações (1.5 semanas)
- [ ] US-G008: Validar prontuário (alergias, comportamento)
- [ ] US-G009: Rastrear produtos (grooming_product_log)
- [ ] GET /api/grooming/analytics
- [ ] GET /api/grooming/audit-log
- [ ] Integração com patient_reception

### Phase 5: Polish & Deploy (1 semana)
- [ ] UI/UX refinement
- [ ] Testes E2E
- [ ] Performance tuning
- [ ] Documentation completa
- [ ] Deploy staging → prod

**Total Estimado: 6-7 semanas**

---

## PRÓXIMAS ETAPAS (DEV_AGENT)

### DEV_AGENT Fase 3: Implementação

1. **Executar migrations:**
   - 0041_extend_grooming_sessions.sql (professional_schedule_id, grooming_slot_id, etc.)
   - 0042_grooming_infrastructure.sql (professional_schedules, grooming_slots, etc.)
   - 0043_grooming_audit.sql (grooming_status_transitions, professional_unavailability)
   - 0044_grooming_documents.sql (grooming_product_log, grooming_documents)

2. **Implementar RPC functions:**
   - rpc_grooming_update_status
   - rpc_professional_check_availability
   - rpc_reserve_slot
   - rpc_generate_grooming_receipt

3. **Desenvolver API endpoints:**
   - /api/grooming/professional-schedules (POST)
   - /api/grooming/available-slots (GET)
   - /api/grooming/schedule-session (POST)
   - /api/grooming/check-in (POST)
   - /api/grooming/assign-professional (POST)
   - /api/grooming/update-status (POST)
   - /api/grooming/checkout (POST)
   - /api/grooming/sessions (GET)
   - /api/grooming/professional/:id/agenda (GET)
   - /api/grooming/audit-log (GET)

4. **Componentes React:**
   - GroomingScheduleForm
   - SlotsAvailableCalendar
   - SessionCheckInForm
   - MyQueueDashboard (Banhista/Tosador)
   - StatusTimelineViewer (Tutor)
   - CheckoutForm
   - AuditLogViewer (Gerente)

5. **Testes:**
   - Unit tests (RPC functions)
   - Integration tests (API endpoints)
   - E2E tests (Grooming workflow)

---

**Arquitetura Concluída: 2026-04-23**  
**Status:** ✅ Ready for Development (Phase 3)  
**Próximo Agente:** DEV_AGENT (Implementação)

---

Fim do GROOMING_ARCHITECTURE.md
