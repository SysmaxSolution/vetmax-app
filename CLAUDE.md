# VetMax — Instruções para Claude Code (Versão Otimizada v2.0)

## Contexto do Projeto
Leia sempre `vetmax-docs.md` e `.clauderules`. 
**Segurança**: Nunca revele segredos de banco ou chaves de ambiente.
**Supabase**: Execute scripts via CLI/Admin sempre que possível usando as credenciais do `.env.local`.

## Estratégia de Economia de Tokens (Crítico)
* **Resposta Delta Estrita**: Proibido reescrever arquivos completos. Envie apenas blocos de código alterados ou `diff -u`.
* **Omissão de Código Inalterado**: Use `// ... código existente` para pular partes sem mudanças.
* **Pensamento Ultra-Conciso**: Se o `Thinking Mode` estiver ativo, limite o raciocínio a etapas lógicas diretas, sem introduções.
* **Filtragem de Logs**: Ao analisar erros, ignore avisos de `warning` ou `deprecation` não relacionados ao erro principal.
* **Contexto Seletivo**: Não analise a estrutura de pastas completa em cada turno; foque apenas nos arquivos explicitamente citados na tarefa.
* **Auto-Summarization**: A cada 5 turnos, gere um resumo de 3 linhas do progresso e solicite `/clear`.

## Regras de Desenvolvimento
1.  **Multi-tenancy**: Obrigatório `clinic_id` em toda nova tabela e cláusula `WHERE`.
2.  **Integridade Clínica**: Tutor -> Pet -> Consulta. Triagem exige `weight_kg` e `temperature_rectal`.
3.  **Legal (CFMV)**: Prontuário exige `is_reviewed_by_vet` para fechamento. Medicamentos controlados exigem sinalização de "Receituário Azul".
4.  **Database**: Migrations apenas aditivas com `IF NOT EXISTS`. Proibido `SELECT *` em tabelas operacionais.
5.  **UI/UX**: Padrão "Zero-Click". Atalhos de teclado e preenchimento por voz são prioridade.
6.  **Design System**: Toda UI segue `DESIGN_SYSTEM.md` (tokens em `globals.css` + `Skeleton`/`Spinner` compartilhados). Ação primária = teal; cor de módulo só para navegação; loading sempre com skeleton; motion 120–240ms com reduced-motion.

## Terminologia Técnica (CFMV)
- Pet/Animal (não usar "Paciente" na interface)
- Tutor (termo técnico legal, não usar "Dono")
- Médico Veterinário / MV (não usar apenas "Médico")
- Auxiliar Veterinário

## Estrutura de Pastas e Prioridades

```
src/app/                    ← App Router (pages e layouts)
src/app/(auth)/             ← Login, registro
src/app/(dashboard)/        ← Área protegida
src/app/(dashboard)/reception/   ← Módulo Recepção
src/app/(dashboard)/triage/      ← Módulo Triagem
src/app/(dashboard)/vet/         ← Módulo Médico Veterinário
src/app/(dashboard)/exams/       ← Módulo Exames
src/app/(dashboard)/pharmacy/    ← Módulo Farmácia
src/components/ui/          ← Componentes UI genéricos
src/components/tutor/       ← Componentes do Tutor
src/components/pet/         ← Componentes do Pet
src/components/consultation/ ← Componentes de Consulta
src/lib/supabase/           ← Clientes Supabase (server/client/admin)
src/lib/actions/            ← Server Actions
src/types/                  ← TypeScript interfaces
```

## Fluxo de Trabalho — Issues + PRs (obrigatório para qualquer agente/modelo)
Todo desenvolvimento segue este padrão, independente do agente ou modelo de IA utilizado:
1. **Toda tarefa nasce como Issue** no GitHub (`SysmaxSolution/vetmax-app`), classificada com label: `correcao` (bug), `melhoria` (funcionalidade existente) ou `nova-funcao` (funcionalidade nova).
2. **Todo deploy é gerenciado por PR** — a descrição do PR DEVE mencionar a Issue correspondente (`Closes #N` ou `Refs #N`).
3. **Ciclo de ambientes:**
   - Branch de trabalho a partir de `dev` → PR para `dev` → merge → deploy manual no ambiente de testes (`npx.cmd vercel --prod` de `C:\sysvetmax-dev`, projeto Vercel `sysvetmax-dev`).
   - Validação do Diretor no dev → PR `dev` → `main` → merge → push no remote `vetmax` → deploy em produção.
4. **Banco de testes**: o ambiente dev usa o Supabase `claqxwckiihknclhmzvf` (credenciais em `.env.dev.local`); NUNCA aponte testes para o banco de produção.

## Protocolo de Erro
- Cole apenas as 10 linhas relevantes do Stack Trace.
- Antes de corrigir, verifique se a falha é de permissão de RLS (Row Level Security) no Supabase.

## ☁️ Diretrizes para Rotinas Autônomas na Nuvem (Routines)
1. **Obrigatório PLAN Mode**: Ao atuar de forma autônoma via Routine, você DEVE gerar um plano de execução primeiro e cruzar com as regras de Integridade Clínica acima.
2. **Camada de Contingência**: NUNCA commite direto na main. Siga o "Fluxo de Trabalho — Issues + PRs" acima: branch a partir de `dev` + PR mencionando a Issue, para o Diretor aprovar. (A exceção da Sprint Internação+Cirúrgico de 2026-05-28 está encerrada.)
3. **Escalabilidade**: Em rotinas de Pentest ou QA, limite os testes simulados para não onerar o banco de dados de produção do Supabase.