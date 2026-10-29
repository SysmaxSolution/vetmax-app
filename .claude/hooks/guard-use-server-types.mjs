#!/usr/bin/env node
// PostToolUse / Write|Edit -- em arquivo 'use server', exportar tipo quebra a
// server action em runtime (500 na action, sem erro de compilacao).
// Tipos pertencem a modulo puro, nunca ao arquivo de actions.
import { existsSync, readFileSync } from "node:fs";
import { readPayload } from "./_lib.mjs";

const j = await readPayload();
const p = j?.tool_input?.file_path ?? j?.tool_response?.filePath;
if (!p || !/\.(ts|tsx)$/.test(p) || !existsSync(p)) process.exit(0);

let src = "";
try {
  src = readFileSync(p, "utf8");
} catch {
  process.exit(0);
}

// A diretiva vale apenas no topo do arquivo.
const head = src.split("\n").slice(0, 10).join("\n");
if (!/^\s*['"]use server['"]\s*;?/m.test(head)) process.exit(0);

const offenders = src
  .split("\n")
  .map((line, i) => ({ line: line.trim(), n: i + 1 }))
  .filter(({ line }) => /^export\s+(type|interface)\s/.test(line));

if (offenders.length === 0) process.exit(0);

process.stderr.write(
  [
    `BLOQUEADO: ${p} declara 'use server' e exporta tipo(s).`,
    "Em runtime isso faz a server action responder 500 sem erro de compilacao.",
    "",
    ...offenders.slice(0, 5).map((o) => `  linha ${o.n}: ${o.line}`),
    "",
    "Mova os tipos para um modulo puro (ex: src/types/*.ts) e importe-os aqui.",
    "",
  ].join("\n")
);
process.exit(2);
