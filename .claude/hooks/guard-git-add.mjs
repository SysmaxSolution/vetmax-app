#!/usr/bin/env node
// PreToolUse / Bash -- bloqueia staging em massa.
// Incidente de origem: `git add -A` levou ~35k arquivos (com segredos) para a
// staging area. Neste repositorio o stage e sempre seletivo.
import { readPayload, execPart, invokesGit } from "./_lib.mjs";

const cmd = (await readPayload())?.tool_input?.command ?? "";
if (!cmd || !invokesGit(cmd, "add")) process.exit(0);

// -A / -Av / --all / . / -- .  entre os argumentos do `git add`
const MASS = /git\s+add\s+(?:[^\n;&|]*\s)?(?:-[A-Za-z]*A[A-Za-z]*|--all|--\s+\.|\.)(?:\s|$)/;
if (!MASS.test(execPart(cmd))) process.exit(0);

process.stderr.write(
  "BLOQUEADO: staging em massa proibido neste repositorio.\n" +
    "Motivo: `git add -A` / `git add .` ja levou ~35k arquivos, incluindo segredos.\n" +
    "Faca stage seletivo, caminho por caminho:\n" +
    "  git add src/app/.../arquivo.ts\n"
);
process.exit(2);
