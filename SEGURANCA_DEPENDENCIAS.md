# Vulnerabilidades de dependência — o que foi corrigido e o que foi aceito

Última revisão: **2026-10-07**. Refazer quando o `npm audit` mudar de forma.

Rodar sempre as duas, porque o número que importa é o primeiro:

```bash
npm audit --omit=dev    # o que de fato vai para o servidor
npm audit               # inclui a árvore de teste e lint
```

## Estado em 2026-10-07

| escopo | antes | depois |
|---|---|---|
| produção | 3 críticas, 5 altas, 6 moderadas | **0 críticas, 0 altas, 3 moderadas** |
| total (prod + dev) | 3 críticas, 39 altas, 7 moderadas | 0 críticas, 5 altas, 21 moderadas |

### Piso de segurança declarado no `package.json`

As faixas abaixo foram elevadas **de propósito**. A correção estava vindo só do
`package-lock.json`, e a faixa antiga permitia um `npm install` limpo resolver
de volta para uma versão vulnerável.

| pacote | piso | por quê |
|---|---|---|
| `next` | `^16.4.0` | RCE não autenticado; vulnerável até 16.3.5 |
| `sharp` | `^0.35.5` | libheif; vulnerável até 0.35.5-rc.1 |
| `@capacitor/android`, `@capacitor/ios`, `@capacitor/core` | `^8.5.2` | conteúdo remoto carregado na origem do app; vulnerável 8.0.0–8.3.4 |

Não baixar nenhuma dessas faixas sem checar o aviso correspondente.

## Exceções aceitas — com a razão, não por desistência

### `mammoth` → `argparse@1.0.10` → `sprintf-js@1.0.3` (3 moderadas, produção)

`sprintf-js` tem faixa vulnerável `*`: **não existe versão corrigida**. A única
"correção" que o npm sugere é `mammoth@0.3.29`, um downgrade de 1.12.0 — ou
seja, não há caminho para frente.

**Não é alcançável no nosso runtime.** O `argparse` é usado apenas por
`bin/mammoth` (o CLI), que nunca invocamos; usamos `mammoth` como biblioteca.
Verificado instrumentando o `require`:

```js
// argparse carregado ao importar mammoth como biblioteca: NAO
```

Se algum dia passarmos a chamar o CLI do `mammoth`, esta exceção cai.

Onde usamos: `src/lib/actions/docx-convert.ts`, `src/lib/pdf/docx-to-pdf.ts`,
`src/app/api/process-template-with-file/route.ts`,
`src/components/management/ImportTemplateModal.tsx`.

### `node-forge` (1 alta, produção) — só no ramo de integração

Aviso: *RSA PKCS#1 v1.5 signature verification accepts extra nested
DigestAlgorithm elements* (GHSA-86w9-cpqp-85rv). Faixa vulnerável `*`,
`fixAvailable: false` — **não existe versão corrigida**.

**Não é alcançável.** Usamos `node-forge` em um único arquivo,
`src/lib/integrations/bank-certificate.ts`, para ler o `.pfx` do e-CNPJ A1 que
as certificadoras brasileiras entregam em RC2-40 e reexportá-lo em AES-256
(o Node recusa o RC2-40 com `ERR_CRYPTO_UNSUPPORTED_OPERATION`).

As únicas APIs chamadas são:

```
forge.asn1.fromDer / toDer
forge.pkcs12.Bag / pkcs12FromAsn1 / toPkcs12Asn1
forge.pki.Certificate / pki.oids.{certBag,keyBag,pkcs8ShroudedKeyBag}
forge.util.createBuffer
```

Nenhuma verificação de assinatura (`publicKey.verify`, `pki.rsa.verify`) é
chamada em lugar nenhum. O selo de integridade do PKCS#12 é HMAC, código
diferente do da assinatura RSA citada no aviso. E o `.pfx` chega da própria
clínica, não de fonte não confiável.

Se algum dia usarmos `node-forge` para verificar assinatura — na assinatura
digital ICP-Brasil do laudo, por exemplo — **esta exceção cai** e o caminho
tem de ser outro (`node:crypto` ou biblioteca específica de ICP-Brasil).

### `braces` / `micromatch` / `fast-glob` (5 altas, só dev)

Também faixa `*` ou `>=0.2.0` — **sem versão corrigida publicada**. Nenhum
`overrides` resolve. Chegam por `eslint-config-next → @next/eslint-plugin-next
→ fast-glob`, que roda **em tempo de lint**, nunca no servidor e nem na suíte
de testes. Removê-las significaria abandonar o `eslint-config-next`, o que não
se justifica por um DoS de lint.

