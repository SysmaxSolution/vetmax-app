#!/usr/bin/env node
// PreToolUse / Bash -- push na main (ou --force em qualquer branch) exige
// autorizacao explicita do Diretor.
//   ! touch .claude/.allow-main-push     (vale 60 minutos)
import { execFileSync } from "node:child_process";
import { readPayload, execPart, invokesGit, sentinelFresh } from "./_lib.mjs";

const SENTINEL = ".claude/.allow-main-push";
const WINDOW_MIN = 60;
const PROTECTED = /^(main|master)$/;

const cmd = (await readPayload())?.tool_input?.command ?? "";
if (!cmd || !invokesGit(cmd, "push")) process.exit(0);

const exec = execPart(cmd);
const forced = /\s(--force|--force-with-lease|-f)(\s|$)/.test(exec);

// Separa tambem por parenteses, chaves e aspas: em `time (git push vetmax main)`
// o `)` colaria no nome do branch e `main)` nao casaria a lista de protegidas.
const after = exec.split(/git\s+push\s*/)[1] ?? "";
const tokens = after
  .split(/[\s;&|(){}'"]+/)
  .filter((t) => t && !t.startsWith("-"));

let target = null;
if (tokens.length >= 2) {
  target = tokens[1].includes(":") ? tokens[1].split(":").pop() : tokens[1];
} else {
  try {
    target = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {}
}

const hitsProtected = target
  ? PROTECTED.test(target.replace(/^refs\/heads\//, ""))
  : false;
if (!hitsProtected && !forced) process.exit(0);

if (await sentinelFresh(SENTINEL, WINDOW_MIN)) {
  process.stderr.write("Autorizacao de push encontrada. Liberado.\n");
  process.exit(0);
}

process.stderr.write(
  `BLOQUEADO: ${hitsProtected ? `push para a branch protegida "${target}"` : "push com --force"}` +
    " exige autorizacao explicita do Diretor.\n" +
    "Fluxo correto (CLAUDE.md): branch a partir de dev -> PR mencionando a Issue.\n" +
    "Se o Diretor autorizou nesta conversa, ele deve rodar no terminal:\n" +
    "  ! touch .claude/.allow-main-push\n" +
    `Vale ${WINDOW_MIN} minutos. O agente nao cria a sentinela por conta propria.\n`
);
process.exit(2);
