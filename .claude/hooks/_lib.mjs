// Utilitarios comuns aos guardas.
//
// Por que `execPart` existe: o payload do hook traz a linha de comando inteira,
// heredoc incluido. Um `git commit` cujo texto MENCIONA "git push" ou "--force"
// fazia os guardas reagirem a mencao, nao a acao. Analisar so a parte executavel
// resolve a causa.

/** Le o JSON do stdin. Payload ilegivel nunca bloqueia o fluxo. */
export function readPayload() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

/** Trecho executavel do comando: tudo antes do primeiro heredoc. */
export function execPart(cmd) {
  if (!cmd) return "";
  const i = cmd.search(/<<-?\s*['"]?[A-Za-z_]\w*['"]?/);
  return i >= 0 ? cmd.slice(0, i) : cmd;
}

/**
 * O comando invoca `git <verb>` em posicao de comando?
 *
 * Separadores cobertos: inicio, nova linha, `;`, `|`, `&`, `(` e `{`.
 * O parentese entrou depois de um falso NEGATIVO real: `time (git push ...)` nao
 * acionava o gate porque `(` nao estava na classe. Em guarda de seguranca, falso
 * negativo e pior que falso positivo -- ele passa calado.
 *
 * Prefixos tolerados antes do `git`: atribuicao de variavel de ambiente e os
 * envelopes comuns (`time`, `sudo`, `nohup`, `env`, `command`, `exec`).
 */
export function invokesGit(cmd, verb) {
  const re = new RegExp(
    String.raw`(?:^|[\n;|&({])\s*` +
      String.raw`(?:(?:[A-Za-z_]\w*=\S*|time|sudo|nohup|env|command|exec)\s+)*` +
      String.raw`git\s+(?:-[^\s]+\s+)*` +
      verb +
      String.raw`\b`
  );
  return re.test(execPart(cmd));
}

/** Sentinela de autorizacao valida dentro da janela, em minutos. */
export async function sentinelFresh(path, windowMin) {
  const { existsSync, statSync } = await import("node:fs");
  if (!existsSync(path)) return false;
  return (Date.now() - statSync(path).mtimeMs) / 60000 <= windowMin;
}
