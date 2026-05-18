# Gotenberg para VetMax — Deploy Fly.io GRU

Microserviço HTTP que converte DOCX → PDF via LibreOffice headless. Usado
pela última milha do motor docx-native (`src/lib/docx/gotenberg.ts`).

**Por que Fly.io GRU?** Latência baixa para clínicas BR + LGPD-compliant
(São Paulo, dados não atravessam fronteira). Custo estimado: **~US$ 12/mês**
(shared-cpu-1x, 1 GB RAM, always-on).

**Por que always-on?** Cold-start do LibreOffice (~5–10 s) inviabiliza
geração ad-hoc de receita médica. `auto_stop_machines = "off"` + `min_machines_running = 1`
mantém a máquina viva 24/7. Não use volume persistente — Gotenberg é stateless.

---

## Pré-requisitos

```powershell
# Instalar Fly CLI (Windows)
iwr https://fly.io/install.ps1 -useb | iex

# Autenticar (abre browser uma vez)
fly auth login
```

## Deploy inicial (uma vez)

```powershell
cd infra\gotenberg

# 1. Cria o app no Fly mas NÃO faz deploy ainda (aceitamos o fly.toml atual)
#    --copy-config: usa o fly.toml deste diretório
#    --name: define o app remoto; precisa ser único globalmente
#    --region gru: São Paulo (LGPD)
#    --no-deploy: só registra; deploy é o próximo passo
fly launch --no-deploy --copy-config --name sysvetmax-gotenberg --region gru

# Se o launcher perguntar:
#   "Would you like to set up a Postgresql database?"  -> NO
#   "Would you like to set up an Upstash Redis db?"    -> NO
#   "Create .dockerignore from .gitignore?"            -> YES (opcional)

# 2. Deploy real
fly deploy

# 3. Pega URL pública do app (do tipo https://sysvetmax-gotenberg.fly.dev)
fly status

# 4. (Opcional) tail dos logs no primeiro request
fly logs
```

## Validação do deploy

Após `fly deploy` retornar verde:

```powershell
# Health check direto (Gotenberg expõe /health nativo)
curl https://sysvetmax-gotenberg.fly.dev/health

# Conversão de teste com um .docx local
curl -X POST `
  -F "files=@C:\Users\djham\Downloads\Modelo Receituario.docx" `
  https://sysvetmax-gotenberg.fly.dev/forms/libreoffice/convert `
  --output preview.pdf

# Abre o PDF gerado para conferir layout
start preview.pdf
```

## Vincular na Vercel

No painel **Vercel → Project sysvetmax → Settings → Environment Variables**,
adicione:

| Nome                    | Valor                                   | Ambientes                              |
|-------------------------|-----------------------------------------|----------------------------------------|
| `GOTENBERG_URL`         | `https://sysvetmax-gotenberg.fly.dev`   | Production, Preview, Development       |
| `GOTENBERG_TIMEOUT_MS`  | `30000` (opcional, default 30 s)        | Production, Preview, Development       |

Após salvar, redeploy:

```powershell
# Via CLI (a partir da raiz do projeto VetMax):
vercel --prod

# Ou clique "Redeploy" no painel Vercel
```

## Operação contínua

```powershell
# Ver status + tamanho da máquina
fly status

# Tail de logs (Ctrl+C para sair)
fly logs

# Restart manual (em caso de comportamento estranho)
fly machine restart

# Escalar verticalmente (mais RAM se começar a falhar OOM)
fly scale memory 2048

# Escalar horizontalmente (alta carga — não esperado para clínica única)
fly scale count 2

# Ver custo estimado da máquina
fly billing
```

## Custos

| Recurso                          | Custo/mês USD |
|----------------------------------|---------------|
| shared-cpu-1x, 1 GB, always-on   | ~$5.70        |
| Saída de dados (10 GB)           | ~$0.20        |
| IPv4 dedicado                    | ~$2.00        |
| **Total estimado**               | **~$8–12**    |

Pague em USD direto no Fly (aceita cartão de crédito + PIX via Wise/Nubank
internacional).

## Rollback

Se algo der errado pós-deploy:

```powershell
# Lista releases passados
fly releases

# Volta para o release anterior por número
fly releases rollback <release_id>

# Em emergência: derrubar tudo (PDF cai em fallback DOCX automaticamente
# graças ao tryConvertDocxToPdf no app)
fly scale count 0
```

O app VetMax **NÃO QUEBRA** se o Gotenberg cair — `tryConvertDocxToPdf`
detecta timeout/HTTP/network e devolve o `.docx` editável para a clínica.
Logs ficam em `patient_documents.overlay_values._gotenberg_fallback_reason`
para alerta posterior.

## Sobre LGPD

- **Região**: única (GRU = São Paulo). Confirmado por `fly status` (campo
  `primary_region = "gru"`).
- **Dados em trânsito**: HTTPS forçado (`force_https = true` no fly.toml).
- **Dados em repouso**: Gotenberg é stateless. Cada conversão grava em
  `/tmp` dentro do container e descarta na resposta. Nenhum volume
  persistente está montado.
- **Logs**: Fly logs ficam em datacenter Brazil. Configurar
  `--log-level=info` (default no fly.toml) registra **apenas metadata**
  (tempo, status), nunca o conteúdo do DOCX/PDF.

## Troubleshooting

**`fly deploy` falha com "out of memory"**
→ Aumente para 2 GB: `fly scale memory 2048`

**Health check intermitente (status `unhealthy` momentâneo)**
→ Normal durante o `--libreoffice-restart-after=10`. Não é erro real.

**Conversão demora >30 s**
→ `GOTENBERG_TIMEOUT_MS` no app está baixo. Aumente para 60000 e/ou
   ajuste `--api-timeout=90s` no fly.toml.

**App retorna 503 logo após deploy**
→ Espera ~30 s para a primeira boot + `grace_period`. Se persistir,
   `fly logs` mostra o stack trace do Gotenberg.

---

Após deploy concluído, **avise no chat** com a URL final
(`https://sysvetmax-gotenberg.fly.dev`) que o agente assume o health-check
ponta-a-ponta via `tryConvertDocxToPdf` no servidor da Vercel.
