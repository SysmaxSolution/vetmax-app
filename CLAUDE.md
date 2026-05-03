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

## Protocolo de Erro
- Cole apenas as 10 linhas relevantes do Stack Trace.
- Antes de corrigir, verifique se a falha é de permissão de RLS (Row Level Security) no Supabase.

## ☁️ Diretrizes para Rotinas Autônomas na Nuvem (Routines)
1. **Obrigatório PLAN Mode**: Ao atuar de forma autônoma via Routine, você DEVE gerar um plano de execução primeiro e cruzar com as regras de Integridade Clínica acima.
2. **Camada de Contingência**: NUNCA commite direto na main. Toda correção autônoma deve ser feita em uma branch `fix/` ou `feature/` e um PR deve ser aberto para o Diretor aprovar.
3. **Escalabilidade**: Em rotinas de Pentest ou QA, limite os testes simulados para não onerar o banco de dados de produção do Supabase.