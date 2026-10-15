# Hooks do Claude Code — VetMax

As regras do `CLAUDE.md` são orientação que o agente interpreta. As que não podem
falhar estão aqui, como código. Instrução em prompt é sugestão; `exit 2` é contrato.

Registrados em `.claude/settings.json` (versionado — vale para toda a equipe).

## Por que Node e não bash + jq

`jq` **não está instalado nesta máquina**. Todo exemplo de hook que circula por aí
usa `jq` para ler o payload do stdin e falharia silenciosamente aqui. Os guardas são
Node puro: um processo, sem dependência externa, mesmo comportamento em Git Bash,
PowerShell e CI.

## Por que `_lib.mjs` existe

O payload do hook traz a **linha de comando inteira, heredoc incluído**. Na primeira
execução real, um `git commit` cuja *mensagem* mencionava "git push" e "--force" foi
bloqueado pelo `guard-main-push`: o guarda reagia à menção, não à ação.

`_lib.mjs` resolve a causa:

- `execPart(cmd)` — devolve só o trecho executável, cortando no primeiro heredoc
- `invokesGit(cmd, verb)` — exige `git <verb>` em **posição de comando** (início de
  linha, `;`, `&&`, `||`, `|`, ou após prefixo `VAR=valor`), então `echo git push`
  e texto de mensagem não disparam nada
- `sentinelFresh(path, min)` — janela de validade das sentinelas
- `readPayload()` — payload ilegível nunca bloqueia o fluxo

## Por que nenhum usa o campo `if`

O campo `if` filtra por sintaxe de regra de permissão, que casa por **prefixo**.
`if: "Bash(git add *)"` não casaria `cd /c/SysMax && git add -A` — exatamente a forma
do comando que já causou incidente. Cada script faz a própria triagem por regex em
qualquer posição da linha e retorna em ~50 ms quando não se aplica.

## Os guardas

| Script | Evento | Bloqueia | Origem |
|---|---|---|---|
| `guard-git-add.mjs` | PreToolUse/Bash | `git add -A`, `git add .`, `--all` | `git add -A` levou ~35k arquivos, com segredos, ao stage |
| `guard-staged-secrets.mjs` | PreToolUse/Bash | commit com chave Anthropic, JWT Supabase, token GitHub, chave AWS, chave privada, connection string com senha | par do anterior: pega o segredo que passou em arquivo legítimo |
| `guard-main-push.mjs` | PreToolUse/Bash | push para `main`/`master` e qualquer `--force` | push na main exige OK explícito do Diretor |
| `guard-tsc-before-push.mjs` | PreToolUse/Bash | push com erro de tipo em código fonte | o tsc incremental mascara erro cross-file; o cache é descartado antes de medir |
| `guard-use-server-types.mjs` | PostToolUse/Write\|Edit | `export type`/`export interface` em arquivo `'use server'` | derruba a server action com 500 em runtime, sem erro de compilação |
| hook `prompt` (Haiku 4.5) | PostToolUse/Write\|Edit | query nova sem `clinic_id`; `SELECT *` em tabela operacional | regra de multi-tenancy é semântica — regex não resolve |

Infraestrutura: `_lib.mjs` (utilitários) e `test-guards.sh` (suite de regressão).

Três falhas encontradas em uso real, corrigidas e cobertas por teste — ficam
registradas porque cada uma é uma classe de erro, não um caso isolado:

1. **Falso positivo — padrão fraco.** `/service_role/i` acusava a simples *menção*
   da palavra, que aparece em código legítimo. A chave real é um JWT (coberta pelo
   padrão de JWT) e a forma `SERVICE_ROLE_KEY=<valor>` pelo padrão de atribuição.
   O padrão isolado foi removido sem perda de cobertura.
2. **Falso positivo — menção vs. ação.** Um `git commit` cuja mensagem citava as
   operações protegidas era bloqueado. Resolvido por `execPart`/`invokesGit`.
3. **Falso NEGATIVO — envelope de comando.** `time (git push ...)` passou por um
   push real **sem acionar o gate**: `(` não contava como separador e o `)` de
   fechamento colava no nome do branch (`main)` não casava `/^main$/`). O mais
   grave dos três, porque falha em silêncio. Resolvido ampliando separadores e
   terminadores; seis casos de envelope entraram na suite.

## Sentinelas de escape

Concessões temporárias. **Só o Diretor cria**, no terminal, com o prefixo `!`.
O agente nunca cria sentinela por conta própria — isso anularia a guarda.

```
! touch .claude/.allow-main-push      # 60 min
! touch .claude/.allow-secret-commit  # 15 min
! touch .claude/.skip-tsc-gate        # 60 min
```

Todas em `.gitignore`.

## tsconfig.gate.json

O gate de tipos usa `tsconfig.gate.json` (raiz), que herda o `tsconfig.json` e
exclui:

- **`.next/`** — tipos gerados pelo build. Um `.next` produzido em outra branch
  acusa "Cannot find module .../page.js" para páginas que não existem na branch
  atual. É artefato, não defeito.
- **`tests/`** — dívida pré-existente de `TS2393 Duplicate function implementation`
  (arquivos de teste tratados como escopo global). Os testes têm ciclo próprio via
  `qa-agent`. **Pendência aberta**, não decisão definitiva.

## Verificar

```bash
# cada guarda isolado, com payload sintético
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git add -A"}}' \
  | node .claude/hooks/guard-git-add.mjs; echo "exit=$?"   # espera 2
```

## Estado de validação

| Guarda | Suite | Provado ativo em sessão real |
|---|---|---|
| `guard-git-add` | ✅ 8 casos | ✅ bloqueou `git add --all --dry-run` |
| `guard-staged-secrets` | ✅ 2 casos + 4 de padrão | ✅ bloqueou um commit (falso positivo que originou a correção nº 1) |
| `guard-main-push` | ✅ 13 casos | ✅ bloqueou um commit (falso positivo nº 2) |
| `guard-use-server-types` | ✅ 3 casos | ✅ via payload sintético |
| `guard-tsc-before-push` | ✅ triagem | ⚠️ **não provado em sessão** — ver abaixo |
| hook `prompt` (multi-tenancy) | — | ⚠️ não exercitado |

### Pendência: validar o gate de tsc

O gate **funciona** quando invocado direto: 1m27s, descarta o cache e reporta erro
real de código fonte (verificado). O que não foi possível provar nesta sessão é que
o Claude Code o **invoca** num push — ele não registrou execução.

Causa: o `settings.json` nasceu durante a sessão, e o watcher de configuração só
observa diretórios que já tinham arquivo de settings quando a sessão começou. O que
está em vigor é a versão capturada na primeira detecção; edições posteriores (mover
o hook para grupo próprio, reduzir o timeout de 420 para 300) não tiveram efeito.

**Para validar**, numa sessão nova (ou após abrir `/hooks` uma vez):

```bash
git push --dry-run <remote> <sua-branch>
```

Deve levar ~90 s em vez de ~3 s. Se continuar instantâneo, o gate não está sendo
invocado — suspeite primeiro do `timeout` (era 420 s; reduzido para 300 s) e tente
200 s.