### Árvore do Jest (moderadas, só dev)

`js-yaml@3` e `argparse@1` chegam por `@istanbuljs/load-nyc-config` (carregador
de config de cobertura). Existe versão corrigida de cada um, mas forçar
`js-yaml` 3 → 5 quebra a API que o istanbul espera — risco real, benefício
zero em produção. O Jest já foi para a 30, que foi o que derrubou 32 altas.

## Revisão de 2026-10-09 — os 2 alertas do Dependabot

O Dependabot acusa 2 abertos na branch padrão. Nenhum dos dois tem correção
aplicável; segue a evidência medida, não presumida.

**`node-forge` 1.4.0 — ALTA, sem versão corrigida.** O aviso é
*"RSA PKCS#1 v1.5 signature verification accepts extra data"*. `npm view
node-forge versions` mostra que **1.4.0 é a última publicada** — não existe
release com o patch, então não há para onde subir. E o caminho vulnerável não é
o nosso: o único arquivo que importa node-forge é
`src/lib/integrations/bank-certificate.ts`, e ele chama apenas
`pkcs12.pkcs12FromAsn1` e `pkcs12.toPkcs12Asn1` — leitura e reescrita de
PKCS#12 para normalizar o `.pfx` do Sicoob (RC2-40 → AES-256). Não chamamos
verificação de assinatura em lugar nenhum. Verificado por varredura em `src/`.

Também não dá para tirar do runtime: o arquivo é código de aplicação (a clínica
sobe o certificado pela tela), então mover para `devDependencies` quebraria
produção. Fica aceito e vigiado — **reavaliar quando sair node-forge > 1.4.0**,
que é a mesma janela do vencimento do certificado Sicoob em 11/12/2026.

**`sprintf-js` 1.0.3 — MODERADA, correção = regressão maior.** Chega por dois
caminhos, ambos via `argparse` 1.0.10: `mammoth` → `argparse` (runtime, import
de `.docx`) e `ts-jest` → `js-yaml` 3 → `argparse` (só teste). O `npm audit`
oferece como conserto `mammoth@0.3.29` — de 1.13.0 para 0.3.x, dez anos de
regressão na única biblioteca que lê `.docx`. Recusado pelo mesmo critério da
cadeia mammoth já documentada acima.

**`handlebars` 4.7.9 — CRÍTICA que NÃO é de produção.** O `npm audit` completo
acusa, mas a cadeia é `@capacitor/assets` → `@trapezedev/project` →
`conventional-changelog` → `handlebars`: devDependency de geração de ícones
mobile, nunca empacotada. `npm audit --omit=dev` não a lista.

**Piso medido em 2026-10-09** — `npm audit --omit=dev` (o que realmente vai a
produção): **1 alta + 3 moderadas**, sendo a alta o node-forge acima e as
moderadas a cadeia mammoth/argparse. Zero críticas.

## Histórico

- **2026-10-07** — `next` 16.2.12 → 16.4.0 (3 críticas), `sharp` → 0.35.5,
  Capacitor → 8.5.2 (2 críticas), `@xmldom/xmldom` → 0.8.15, `nanoid` → 3.3.20,
  `source-map-js` → 1.2.2, `dompurify` → 3.4.16, `moment` → 2.31.0,
  `fflate` → 0.8.3, `csv-parse` 5 → 7.0.3, Jest 29 → 30.
  Também: `tests/` saiu do `tsconfig.json` do app (ver abaixo).

## Nota: `tsconfig.json` × `tsconfig.test.json`

O `tsconfig.json` do app agora **exclui `tests/`**. Antes o `include` de
`**/*.ts` jogava todos os testes no mesmo programa TypeScript, e arquivos de
teste sem `import`/`export` são *script*, não módulo — então funções de mesmo
nome em testes diferentes colidiam no escopo global
(`TS2393: Duplicate function implementation`). Com o `next` 16.4.0 isso passou
a **falhar o build** em vez de ser tolerado.

Os testes continuam checados pelo `tsconfig.test.json`, que tem `strict: false`
e os 188 arquivos de `tests/`. Atenção: `exclude` é **herdado** pelo `extends`,
então o `tsconfig.test.json` precisa sobrescrever `exclude` — sem isso o
`include` de `tests/**` seria filtrado e os testes deixariam de ser checados.
