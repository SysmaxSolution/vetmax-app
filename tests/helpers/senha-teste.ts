// Senha dos usuários de teste — fora do repositório.
//
// Por quê: `tests/fixtures/test-data.json` é versionado, e a senha dos seis
// usuários de fixture ficava literal lá dentro. Essa senha abre o ambiente de
// TESTES, cujo banco é um dump de produção: tem CPF, endereço e telefone de
// tutores reais da clínica. Credencial de acesso a PII real não pertence ao
// controle de versão, nem em repositório privado.
//
// Fail-closed de propósito: sem a variável, a suíte para com instrução em vez
// de cair num padrão que viraria a nova senha versionada.

/** Onde a senha é lida. Fica em `.env.local`, que é gitignored. */
export const VAR_SENHA = 'TEST_USER_PASSWORD'

const INSTRUCAO =
  `[testes] ${VAR_SENHA} não está definida.\n` +
  `Defina em C:\\sysvetmax-dev\\.env.local (gitignored), por exemplo:\n` +
  `  ${VAR_SENHA}=<uma senha forte sua>\n` +
  `O seed usa essa variável para criar/atualizar os usuários de fixture, e os\n` +
  `testes de interface usam a mesma para entrar. A senha precisa passar na\n` +
  `política do Supabase (mín. 8 caracteres e não constar em vazamentos).`

export function senhaDeTeste(): string {
  const s = process.env[VAR_SENHA]
  if (!s || !s.trim()) throw new Error(INSTRUCAO)
  return s
}
