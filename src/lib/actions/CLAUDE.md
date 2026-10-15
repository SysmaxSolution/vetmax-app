# Server Actions — regras do modulo

Detalhamento das regras 1 e 4 do `CLAUDE.md` da raiz, aplicadas a este diretorio.

## Multi-tenancy (regra 1)

Toda consulta a tabela de dados de clinica filtra `clinic_id`:

```ts
.eq('clinic_id', clinicId)
```

Excecoes legitimas — nao sao defeito:
- catalogos globais: `cbhpm`, `ncm`, `cid`, `species`, `breeds`, planos, precos padrao
- consultas da conta de suporte super-admin
- `invoice_items`, que **nao tem `clinic_id` por desenho**: isole por `invoice_id`
  com `join invoices!inner`. **Nao adicione `clinic_id` a ela** — isso quebra o
  cache de schema do PostgREST.

## Proibido `SELECT *` em tabela operacional (regra 4)

Liste as colunas. `select('*')` conta como violacao. Aceitavel em count/exists e
em catalogo.

## `'use server'` nao exporta tipo

Um `export type` ou `export interface` em arquivo com `'use server'` faz a action
responder **500 em runtime, sem erro de compilacao**. Tipos vao para modulo puro
(`src/types/*.ts`) e sao importados aqui.

Um hook `PostToolUse` bloqueia isso automaticamente — ver `.claude/hooks/`.

## Toda action tem `try/finally`

Sem `finally`, um skew de deploy (build antigo rejeitando a action nova) deixa o
cliente com spinner eterno. O `finally` libera o estado de carregamento mesmo
quando a action e rejeitada antes de executar.

## Preco e snapshot imutavel

A hierarquia e `custom_price` -> `default_price` -> fallback. Ao gravar em
`consultation_services`, grave o valor resolvido como snapshot: alteracao de
tabela de preco nao pode reescrever historico ja faturado.
