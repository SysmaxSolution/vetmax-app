# VetMax — Documentação de Contexto do Sistema

> Leia este arquivo antes de qualquer tarefa neste projeto para entender o domínio, o fluxo clínico veterinário e as regras de negócio fundamentais.

---

## 1. O que é o VetMax?

O **VetMax** é um HIS (Hospital Information System) Veterinário focado em agilidade por voz e IA. É construído sobre a mesma arquitetura robusta do HealthMax, porém adaptado para o mercado pet — clínicas veterinárias, petshops com consultório e hospitais veterinários 24h.

**Stack:** Next.js 16 (Turbopack) + Supabase + Anthropic Claude API + Tailwind CSS v4

---

## 2. Fluxo Clínico Principal

```
Recepção → Triagem → Médico Vet → Exames / Internação → Farmácia → Alta
```

| Etapa | Responsável | Descrição |
|---|---|---|
| **Recepção** | Recepcionista | Cadastra o Tutor e o Pet, registra check-in, define forma de pagamento |
| **Triagem** | Auxiliar Veterinário | Coleta peso, temperatura retal, queixas do tutor, sinais vitais iniciais |
| **Médico Vet** | Médico Veterinário | Atendimento clínico, prontuário por voz + IA, prescrições |
| **Exames** | Técnico Lab / Imagem | Processa resultados e devolve para o Médico Vet |
| **Internação** | Auxiliar Veterinário | Monitora o animal internado, registra evoluções |
| **Farmácia** | Auxiliar Veterinário / Farmacêutico | Avalia e dispensa medicamentos prescritos |
| **Alta** | Médico Veterinário | Finaliza atendimento, emite documentos, orienta o Tutor |

---

## 3. Regras de Negócio Fundamentais

### 3.1 Regra de Ouro — Tutor e Pet

> **Um Tutor pode ter vários Pets.**

- O **Tutor** é a pessoa física (dono/responsável) que possui CPF, telefone e endereço.
- O **Pet** (animal) é vinculado a um Tutor via `tutor_id` (FK obrigatória).
- Um Tutor pode trazer diferentes Pets em diferentes consultas.
- Na recepção, sempre seleciona-se primeiro o Tutor e depois o Pet que será atendido.
- Um Pet pode ser transferido para outro Tutor (adoção, venda), mas o histórico de consultas é preservado.

### 3.2 Terminologia do Domínio Veterinário

| Termo Humano (HealthMax) | Termo Veterinário (VetMax) |
|---|---|
| Paciente | Pet / Animal |
| Enfermeiro(a) | Auxiliar Veterinário |
| Médico | Médico Veterinário (MV) |
| Técnico | Técnico de Lab / Imagem |
| Prontuário | Prontuário Veterinário |
| Receituário | Receituário Veterinário (Azul para controlados) |
| Triagem | Triagem (peso + temperatura retal obrigatórios) |
| CPF | CPF do **Tutor** (não do animal) |

### 3.3 Campos Obrigatórios na Triagem Veterinária

Diferente da medicina humana, a triagem veterinária exige **obrigatoriamente**:
- `weight_kg` — Peso do animal em kg (dosagem de medicamentos depende disso)
- `temperature_rectal` — Temperatura retal em °C (sinal vital primário)

### 3.4 Species e Raças

O sistema deve suportar múltiplas espécies com validação de raças por espécie:
- `dog` — Cão
- `cat` — Gato
- `bird` — Ave
- `rabbit` — Coelho
- `rodent` — Roedor (hamster, porquinho da índia, etc.)
- `reptile` — Réptil
- `fish` — Peixe
- `exotic` — Exótico (outros)

---

## 4. Multi-tenancy

- **Toda tabela clínica tem `clinic_id`** — uma clínica nunca enxerga dados de outra.
- A RLS (Row-Level Security) do Supabase isola os dados por `clinic_id` via `get_user_clinic_id()`.
- Tutors e Pets são **por clínica** — diferente do HealthMax onde pacientes eram globais com consentimento LGPD. No VetMax, o dado do animal pertence à clínica que o cadastrou.

---

## 5. Conformidade Legal

- **Receituário Azul:** medicamentos controlados para animais exigem receituário especial (ex: Cetamina, Midazolam). O sistema deve sinalizar quando uma prescrição exige receituário azul.
- **CFMV:** O prontuário veterinário é obrigatório pelo Conselho Federal de Medicina Veterinária. `is_reviewed_by_vet = true` é a trava equivalente ao `is_reviewed_by_doctor` do HealthMax.
- **Dados do Tutor:** protegidos pela LGPD (pessoa física). Dados do animal em si não têm proteção legal equivalente, mas o sigilo profissional do CFMV se aplica ao prontuário.

---

## 6. Diretório de Skills

| Arquivo | Quando usar |
|---|---|
| `/skills/clinical_flow.md` | Qualquer tarefa de fluxo de consulta, status, filas, workspaces |
| `/skills/database.md` | Migrations, queries, schema changes, RLS |
| `/skills/ai_and_rag.md` | Integração com Claude API, transcrição de voz, sugestões diagnósticas |
| `/skills/development.md` | Padrões de código, componentes, Server Actions |

---

## 7. Estrutura de Pastas do Projeto

```
vetmax-app/
├── vetmax-docs.md          ← Este arquivo (contexto do domínio)
├── CLAUDE.md               ← Instruções para o agente Claude Code
├── AGENTS.md               ← Definição dos agentes do sistema
├── skills/                 ← Skills de domínio do projeto
├── instructions/           ← Instruções específicas de módulos
├── agents/                 ← Definições de agentes especializados
├── src/
│   ├── app/                ← Next.js App Router
│   ├── components/         ← Componentes reutilizáveis
│   ├── lib/                ← Utilitários (supabase client, actions)
│   └── types/              ← TypeScript types e interfaces
├── supabase/
│   └── migrations/         ← SQL migrations versionadas
└── scripts/                ← Scripts utilitários (migrate.js, etc.)
```
