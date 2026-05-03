# GROOMING_SPEC.md — Refatoração Módulo Banho e Tosa (P1)

**Versão:** 1.0  
**Data:** 2026-04-23  
**Status:** Specification Complete  
**PM Agent:** Mozart Fase 1

---

## 📋 ÍNDICE

1. [9 User Stories Detalhadas](#9-user-stories-detalhadas)
2. [5 Regras de Negócio Categorizadas](#5-regras-de-negócio-categorizadas)
3. [Máquina de Estados com Transições](#máquina-de-estados-com-transições)
4. [Integração com Recepção](#integração-com-recepção)
5. [Tabela de Permissões (RBAC)](#tabela-de-permissões-rbac)
6. [Critérios de Sucesso](#critérios-de-sucesso)

---

## 9 USER STORIES DETALHADAS

### EPIC 1: Agendamento por Slots Rigorosos

#### US-G001: Criar Slots de Agendamento por Profissional

**Como** RECEPCIONISTA  
**Eu quero** criar slots de 1 hora (09:00-10:00, 10:00-11:00, etc.) para cada profissional  
**Para que** o sistema tenha uma agenda estruturada e previsível  

**Critérios de Aceitação:**

- **Estrutura do Slot:**
  - Campo `date` (data do slot)
  - Campo `start_time` (horário início, ex: 09:00)
  - Campo `end_time` (horário fim, ex: 10:00)
  - Campo `professional_id` (FK para professionals/grooming_professionals)
  - Campo `capacity` (número máximo de pets, default 3)
  - Campo `service_type` (array: 'banho', 'tosa', 'banho+tosa')
  - Campo `status` (active, unavailable, cancelled)

- **Criação em Lote:**
  - Interface permite criar slots para semana ou mês inteiro
  - Cópia de padrões (ex: "todos os dias úteis 09:00-17:00")
  - Validação: não permite overlapping de slots para mesmo profissional

- **Configurabilidade:**
  - Admin pode alterar duração padrão (1h, 1.5h, 2h) por clínica
  - Admin pode definir capacity máxima por tipo de serviço

- **UI/UX:**
  - Calendar grid com drag-and-drop (opcional para P1)
  - Batch upload via CSV (opcional para P1)
  - Simple form com datepicker + timepicker para P1

**Exemplo de Payload:**
```json
{
  "professional_id": "uuid-prof-1",
  "slots": [
    {
      "date": "2026-04-28",
      "start_time": "09:00",
      "end_time": "10:00",
      "capacity": 3,
      "service_type": ["banho", "tosa"]
    },
    {
      "date": "2026-04-28",
      "start_time": "10:00",
      "end_time": "11:00",
      "capacity": 3,
      "service_type": ["banho", "tosa"]
    }
  ]
}
```

**Notas de Implementação:**
- Criar tabela `grooming_slots` (migration 0041 ou posterior)
- Índices: `(clinic_id, professional_id, date, start_time)`
- Audit log de criação/modificação

---

#### US-G002: Agendar Pet em Slot Disponível

**Como** TUTOR (via app) ou RECEPCIONISTA  
**Eu quero** agendar meu pet em um slot específico e confirmado  
**Para que** tenha garantia de horário certo sem atrasos  

**Critérios de Aceitação:**

- **Filtros e Seleção:**
  - Mostra apenas slots com disponibilidade (`booked_count < capacity`)
  - Usuário seleciona serviço (banho, tosa, banho+tosa)
  - Usuário seleciona profissional (se múltiplos disponíveis)
  - Calendar view mostra horários livres vs ocupados

- **Validações:**
  - Bloqueia overbooking (soft-block: aviso; hard-block: proibido)
  - Valida se pet existe e está ativo
  - Valida se tutor existe e pode agendar

- **Fluxo de Confirmação:**
  - Confirmação imediata se slot disponível
  - Se lotado → opção: entrar em fila de espera (`wait_list = true`)
  - SMS/notificação ao tutor com código de agendamento

- **Status Atualizado:**
  - Estado muda de "scheduled" (novo) → "arrived" apenas na presença física

**Exemplo de Payload:**
```json
{
  "patient_id": "uuid-pet-123",
  "tutor_id": "uuid-tutor-456",
  "slot_id": "uuid-slot-789",
  "service_type": "banho+tosa",
  "professional_id": "uuid-prof-1",
  "wait_list": false
}
```

**Notas de Implementação:**
- Criar table `grooming_slot_bookings` (FK slot_id, patient_id, status)
- Trigger para atualizar `booked_count` em slots
- Notificação via WhatsApp integration

---

#### US-G003: Visualizar Disponibilidade de Profissional

**Como** RECEPCIONISTA ou GESTOR  
**Eu quero** ver a agenda semanal/mensal de cada profissional  
**Para que** eu saiba quando ele está livre e possa otimizar agendamentos  

**Critérios de Aceitação:**

- **View de Agenda:**
  - Calendar semanal (seg-sex ou seg-sab, configurable)
  - Slots ocupados em cor diferente (ex: azul)
  - Slots livres em branco/cinza claro
  - Tooltip ao hover mostra pets agendados, horário, serviço

- **Indisponibilidade:**
  - Botão "Marcar Indisponível" para férias/licença
  - Bloqueia múltiplos slots de uma vez
  - Modal com motivo + data fim
  - Notificação ao tutor de cancelamento (se houver agendamentos)

- **Performance:**
  - Carrega até 4 semanas de forma eficiente
  - Filtro por profissional/tipo de serviço
  - Export para ICS (opcional P2)

**Exemplo de Response:**
```json
{
  "professional_id": "uuid-prof-1",
  "name": "Maria (Banhista)",
  "week": [
    {
      "date": "2026-04-28",
      "slots": [
        {
          "id": "slot-1",
          "start_time": "09:00",
          "end_time": "10:00",
          "booked_count": 2,
          "capacity": 3,
          "bookings": [
            { "pet_name": "Rex", "service_type": "banho" },
            { "pet_name": "Luna", "service_type": "tosa" }
          ]
        }
      ]
    }
  ]
}
```

**Notas de Implementação:**
- Usar índice composto `(clinic_id, professional_id, date)` para queries rápidas
- Cache em Redis para 1h (opcional P2)

---

### EPIC 2: Check-in/Checkout Integrado com Recepção

#### US-G004: Check-in de Pet para Grooming

**Como** RECEPCIONISTA  
**Eu quero** fazer check-in do pet quando chega na clínica  
**Para que** sinalizar chegada, confirmar tutor e iniciar procedimento  

**Critérios de Aceitação:**

- **Busca e Confirmação:**
  - Input de busca por nome do pet ou ID
  - Mostra agendamento confirmado (horário, serviço, profissional)
  - Confirmação do tutor (nome, contato)
  - Foto do pet para validação visual

- **Transição de Status:**
  - Status muda: "scheduled" → "arrived" (transition 1)
  - Timestamp registrado: `arrived_at`
  - Operador registrado: `check_in_by` (profile_id)

- **Documentação:**
  - Tutor assina termo eletrônico (checkbox ou assinatura digital)
  - Checklist obrigatório (alergias conhecidas? medicamentos? comportamento?)
  - Comprovante de recebimento gerado (PDF/email/SMS)

- **Integração Recepção:**
  - Estado visível em `patient_reception` status (novo campo)
  - Remove pet da lista de "Aguardando Check-in" da Recepção
  - Libera profissional para iniciar procedimento

**Exemplo de Payload:**
```json
{
  "session_id": "uuid-session-123",
  "patient_id": "uuid-pet-456",
  "checked_in_by": "uuid-user-789",
  "term_signed": true,
  "checklist": {
    "allergy_confirmed": true,
    "behavior_noted": "tranquilo",
    "emergency_contact_verified": true
  }
}
```

**Notas de Implementação:**
- Adicionar campos a `grooming_sessions`: `arrived_at`, `check_in_by`, `term_signed`, `check_in_checklist` (JSONB)
- Audit log entry: `grooming_audit_log` (migration 0042)
- Notificação ao profissional: "Novo pet aguardando banho"

---

#### US-G005: Checkout de Pet do Grooming

**Como** RECEPCIONISTA  
**Eu quero** fazer checkout quando pet sai (entrega ao tutor)  
**Para que** finalizar sessão, validar pagamento e gerar recibo  

**Critérios de Aceitação:**

- **Validações Obrigatórias:**
  - Valida se `payment_status = 'paid'` ou `'waived'`
  - Mostra valor total, desconto aplicado, subtotal
  - Tutor confirma recebimento (assinatura eletrônica)

- **Transição Final:**
  - Status muda: "waiting_pickup" → "delivered" (transition final)
  - Timestamp registrado: `delivered_at`
  - Operador registrado: `check_out_by`

- **Documentação:**
  - Recibo gerado (JSON + PDF imprimível)
  - Nota fiscal integrada (se tenant usa NF-e)
  - Email ao tutor com resumo e foto (opcional)

- **Feedback (Opcional P2):**
  - Avaliação do tutor: star rating + comentário
  - Foto final do pet

**Exemplo de Payload:**
```json
{
  "session_id": "uuid-session-123",
  "checked_out_by": "uuid-user-789",
  "payment_confirmed": true,
  "receipt_data": {
    "total": 150.00,
    "discount": 10.00,
    "subtotal": 140.00,
    "payment_method": "credit_card"
  }
}
```

**Notas de Implementação:**
- Adicionar campos a `grooming_sessions`: `delivered_at`, `check_out_by`, `receipt_json`
- Chamar função de NF-e (integração future)
- Audit log entry
- Webhook para sistema de faturamento

---

### EPIC 3: Fluxo de Status Transparente

#### US-G006: Rastrear Status em Tempo Real

**Como** TUTOR  
**Eu quero** saber em que etapa meu pet está durante Grooming  
**Para que** não precise ligar perguntando + tenha transparência  

**Critérios de Aceitação:**

- **Máquina de Estados com 8 Estados:**
  1. `scheduled` — Agendado, aguardando chegada
  2. `arrived` — Check-in realizado, na fila
  3. `bathing` — No banho
  4. `grooming` — Na tosa
  5. `drying` — Secando
  6. `waiting_pickup` — Pronto, aguardando tutor
  7. `paid` — Pagamento confirmado, pronto para retirada
  8. `delivered` — Entregue ao tutor (terminal)

- **Rastreamento e Notificações:**
  - Cada transição registra: timestamp + operador + observação (opcional)
  - Tutor recebe SMS/push quando status muda
  - Status visível no app/portal do tutor (dashboard pessoal)

- **Dashboard em Tempo Real:**
  - Timeline vertical ou kanban card com estados
  - Badge com ícone do estado atual
  - Countdown para "Aguardando Tutor" (estimativa: 30min)

- **Histórico Imutável:**
  - Todas as transições em log imutável
  - Não permite "voltar" (ex: não pode revertir de "delivered" para "waiting_pickup")

**Exemplo de Resposta:**
```json
{
  "session_id": "uuid-session-123",
  "patient_name": "Rex",
  "current_status": "grooming",
  "progress": 50,
  "timeline": [
    {
      "status": "scheduled",
      "timestamp": "2026-04-28T08:00:00Z",
      "by": "SISTEMA",
      "note": "Agendado para 10:00"
    },
    {
      "status": "arrived",
      "timestamp": "2026-04-28T10:05:00Z",
      "by": "Maria (Recepcionista)",
      "note": "Check-in confirmado"
    },
    {
      "status": "bathing",
      "timestamp": "2026-04-28T10:15:00Z",
      "by": "João (Banhista)",
      "note": "Iniciado banho"
    },
    {
      "status": "grooming",
      "timestamp": "2026-04-28T10:50:00Z",
      "by": "João (Banhista)",
      "note": "Iniciada tosa"
    }
  ],
  "estimated_ready": "2026-04-28T12:00:00Z"
}
```

**Notas de Implementação:**
- Tabela `grooming_status_transitions` (migration 0042)
- Função RPC para atualizar status com trigger de notificação
- Webhook para push/SMS (integração WhatsApp existente)
- Campo `estimated_ready_at` em `grooming_sessions` (baseado em tipo serviço)

---

#### US-G007: Atribuição de Profissional

**Como** BANHISTA/TOSADOR  
**Eu quero** saber qual pet é meu durante o dia  
**Para que** eu possa gerenciar minha fila de trabalho eficientemente  

**Critérios de Aceitação:**

- **Atribuição Automática/Manual:**
  - Cada sessão tem campo `assigned_to` (professional_id)
  - Atribuição feita na recepção (ao agendar ou no check-in)
  - Profissional pode ver apenas seus pets (`assigned_to = user.id`)

- **Dashboard "Minha Fila":**
  - View com pets atribuídos ao profissional do dia
  - Ordenado por horário agendado
  - Botões rápidos: "Iniciar Banho" → "Iniciar Tosa" → "Pronto para Secar"
  - Status atual em badge colorido
  - Foto + nome do pet + notas do tutor visíveis

- **Controle de Transição:**
  - Profissional pode marcar:
    - "Iniciando banho" (status → bathing)
    - "Iniciando tosa" (status → grooming)
    - "Pronto para secar" (status → drying)
  - Não pode pular etapas (validação no servidor)

- **Histórico Pessoal:**
  - Profissional vê "Pets Completados Hoje"
  - Contagem de serviços realizados
  - Média de tempo por serviço (KPI futuro)

**Exemplo de Resposta:**
```json
{
  "professional_id": "uuid-prof-1",
  "name": "João (Banhista)",
  "date": "2026-04-28",
  "assigned_pets": [
    {
      "session_id": "session-1",
      "pet_name": "Rex",
      "species": "Cachorro",
      "breed": "Shih Tzu",
      "size": "P",
      "scheduled_time": "09:00",
      "current_status": "arrived",
      "services": ["banho", "tosa"],
      "notes_from_tutor": "Alérgico a produtos de coco",
      "photo_url": "..."
    }
  ],
  "completed_today": 3,
  "in_progress": 1,
  "pending": 2
}
```

**Notas de Implementação:**
- Adicionar campo `assigned_to` (FK professionals/profiles.id) em `grooming_sessions`
- RLS policy: profissional vê apenas seus pets
- View: `/dashboard/grooming/my-queue` (nova rota)
- Notificação push ao profissional quando novo pet é atribuído

---

### EPIC 4: Integrações e Validações

#### US-G008: Validar Prontuário do Pet

**Como** BANHISTA  
**Eu quero** ver alergias, comportamento e histórico do pet antes de começar  
**Para que** não causar dano e ter procedimento seguro  

**Critérios de Aceitação:**

- **Integração com Medical Records:**
  - Carrega dados de `medical_records` tabela existente
  - Mostra: alergias conhecidas, medicamentos em uso, histórico de comportamento
  - Filtra alergias à produtos de higiene (shampoo, condicionador)

- **Alertas Visuais:**
  - Se `behavior = 'agressivo'` → banner vermelho destacado ("⚠️ COMPORTAMENTO AGRESSIVO")
  - Se alergias conhecidas → lista em box laranja
  - Se medicações ativas → ícone de medicamento com tooltip

- **Checklist de Segurança:**
  - Banhista confirma cada item antes de prosseguir:
    - "Li e confirmei alergia a X"
    - "Comportamento notas confirmadas"
    - "Temperatura do banho está ok"
  - Checklist salvo em `grooming_session_checklist` (JSONB ou tabela separada)

- **Histórico de Serviços:**
  - Últimos 3 grooming do pet (datas e observações)
  - Qual profissional fez, como foi comportamento anterior

**Exemplo de Resposta:**
```json
{
  "session_id": "session-123",
  "pet_name": "Rex",
  "medical_summary": {
    "allergies": ["Coco", "Aloe vera"],
    "active_medications": ["Amlodipina 5mg"],
    "behavior_history": "Medroso com banhistas novos, calma com Maria",
    "weight": 8.5,
    "last_checkup": "2026-02-15"
  },
  "alert_level": "high",
  "alerts": [
    {
      "type": "allergy",
      "message": "Alérgico a produtos com coco — usar alternativa"
    },
    {
      "type": "behavior",
      "message": "Medroso — evitar barulhos altos, movimentos bruscos"
    }
  ],
  "previous_sessions": [
    {
      "date": "2026-04-15",
      "professional": "Maria",
      "services": ["banho"],
      "notes": "Comportamento tranquilo, sem incidentes"
    }
  ]
}
```

**Notas de Implementação:**
- Query JOIN: `grooming_sessions` → `patients` → `medical_records`
- Adicionar campo `behavior_tags` em `patients` (já existe no schema)
- Índice: `(patient_id, allergy_type)` em `medical_records`
- Cachedquery (5min) em Redis para performance

---

#### US-G009: Vincular Produtos de Estoque

**Como** GERENTE  
**Eu quero** rastrear quais produtos foram usados em cada grooming  
**Para que** ter relatório de consumo e controlar custos  

**Critérios de Aceitação:**

- **Registro de Produtos:**
  - Profissional seleciona produtos ao finalizar sessão
  - Ex: Shampoo Neutro 500ml, Condicionador Hidratante, Colônia Flores
  - Quantidade usada (ex: "1/4 do frasco", ou "50ml")

- **Integração com Estoque:**
  - Cada produto vinculado a `clinic_catalog` (item_type = 'product' ou 'grooming_product')
  - Ao registrar uso, quantidade é decrementada automaticamente
  - Alerta se estoque cai abaixo de mínimo configurado

- **Relatório de Consumo:**
  - Agregação por período (dia, semana, mês)
  - Produto mais usado, custo total de consumo
  - Custo por serviço (ex: "Banho custa R$12 em produtos")
  - Comparação com mês anterior (trend)

- **Validações:**
  - Bloqueia uso se estoque insuficiente (soft warning, permitir uso)
  - Permite fazer ajustes manuais (se houve derramamento, etc.)

**Exemplo de Payload:**
```json
{
  "session_id": "session-123",
  "products_used": [
    {
      "product_id": "prod-shampoo-1",
      "product_name": "Shampoo Neutro",
      "quantity_used": 0.25,
      "unit": "bottle"
    },
    {
      "product_id": "prod-conditioner-1",
      "product_name": "Condicionador Hidratante",
      "quantity_used": 50,
      "unit": "ml"
    }
  ]
}
```

**Notas de Implementação:**
- Criar tabela `grooming_product_usage` (migration 0042)
- Trigger ao inserir: decrementar `quantity` em `clinic_catalog`
- Alerta se quantity < min_stock
- View: `/dashboard/grooming/consumption` (novo relatório)
- Agregação via window functions (SQL) para performance

---

## 5 REGRAS DE NEGÓCIO CATEGORIZADAS

### RN-Slots: Estrutura e Validação de Agendamento

**RN-Slots-01: Duração Padrão de Slots**
- Slots padrão são blocos de 1 hora (09:00-10:00, 10:00-11:00, etc.)
- Admin pode configurar duração por clínica via settings (1h, 1.5h, 2h)
- Slots não podem ter menos de 30min ou mais de 4h

**RN-Slots-02: Capacidade de Slots**
- Cada slot tem `capacity` (máximo de pets simultâneos)
- Default: 3 pets por slot
- Admin pode alterar por profissional ou por tipo de serviço
- Mínimo: 1 pet, Máximo: 5 pets

**RN-Slots-03: Overbooking Bloqueado**
- Quando `booked_count >= capacity`, slot entra em "lotado"
- Sistema **proibido** fazer booking em slot lotado (hard-block)
- Alternativa: tutor pode entrar em fila de espera (`wait_list = true`)
- Fila de espera é FIFO (first-in-first-out)

**RN-Slots-04: Indisponibilidade de Profissional**
- Profissional pode marcar período como "indisponível" (férias, licença, emergência)
- Ao marcar indisponível: todos os slots daquele período são cancelados
- Tutores com agendamento cancelado recebem notificação + opção de reagendamento

**RN-Slots-05: Cancelamento e Reagendamento**
- Tutor pode cancelar até 24h antes do horário agendado (sem penalidade)
- Cancelamento < 24h: pode haver taxa (configurable por tenant)
- Recepcionista pode cancelar a qualquer momento
- Slot cancelado volta para "disponível" automaticamente

---

### RN-Status: Estados Sequenciais Obrigatórios

**RN-Status-01: Sequência Imutável de Estados**
- Estados obrigatórios (nesta ordem, sem pular):
  1. `scheduled` — Agendado, não chegou
  2. `arrived` — Check-in realizado
  3. `bathing` — No banho
  4. `grooming` — Na tosa
  5. `drying` — Secando
  6. `waiting_pickup` — Pronto, aguardando tutor
  7. `paid` — Pagamento confirmado
  8. `delivered` — Entregue (terminal)

- Estados terminais (não mudam mais): `delivered`, `cancelled`

**RN-Status-02: Transições Requerem Autorização**
- Cada transição requer papel específico:
  - `scheduled` → `arrived`: RECEPCIONISTA (check-in)
  - `arrived` → `bathing`: RECEPCIONISTA (assinatura termo) ou BANHISTA (iniciar)
  - `bathing` → `grooming`: BANHISTA (notação)
  - `grooming` → `drying`: TOSADOR (notação)
  - `drying` → `waiting_pickup`: BANHISTA/SECADOR (conclusão)
  - `waiting_pickup` → `paid`: RECEPCIONISTA (confirmação pagamento)
  - `paid` → `delivered`: RECEPCIONISTA (checkout)
  - Qualquer → `cancelled`: RECEPCIONISTA ou GERENTE (cancelamento)

**RN-Status-03: Nenhuma Transição "Para Trás"**
- Uma vez transicionado para estado X, não é possível voltar para estado Y < X
- Exemplo: pet em "drying" não pode voltar para "bathing"
- Exceção: cancelamento a qualquer momento (transição para `cancelled`)

**RN-Status-04: Audit Log Imutável de Transições**
- Cada transição registra: `timestamp`, `from_status`, `to_status`, `user_id`, `user_name`, `reason`
- Audit log **nunca** é deletado (WORM — Write Once Read Many)
- Relatório de auditoria acessível ao gerente/admin

**RN-Status-05: Timestamps Obrigatórios**
- `scheduled_at`: quando foi agendado
- `arrived_at`: quando fez check-in
- `bathing_start_at`: quando iniciou banho
- `grooming_start_at`: quando iniciou tosa
- `drying_start_at`: quando iniciou secagem
- `waiting_pickup_at`: quando ficou pronto
- `paid_at`: quando pagamento foi confirmado
- `delivered_at`: quando entregue ao tutor
- Todos em UTC para consistência multi-tenant

---

### RN-Profissionais: Atribuição e Disponibilidade

**RN-Profissionais-01: Tipos de Profissional**
- Cada profissional tem `professional_type`:
  - `banhista` — realiza banho
  - `tosador` — realiza tosa
  - `multi_skill` — realiza ambos
- Type é imutável após criação (evitar confusão)

**RN-Profissionais-02: Slots por Profissional**
- Cada slot é vinculado a exatamente 1 profissional
- Um profissional pode ter múltiplos slots **simultâneos** (ex: 09:00-10:00 + 10:00-11:00 em dias diferentes)
- Profissional **não pode** ter 2 slots sobrepostos no mesmo horário (validação)

**RN-Profissionais-03: Atribuição de Pet a Profissional**
- Campo `assigned_to` em `grooming_sessions` aponta para profissional
- Atribuição pode ser automática (ao agendar no slot) ou manual (recepção)
- Profissional só vê pets `assigned_to = seu_profile_id`

**RN-Profissionais-04: Indisponibilidade Bloqueia Todos os Slots**
- Se profissional marca período "indisponível":
  - Todos os slots daquele período ganham status `unavailable`
  - Bookings existentes são **cancelados** (notificação ao tutor)
  - Período pode ser: data única, range, ou padrão recorrente (ex: "todo agosto")

**RN-Profissionais-05: KPI e Performance**
- Sistema deve registrar: serviços por dia, tempo médio, avaliação de tutor
- Gerente pode gerar relatório de produtividade por profissional
- Dados usados para otimização de agendamento (P3)

---

### RN-Integração-Recepção: Touch Points com Módulo Recepção

**RN-Recepção-01: Visibilidade de Agendados**
- Pet com agendamento Grooming (`scheduled_at` futuro) aparece em "Agendar Grooming" da Recepção
- Status visível: "Agendado para 28/04 às 10:00 com João (Banhista)"
- Recepcionista pode cancelar ou confirmar chegada

**RN-Recepção-02: Check-in Grooming Atualiza Recepção**
- Ao fazer check-in Grooming, campo `patient_reception.status` muda para "Grooming: Na fila"
- Pet desaparece da lista "Aguardando Check-in" e aparece em "Grooming em andamento"
- Tutor recebe SMS: "Rex foi recebido com sucesso. Será entregue em ~2h"

**RN-Recepção-03: Checkout Grooming Libera Saída**
- Ao fazer checkout (status = delivered), pet fica "Pronto para sair"
- Recepção mostra: "Rex aguarda saída — Pago" com botão de impressão de recibo
- Liberação física do pet ao tutor é responsabilidade da Recepção
- Timestamp de saída final registrado em `patient_reception`

**RN-Recepção-04: Integração de Checklist**
- Checklist de Grooming (`check_in_checklist`) herdado de `reception_checklist` (migration 0002)
- Items obrigatórios: "Confirmou alergias?", "Tutor assinou termo?"
- Recepcionista valida antes de liberar para profissional

**RN-Recepção-05: Sincronização de Cancelamento**
- Se Recepção cancela agendamento Grooming:
  - Slot volta para "disponível"
  - Fila de espera avança (próximo tutor é notificado)
  - Tutor original recebe SMS de cancelamento + opção de reagendamento

---

### RN-Preços: Pricing Dinâmico e Desconto

**RN-Preços-01: Catálogo de Serviços**
- Preços definidos em `clinic_catalog` com `item_type = 'grooming'`
- Cada serviço tem: `name`, `price`, `min_price`, `max_price`, `is_active`
- Exemplo:
  - "Banho Simples" = R$ 50
  - "Tosa Completa" = R$ 80
  - "Banho + Tosa" = R$ 120 (ou 50 + 80 = 130, com desconto automático?)

**RN-Preços-02: Preço Pode Variar por Porte do Pet**
- Preço pode ter multiplicador por `patient.size`:
  - P (pequeno) = 1.0x
  - M (médio) = 1.2x
  - G (grande) = 1.5x
- Exemplo: "Banho Simples" = R$ 50 (P), R$ 60 (M), R$ 75 (G)

**RN-Preços-03: Desconto por Sessão**
- Recepcionista ou Gerente pode aplicar desconto:
  - Desconto percentual (0-100%)
  - Desconto fixo em reais
  - Cupom desconto (integração futura)
- Total = Subtotal × (1 - desconto_pct) - desconto_fixo

**RN-Preços-04: Adicionais e Serviços Combinados**
- Alguns serviços podem ter adicionais:
  - Base: "Banho + Tosa" = R$ 120
  - Adicional: "Hidratação" = +R$ 30
  - Adicional: "Perfume Premium" = +R$ 15
  - Total = R$ 165
- Sistema permite combo de serviços

**RN-Preços-05: Preço Total em JSONB**
- Campo `service_prices` em `grooming_sessions` armazena breakdown:
```json
{
  "service_prices": [
    { "name": "Banho Simples", "price": 50.00, "qty": 1 },
    { "name": "Tosa Completa", "price": 80.00, "qty": 1 }
  ],
  "subtotal": 130.00,
  "discount_percent": 10,
  "discount_value": 13.00,
  "price_total": 117.00
}
```

---

## Máquina de Estados com Transições

### Diagrama de Estados

```
                ┌─────────────────┐
                │   SCHEDULED     │ ← Agendado
                │   (data futura) │
                └────────┬────────┘
                         │ check-in
                         ↓
                ┌─────────────────┐
                │     ARRIVED     │ ← Chegou, check-in feito
                │   (na fila)     │
                └────────┬────────┘
                         │ assinar termo / iniciar
                         ↓
                ┌─────────────────┐
                │     BATHING     │ ← No banho
                │  (lavando pet)  │
                └────────┬────────┘
                         │ banho concluído
                         ↓
                ┌─────────────────┐
                │    GROOMING     │ ← Na tosa
                │  (tosando pet)  │
                └────────┬────────┘
                         │ tosa concluída
                         ↓
                ┌─────────────────┐
                │     DRYING      │ ← Secando
                │ (secando pet)   │
                └────────┬────────┘
                         │ secagem pronta
                         ↓
                ┌─────────────────┐
        ┌──────▶│ WAITING_PICKUP  │ ← Pronto, aguardando tutor
        │       │ (aguardando)    │
        │       └────────┬────────┘
        │                │ pagamento OK
        │                ↓
        │       ┌─────────────────┐
        │       │      PAID       │ ← Pagamento confirmado
        │       │ (pronto sair)   │
        │       └────────┬────────┘
        │                │ entrega ao tutor
        │                ↓
        │       ┌─────────────────┐
        │       │    DELIVERED    │ ← Entregue (TERMINAL)
        │       │                 │
        │       └─────────────────┘
        │
        └── (isentar pagamento)
                [transition: waiting_pickup → paid]

    (cancelamento permitido em qualquer estado)
        │
        └───────────────────────────────────────┐
                                                ↓
                                    ┌─────────────────────┐
                                    │    CANCELLED        │
                                    │ (cancelado)         │
                                    │ (TERMINAL)          │
                                    └─────────────────────┘
```

### Tabela de Transições

| From | To | Trigger | Actor | Permission | Condition | Notes |
|------|----|---------|----|------------|-----------|-------|
| `scheduled` | `arrived` | Check-in | RECEPCIONISTA | Role-based | Pet agendado existe | Busca em `scheduled_at < now()` |
| `arrived` | `bathing` | Assinar termo | RECEPCIONISTA ou BANHISTA | Role-based | Termo assinado | Pode ser automático se tutor já assinou |
| `bathing` | `grooming` | Banho concluído | BANHISTA | Role-based | Sessão em bathing | Timestamp registrado |
| `grooming` | `drying` | Tosa concluída | TOSADOR | Role-based | Sessão em grooming | Timestamp registrado |
| `drying` | `waiting_pickup` | Secagem pronta | BANHISTA/SECADOR | Role-based | Sessão em drying | Notificação ao tutor |
| `waiting_pickup` | `paid` | Pagamento confirmado | RECEPCIONISTA | Role-based | payment_status = 'pending' | Ou `isentar` se payment_status = 'waived' |
| `waiting_pickup` | `paid` | Isentar pagamento | GERENTE | Role-based | payment_status = 'pending' | Desconto 100%, campo `paid_by_exemption` = true |
| `paid` | `delivered` | Checkout / Entrega | RECEPCIONISTA | Role-based | Tutor presente | Timestamp, foto (opcional) |
| Qualquer | `cancelled` | Cancelar | RECEPCIONISTA ou GERENTE | Role-based | Não é terminal | Notificação ao tutor, slot liberado |

### Validações de Transição

Todas as transições incluem:
- **Validação de Permissão:** User.role deve estar em lista de actors
- **Validação de Estado:** Estado atual deve ser exato (não permite skip)
- **Validação de Dados:** Campos obrigatórios presentes (ex: term_signed para arrived→bathing)
- **Validação de Timing:** Não permite transição "para trás"
- **Audit Log:** Registra transição com timestamp + user + motivo

### Exemplo de Implementação (pseudocódigo)

```typescript
// grooming_status_machine.ts

export const transitions = {
  scheduled: {
    arrived: {
      actor: ['RECEPCIONISTA'],
      validate: (session) => session.scheduled_at <= now(),
      onTransition: (session, user) => {
        return {
          status: 'arrived',
          arrived_at: now(),
          check_in_by: user.id,
        }
      }
    }
  },
  arrived: {
    bathing: {
      actor: ['RECEPCIONISTA', 'BANHISTA'],
      validate: (session) => session.term_signed === true,
      onTransition: (session, user) => ({
        status: 'bathing',
        bathing_start_at: now(),
      })
    }
  },
  // ... mais transições
  paid: {
    delivered: {
      actor: ['RECEPCIONISTA'],
      validate: (session) => session.payment_status === 'paid',
      onTransition: (session, user) => ({
        status: 'delivered',
        delivered_at: now(),
        check_out_by: user.id,
      })
    }
  }
}

export async function transitionStatus(
  sessionId: string,
  toStatus: GroomingStatus,
  user: { id: string; role: string }
): Promise<Result> {
  const session = await getSession(sessionId)
  const transition = transitions[session.status]?.[toStatus]
  
  if (!transition) {
    return { error: `Transição inválida: ${session.status} → ${toStatus}` }
  }
  
  if (!transition.actor.includes(user.role)) {
    return { error: `Papel ${user.role} não pode fazer essa transição` }
  }
  
  if (!transition.validate(session)) {
    return { error: `Validação falhou para transição` }
  }
  
  const patch = transition.onTransition(session, user)
  await updateSession(sessionId, patch)
  await logTransition(sessionId, session.status, toStatus, user)
  
  return { success: true }
}
```

---

## Integração com Recepção

### 3 Touch Points Principais

#### Touch Point 1: Agendamento e Visualização

**Fluxo:**
1. Tutor ou Recepcionista acessa "Agendar Grooming"
2. Sistema filtra slots disponíveis (próximas 2 semanas)
3. Seleciona serviço, profissional, horário
4. Confirmação: pet aparece em "Agendados" na Recepção
5. Tutor recebe SMS: "Agendamento confirmado para 28/04 às 10:00"

**Integração Técnica:**
- Rota: `GET /api/grooming/available-slots` com filtros
- Campo visível: `grooming_sessions.scheduled_at`
- Status atual: `grooming_sessions.status = 'scheduled'`
- RLS: Tutor vê só seus pets, Recepcionista vê todos

---

#### Touch Point 2: Check-in (Chegada)

**Fluxo:**
1. Pet chega à clínica no horário agendado
2. Recepcionista busca pet (busca rápida por nome ou ID)
3. Confirma agendamento: horário, serviço, profissional, tutor
4. Tutor assina termo eletrônico (tablet na recepção)
5. Checklist obrigatória: alergias? comportamento? emergência?
6. Comprovante impresso ou enviado por SMS
7. Pet muda para "fila" (status = `arrived`)
8. Profissional recebe notificação: "Novo pet aguardando banho"

**Integração Técnica:**
- Rota: `POST /api/grooming/check-in`
- Atualiza `grooming_sessions`: status → `arrived`, `arrived_at`, `check_in_by`
- Atualiza `patient_reception`: status → "Grooming em andamento"
- Trigger: WhatsApp notificação ao profissional
- Gera comprovante em JSON (salvo em `grooming_documents`)

---

#### Touch Point 3: Checkout (Entrega)

**Fluxo:**
1. Pet finaliza grooming (status = `waiting_pickup`)
2. Recepcionista busca sessão (busca rápida)
3. Valida pagamento:
   - Se pendente: mostra total, aplica desconto se houver, recebe pagamento
   - Se pago: mostra "Pago em [data]"
   - Se isento: gerente já marcou como gratuito
4. Status muda para `paid`
5. Pet fica "pronto para sair" — Recepção libera saída
6. Tutor assina recibo (opcional)
7. Foto final tirada (opcional, para memória)
8. Pet é entregue fisicamente
9. Status muda para `delivered`
10. Tutor recebe SMS: "Rex foi retirado com sucesso. Avaliação:"

**Integração Técnica:**
- Rota: `POST /api/grooming/check-out`
- Atualiza `grooming_sessions`: status → `paid` → `delivered`, `delivered_at`, `check_out_by`
- Atualiza `patient_reception`: status → "Saída finalizada"
- Gera recibo (PDF via template, salvo em `grooming_documents`)
- Webhook: faturamento (integração futura com módulo Finance)
- Trigger: SMS + avaliação (star rating) ao tutor

---

### Diagrama de Integração com Recepção

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MÓDULO RECEPÇÃO                              │
│  (reception.tsx, check-in/checkout)                                 │
└──────────────────────────────────────────────────────────────────┬──┘
                                                                    │
                                                    ┌───────────────┤
                    ┌──────────────────────────────▼──────────────┐ │
                    │     GROOMING AGENDAMENTO                  │ │
                    │   (grooming_sessions)                     │ │
                    │  status: scheduled, arrived, ..., paid   │ │
                    └──────────────────────────────────────────┘ │
                                                                  │
              ┌───────────────┬──────────────┬───────────────┐   │
              │               │              │               │   │
         Touch Point 1    Touch Point 2  Touch Point 3       │   │
         (Agendamento)    (Check-in)    (Checkout)          │   │
              │               │              │               │   │
              ↓               ↓              ↓               │   │
         ┌─────────┐    ┌──────────┐  ┌─────────────┐       │   │
         │ Slots   │    │  Check-  │  │  Checkout   │       │   │
         │ livres  │───▶│   in     │─▶│ & Pagamento │       │   │
         │ p/      │    │ Recepção │  │  Recepção   │       │   │
         │ semana  │    │          │  │             │       │   │
         └─────────┘    └──────────┘  └─────────────┘       │   │
              │               │              │               │   │
              │ SMS:          │ SMS:         │ SMS:          │   │
              │ Confirmado    │ Recebido     │ Pronto/Pagdo  │   │
              │               │              │               │   │
              └───────────────┴──────────────┴───────────────┼───┘
                                                             │
                                            ┌────────────────┘
                                            │
                                  ┌─────────▼──────────┐
                                  │ patient_reception  │
                                  │ status atualizado  │
                                  └────────────────────┘
```

---

## Tabela de Permissões (RBAC)

### Legenda
- ✅ Permitido
- ❌ Bloqueado
- 🔓 Com verificação (ex: apenas se tutor do pet)

| Ação | TUTOR | RECEPCIONISTA | BANHISTA | TOSADOR | GERENTE | ADMIN |
|------|-------|---------------|----------|---------|---------|-------|
| **Agendamento** | | | | | | |
| Ver slots disponíveis | ✅ (própios) | ✅ | ❌ | ❌ | ✅ | ✅ |
| Agendar pet | ✅ (própios) | ✅ | ❌ | ❌ | ✅ | ✅ |
| Cancelar agendamento | ✅ (própios, <24h) | ✅ (sempre) | ❌ | ❌ | ✅ | ✅ |
| Reagendar | ✅ (própios) | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Gerenciamento de Slots** | | | | | | |
| Criar slots | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Editar slots | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Deletar slots | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Marcar indisponível | ❌ | ❌ | ✅ (próprio) | ✅ (próprio) | ✅ | ✅ |
| **Check-in/Checkout** | | | | | | |
| Fazer check-in | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Confirmar chegada | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Assinar termo | ✅ | 🔓 | ❌ | ❌ | ✅ | ✅ |
| Fazer checkout | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Status & Transitions** | | | | | | |
| Ver status own pet | ✅ | ✅ | 🔓 | 🔓 | ✅ | ✅ |
| Ver status all pets | ❌ | ✅ | 🔓 | 🔓 | ✅ | ✅ |
| Marcar "Iniciando banho" | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Marcar "Iniciando tosa" | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Marcar "Pronto para retirada" | ❌ | ❌ | ✅ (multi) | ✅ (multi) | ✅ | ✅ |
| Confirmar pagamento | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Pricing & Pagamento** | | | | | | |
| Ver preço | 🔓 (próprios) | ✅ | ❌ | ❌ | ✅ | ✅ |
| Aplicar desconto | ❌ | 🔓 (<10%) | ❌ | ❌ | ✅ | ✅ |
| Marcar como pago | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Isentar pagamento | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Registros & Documentos** | | | | | | |
| Adicionar evolução (nota) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adicionar foto/documento | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver evolução | 🔓 (próprio) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deletar documento | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Prontuário & Validações** | | | | | | |
| Ver prontuário | 🔓 (próprio) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Confirmar alergias | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Produtos & Estoque** | | | | | | |
| Registrar produto usado | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Ver consumo produtos | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Relatório consumo | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Agenda Pessoal** | | | | | | |
| Ver "Minha Fila" | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Ver agenda completa | ❌ | ✅ | ✅ (própria) | ✅ (própria) | ✅ | ✅ |
| **Relatórios & Analytics** | | | | | | |
| Ver KPIs pessoais | ❌ | ❌ | ✅ (próprios) | ✅ (próprios) | ✅ | ✅ |
| Ver KPIs clínica | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Audit log | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

**Notas:**
- 🔓 "Com verificação" = sistema valida antes de permitir
- Tutor só vê seus próprios pets
- Profissional vê pets atribuídos a ele + colega (multi-skill)
- Gerente = role `clinic_manager` ou superior
- Admin = role `clinic_admin` (acesso total)

---

## Critérios de Sucesso

### ✅ Especificação Completa

- [x] 9 User Stories detalhadas (US-G001 a US-G009) com critérios de aceitação claros
- [x] Diagrama de máquina de estados com 8 estados + 8 transições principais
- [x] Tabela de transições com actor, validações e condições
- [x] Regras de negócio categorizadas em 5 grupos (Slots, Status, Profissionais, Recepção, Preços)
- [x] 3 touch points de integração com Recepção definidos (Agendamento, Check-in, Checkout)
- [x] Tabela RBAC completa com 6 roles × 30+ ações

### ✅ Clareza e Testabilidade

- Cada US tem: descrição, critérios de aceitação, exemplos de payload, notas técnicas
- Cada transição tem: actor, validação, condição de executabilidade
- Cada RN é específica (não ambígua): números exatos, formatos, sequências

### ✅ Integração com Recepção

- Touch Point 1: Agendamento visível, slots livres/ocupados
- Touch Point 2: Check-in atualiza `patient_reception` status
- Touch Point 3: Checkout libera "Saída" e gera recibo
- Sincronização de cancelamento confirmada
- Notificações (SMS) integradas

### ✅ Conformidade Técnica

- Multi-tenancy: `clinic_id` em todas as tabelas
- RLS: policies por tabela para isolamento
- Audit log: imutável, com timestamps UTC
- Normalização: sem redundância, FK integridade
- Performance: índices estratégicos definidos (migration 0041+)

### ✅ Pronto para Desenvolvimento

- Tabelas necessárias identificadas (grooming_slots, grooming_slot_bookings, grooming_status_transitions, grooming_product_usage, grooming_professionals)
- Funções RPC a implementar listadas
- Triggers a criar especificados
- Rotas API definidas (GET/POST endpoints)
- Componentes React a criar (GroomingSlotsCalendar, MyQueueDashboard, ConsumptionReport)

---

## Próximos Passos (Implementation Roadmap)

### Phase 1: Infrastructure (Sprint P1.0 — estimado 1 semana)
- [ ] Migration 0041: `grooming_slots`, `grooming_slot_bookings`, `grooming_status_transitions`
- [ ] Migration 0042: `grooming_professionals`, `grooming_product_usage`, `grooming_audit_log`
- [ ] RLS policies para novas tabelas
- [ ] Índices estratégicos
- [ ] Função RPC: `update_grooming_status` (com validação de máquina de estados)

### Phase 2: Core Features (Sprint P1.1 — estimado 2 semanas)
- [ ] US-G001: Criar slots (RECEPCIONISTA, form simples)
- [ ] US-G002: Agendar pet em slot (TUTOR/RECEPCIONISTA, select slot)
- [ ] US-G003: Visualizar disponibilidade (RECEPCIONISTA, calendar view)
- [ ] US-G004: Check-in (RECEPCIONISTA, integração Recepção)
- [ ] US-G005: Checkout (RECEPCIONISTA, integração Recepção)

### Phase 3: Status Tracking (Sprint P1.2 — estimado 1.5 semana)
- [ ] US-G006: Rastrear status em tempo real (TUTOR, dashboard)
- [ ] US-G007: Atribuição de profissional (BANHISTA, "Minha Fila")
- [ ] Transições automáticas via Supabase Realtime
- [ ] Notificações SMS integradas

### Phase 4: Validações & Integrações (Sprint P1.3 — estimado 1.5 semana)
- [ ] US-G008: Validar prontuário (BANHISTA, alergias + comportamento)
- [ ] US-G009: Vincular produtos de estoque (GERENTE, relatório consumo)
- [ ] Analytics: KPIs por profissional + consumo
- [ ] Audit log viewer (GERENTE)

### Phase 5: Polish & Deploy (Sprint P1.4 — estimado 1 semana)
- [ ] UI/UX refinement (responsiveness, mobile)
- [ ] Performance tuning (caching, índices)
- [ ] Testes E2E (Playwright)
- [ ] Documentation (API docs, user guide)
- [ ] Deploy to staging/production

**Total Estimado:** 6-7 semanas para P1 completo (slots rigorosos + rastreamento + integrações)

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Slot** | Bloco de 1 hora (configurável) com capacidade fixa de pets |
| **Overbooking** | Agendar mais pets que a capacidade do slot (proibido) |
| **Wait List** | Fila de espera FIFO se slot lotado |
| **Check-in** | Recepção do pet na clínica (status: arrived) |
| **Checkout** | Entrega do pet ao tutor (status: delivered) |
| **Multi-skill** | Profissional que realiza banho + tosa |
| **Audit Log** | Registro imutável de todas as transições |
| **RLS** | Row Level Security (isolamento por clinic_id no Supabase) |
| **RBAC** | Role-Based Access Control (permissões por papel) |
| **KPI** | Key Performance Indicator (métrica de desempenho) |

---

## Contato

**Product Manager:** Mozart Fase 1 (PM_AGENT)  
**Versão Spec:** 1.0 (2026-04-23)  
**Status:** Ready for Development (Phase 1 Infrastructure)

---

**Fim da Especificação**
