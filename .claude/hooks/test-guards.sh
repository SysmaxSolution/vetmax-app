#!/usr/bin/env bash
# Suite de regressao dos guardas. Rode da raiz do repositorio:
#   bash .claude/hooks/test-guards.sh
#
# Precisa ser arquivo, nao comando inline: os payloads contem os proprios
# padroes que os guardas detectam, e um comando inline seria bloqueado por eles.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

PASS=0
FAIL=0

# chk <script> <comando> <exit esperado> <descricao>
chk() {
  local script="$1" cmd="$2" want="$3" desc="$4"
  local payload
  payload=$(CMD="$cmd" node -e 'process.stdout.write(JSON.stringify({tool_name:"Bash",tool_input:{command:process.env.CMD}}))')
  printf '%s' "$payload" | node ".claude/hooks/$script" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1)); printf '  ok    %s\n' "$desc"
  else
    FAIL=$((FAIL + 1)); printf '  FALHA %s (exit=%s, esperado=%s)\n' "$desc" "$got" "$want"
  fi
}

# chkf <script> <file_path> <exit esperado> <descricao>  -- hooks de Write|Edit
chkf() {
  local script="$1" fp="$2" want="$3" desc="$4"
  local payload
  payload=$(FP="$fp" node -e 'process.stdout.write(JSON.stringify({tool_name:"Edit",tool_input:{file_path:process.env.FP}}))')
  printf '%s' "$payload" | node ".claude/hooks/$script" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1)); printf '  ok    %s\n' "$desc"
  else
    FAIL=$((FAIL + 1)); printf '  FALHA %s (exit=%s, esperado=%s)\n' "$desc" "$got" "$want"
  fi
}

# Monta os literais em tempo de execucao para que este arquivo possa ser lido
# e editado sem que os guardas reajam ao seu proprio conteudo.
ADD="git ""add"
PUSH="git ""push"
COMMIT="git ""commit"
HD="<<'EOF'"

echo "guard-git-add"
chk guard-git-add.mjs "$ADD -A"                           2 "bloqueia -A"
chk guard-git-add.mjs "$ADD ."                            2 "bloqueia ponto"
chk guard-git-add.mjs "$ADD --all"                        2 "bloqueia --all"
chk guard-git-add.mjs "cd /x && $ADD -A"                  2 "bloqueia em comando composto"
chk guard-git-add.mjs "$ADD src/a.ts"                     0 "permite stage seletivo"
chk guard-git-add.mjs "$ADD ./src/a.ts"                   0 "permite caminho com ./"
chk guard-git-add.mjs "$COMMIT -F - $HD
texto citando $ADD -A
EOF"                                                       0 "ignora mencao dentro de heredoc"
chk guard-git-add.mjs "echo $ADD -A"                      0 "ignora dentro de echo"

echo "guard-main-push"
chk guard-main-push.mjs "$PUSH vetmax main"               2 "bloqueia main"
chk guard-main-push.mjs "$PUSH origin master"             2 "bloqueia master"
chk guard-main-push.mjs "$PUSH vetmax HEAD:main"          2 "bloqueia refspec para main"
chk guard-main-push.mjs "$PUSH -f vetmax dev"             2 "bloqueia --force"
chk guard-main-push.mjs "$PUSH vetmax dev"                0 "permite dev"
chk guard-main-push.mjs "$COMMIT -F - $HD
guard-main-push: push na main e --force exigem OK
EOF"                                                       0 "ignora mencao dentro de heredoc"
chk guard-main-push.mjs "echo $PUSH origin main"          0 "ignora dentro de echo"

echo "guard-staged-secrets (triagem)"
chk guard-staged-secrets.mjs "git status"                 0 "nao dispara fora de commit"
chk guard-staged-secrets.mjs "echo $COMMIT"               0 "ignora dentro de echo"

echo "guard-tsc-before-push (triagem; nao roda o tsc)"
chk guard-tsc-before-push.mjs "git status"                0 "nao dispara fora de push"
chk guard-tsc-before-push.mjs "$COMMIT -m 'cita push'"    0 "nao dispara em commit que cita push"

echo "guard-use-server-types"
T=".claude/hooks/_fixtures"
mkdir -p "$T"
printf "'use server'\n\nexport type Foo = { a: string }\nexport async function bar() {}\n" > "$T/bad.ts"
printf "'use server'\n\nimport type { Foo } from '@/types/foo'\nexport async function bar() {}\n" > "$T/good.ts"
printf "export type Foo = { a: string }\n" > "$T/plain.ts"
chkf guard-use-server-types.mjs "$T/bad.ts"               2 "bloqueia export type em 'use server'"
chkf guard-use-server-types.mjs "$T/good.ts"              0 "permite import type"
chkf guard-use-server-types.mjs "$T/plain.ts"             0 "ignora arquivo sem 'use server'"
rm -rf "$T"

echo
echo "$PASS passou, $FAIL falhou"
[ "$FAIL" = 0 ] || exit 1
