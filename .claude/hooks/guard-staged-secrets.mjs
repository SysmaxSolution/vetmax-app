#!/usr/bin/env node
// PreToolUse / Bash -- varre a staging area antes de permitir o commit.
// Par do guard-git-add: o stage seletivo evita o acidente em massa, esta guarda
// pega o segredo que passou por descuido dentro de um arquivo legitimo.
//   ! touch .claude/.allow-secret-commit   (vale 15 minutos)
import { spawnSync } from "node:child_process";
import { readPayload, invokesGit, sentinelFresh } from "./_lib.mjs";

const SKIP = ".claude/.allow-secret-commit";
const WINDOW_MIN = 15;

// A mencao da palavra "service_role" NAO e segredo: aparece em codigo legitimo e
// neste proprio arquivo. A chave service_role real e um JWT, coberta pelo padrao
// de JWT; a forma `SERVICE_ROLE_KEY=<valor>` pelo padrao de atribuicao.
const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "chave da API Anthropic"],
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}/, "JWT (provavel chave Supabase)"],
  [/AKIA[0-9A-Z]{16}/, "access key da AWS"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "chave privada"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "token do GitHub"],
  [/postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/, "connection string com senha"],
  [
    /(SERVICE_ROLE_KEY|ANON_KEY|API_KEY|APIKEY|SECRET|PASSWORD|SENHA)\s*[:=]\s*["']?[A-Za-z0-9@#!$%^&*_+\-\/]{8,}/i,
    "credencial atribuida em texto",
  ],
];

// Arquivos cujo proposito e mostrar o formato, sem valor real.
const BENIGN_PATH = /(\.env\.example|\.env\.sample|\.example\.|_EXAMPLE|package-lock\.json)/i;
// Placeholder obvio nao e segredo.
const PLACEHOLDER = /(your[_-]?|placeholder|example|changeme|xxxx+|\.\.\.|<[a-z_]+>|\$\{)/i;

const cmd = (await readPayload())?.tool_input?.command ?? "";
if (!cmd || !invokesGit(cmd, "commit")) process.exit(0);

if (await sentinelFresh(SKIP, WINDOW_MIN)) {
  process.stderr.write("Varredura de segredos dispensada pela sentinela.\n");
  process.exit(0);
}

const d = spawnSync("git", ["diff", "--cached", "--unified=0"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (d.status !== 0) process.exit(0); // sem repo ou sem stage: nao bloqueia

const hits = [];
let file = "";
for (const line of (d.stdout ?? "").split("\n")) {
  const m = /^\+\+\+ b\/(.*)$/.exec(line);
  if (m) {
    file = m[1];
    continue;
  }
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  if (BENIGN_PATH.test(file)) continue;

  const body = line.slice(1);
  if (PLACEHOLDER.test(body)) continue;

  for (const [re, label] of PATTERNS) {
    if (re.test(body)) {
      hits.push({ file, label, snippet: body.trim().slice(0, 90) });
      break;
    }
  }
}

if (hits.length === 0) process.exit(0);

const seen = new Set();
const uniq = hits.filter((h) => {
  const k = `${h.file}|${h.label}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

process.stderr.write(
  [
    "BLOQUEADO: a staging area contem o que parece ser segredo.",
    "",
    ...uniq.slice(0, 8).map((h) => `  ${h.file}\n    ${h.label}: ${h.snippet}`),
    "",
    "Retire o arquivo do stage (git restore --staged <arquivo>), mova o valor para",
    "variavel de ambiente e confirme que o .gitignore cobre o arquivo.",
    "Se for falso positivo, o Diretor autoriza com:",
    "  ! touch .claude/.allow-secret-commit",
    "",
  ].join("\n")
);
process.exit(2);
