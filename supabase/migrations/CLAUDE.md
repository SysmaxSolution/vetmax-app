# Migrations — regras do modulo

Detalhamento da regra 4 do `CLAUDE.md` da raiz.

## Apenas aditivo, sempre idempotente

```sql
CREATE TABLE IF NOT EXISTS ...
ALTER TABLE x ADD COLUMN IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
CREATE OR REPLACE FUNCTION ...
```

Proibido: `DROP`, `ALTER COLUMN` que estreite tipo, renomear coluna em uso.
Para substituir uma coluna: adicione a nova, faca backfill, troque a leitura,
e deixe a antiga morrer em outra migration, depois do deploy.

## Numeracao sequencial sem lacuna

Confira o maior prefixo existente neste diretorio antes de nomear. O repositorio
ja foi saneado de 18 prefixos duplicados, 2 anomalias e 79 migrations orfas
(2026-06-03). Nao reintroduza o problema.

## RLS junto da tabela

A policy de RLS vai **na mesma migration** que cria a tabela, nunca em arquivo
separado — tabela sem policy e vazamento entre clinicas esperando acontecer.
Toda tabela nova de dados de clinica tem `clinic_id` e policy correspondente.

## Antes de culpar o codigo

Falha de acesso a dado quase sempre e RLS, nao logica. Verifique a policy antes
de alterar a query.

## Aplicacao

Migration criada e aplicada no Supabase remoto no mesmo passo, sem aguardar
confirmacao. Ambiente de testes: `claqxwckiihknclhmzvf` (`.env.dev.local`).
Nunca aponte teste para producao.
