#!/usr/bin/env node
// PreToolUse / Bash -- nenhum push sai com tsc sujo.
// O tsc incremental mascara erro cross-file, por isso o cache (.tsbuildinfo) e
// descartado antes da checagem.
// Usa tsconfig.gate.json, que exclui .next/ (tipos gerados: um .next de outra
// branch acusa modulo inexistente) e tests/ (divida TS2393 pre-existente).
//   ! touch .claude/.skip-tsc-gate   (vale 60 minutos)
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readPayload, invokesGit, sentinelFresh } from "./_lib.mjs";

const SKIP = ".claude/.skip-tsc-gate";
const WINDOW_MIN = 60;
const TSC = "node_modules/typescript/bin/tsc";
const PROJECT = "tsconfig.gate.json";

const cmd = (await readPayload())?.tool_input?.command ?? "";
if (!cmd || !invokesGit(cmd, "push")) process.exit(0);

if (await sentinelFresh(SKIP, WINDOW_MIN)) {
  process.stderr.write("Gate de tsc dispensado pela sentinela.\n");
  process.exit(0);
}
if (!existsSync(TSC) || !existsSync(PROJECT)) {
  process.stderr.write("Gate de tsc ignorado: tsc ou tsconfig.gate.json ausente.\n");
  process.exit(0);
}

for (const f of ["tsconfig.tsbuildinfo", ".tsbuildinfo", "tsconfig.gate.tsbuildinfo"]) {
  try {
    rmSync(f, { force: true });
  } catch {}
}

const r = spawnSync(process.execPath, [TSC, "--noEmit", "-p", PROJECT], {
  encoding: "utf8",
});
if (r.status === 0) process.exit(0);

const generated = /^\.next[\/]/;
const errors = `${r.stdout ?? ""}${r.stderr ?? ""}`
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /error TS/.test(l))
  .filter((l) => !generated.test(l));

if (errors.length === 0) {
  process.stderr.write("Gate de tsc: nenhum erro em codigo fonte. Liberado.\n");
  process.exit(0);
}

const bruta = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error?.message ?? ""}`;
process.stderr.write(
  [
    "BLOQUEADO: push com tsc sujo. Corrija os erros de tipo antes de publicar.",
    "(cache .tsbuildinfo descartado -- estes erros sao reais, nao residuais)",
    "",
    errors.slice(0, 10).join("\n") ||
      `tsc status ${r.status}. Saida bruta: ${bruta.slice(0, 1000)}`,
    "",
  ].join("\n")
);
process.exit(2);
