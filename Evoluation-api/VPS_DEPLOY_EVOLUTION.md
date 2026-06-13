# Roteiro de Deploy — Evolution API na VPS

**Sistema alvo:** Ubuntu 22.04 LTS ou 24.04 LTS  
**Domínio:** `api-wpp.sysmaxsolutions.com` (ajuste se preferir outro)  
**Tempo estimado:** 30–45 minutos do zero até HTTPS funcionando

---

## Antes de começar — o que você vai precisar

- [ ] VPS provisionada (mínimo: 1 vCPU, 2 GB RAM, 20 GB disco)
- [ ] Acesso root via SSH
- [ ] Domínio `api-wpp.sysmaxsolutions.com` apontando para o IP da VPS (registro A no painel DNS — Cloudflare, Registro.br, etc.)
- [ ] A API Key atual da Evolution (`Sysmax@2026#` ou a que estiver no `.env` local)
- [ ] As 3 instâncias salvas em `Evoluation-api/evolution_instances/` na sua máquina

> **DNS primeiro.** O Certbot vai confirmar o domínio via HTTP. Se o DNS não propagou, o HTTPS falha. Configure o registro A e aguarde 5–15 minutos antes de prosseguir.

---

## PARTE 1 — Configuração inicial da VPS

### 1.1 — Primeiro acesso e atualização

```bash
# Entre na VPS como root
ssh root@<IP_DA_VPS>

# Atualize todos os pacotes
apt update && apt upgrade -y
```

### 1.2 — Crie um usuário não-root (boa prática de segurança)

```bash
adduser sysmax
usermod -aG sudo sysmax

# Copie sua chave SSH para o novo usuário (rode no seu computador local)
# ssh-copy-id sysmax@<IP_DA_VPS>
```

### 1.3 — Firewall básico (UFW)

```bash
ufw allow OpenSSH
ufw allow 80/tcp    # HTTP — necessário para o Certbot validar o domínio
ufw allow 443/tcp   # HTTPS
ufw enable

# Confirme o status
ufw status
```

> **Não abra a porta 8080 para o mundo.** A Evolution API fica atrás do Nginx — só o Nginx recebe conexões externas. O `docker-compose-evolution-vps.yml` já garante isso com `127.0.0.1:8080:8080`.

---

## PARTE 2 — Instalação do Docker

### 2.1 — Instale o Docker Engine (método oficial)

```bash
# Instale dependências
apt install -y ca-certificates curl gnupg

# Adicione a chave GPG oficial do Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Adicione o repositório
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instale o Docker e o Compose plugin
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2.2 — Habilite o Docker para iniciar automaticamente

```bash
systemctl enable --now docker

# Teste
docker run --rm hello-world
```

### 2.3 — Permita o usuário sysmax rodar Docker sem sudo

```bash
usermod -aG docker sysmax
# (Faça logout e login novamente para o grupo ter efeito)
```

---

## PARTE 3 — Estrutura de diretórios e arquivos de configuração

### 3.1 — Crie os diretórios

```bash
mkdir -p /opt/evolution/instances
chown -R sysmax:sysmax /opt/evolution
```

### 3.2 — Transfira as instâncias WhatsApp existentes

> **Crítico.** As instâncias são os arquivos de sessão do WhatsApp. Sem elas, todas as clínicas precisarão reconectar (escanear QR code novamente).

No **seu computador local** (PowerShell ou Terminal):

```bash
# Copie as 3 instâncias da sua máquina para a VPS
scp -r "C:\SysMax\Evoluation-api\evolution_instances\*" sysmax@<IP_DA_VPS>:/opt/evolution/instances/

# Verifique se chegaram
ssh sysmax@<IP_DA_VPS> "ls -la /opt/evolution/instances/"
```

### 3.3 — Crie o arquivo docker-compose.yml na VPS

```bash
# Na VPS
nano /opt/evolution/docker-compose.yml
```

Cole o conteúdo do arquivo `docker-compose-evolution-vps.yml` que está no repositório (`Evoluation-api/docker-compose-evolution-vps.yml`).

Salve com `Ctrl+X → Y → Enter`.

### 3.4 — Crie o arquivo `.env` com os segredos

```bash
nano /opt/evolution/.env
```

Cole e preencha:

```dotenv
# ─── Evolution API — Segredos de Produção ─────────────────────────────────────
# NÃO commitar este arquivo. Ele fica apenas na VPS.

SERVER_URL=https://api-wpp.sysmaxsolutions.com

EVOLUTION_API_KEY=Sysmax@2026#

# Gere senhas fortes para o banco e o Redis:
# python3 -c "import secrets; print(secrets.token_urlsafe(32))"
POSTGRES_PASSWORD=TROQUE_POR_SENHA_FORTE_AQUI
REDIS_PASSWORD=TROQUE_POR_OUTRA_SENHA_FORTE_AQUI
```

> **Gerar senhas fortes no terminal da VPS:**
> ```bash
> python3 -c "import secrets; print(secrets.token_urlsafe(32))"
> ```
> Rode duas vezes — uma para `POSTGRES_PASSWORD`, outra para `REDIS_PASSWORD`.

Salve com `Ctrl+X → Y → Enter`.

---

## PARTE 4 — Subindo a Evolution API

### 4.1 — Primeiro start

```bash
cd /opt/evolution
docker compose up -d
```

### 4.2 — Acompanhe os logs na primeira inicialização

O primeiro start roda as migrations do banco. Pode levar 2–3 minutos.

```bash
# Logs em tempo real de todos os containers
docker compose logs -f

# Ou só da API
docker compose logs -f evolution-api
```

Aguarde ver uma linha parecida com:
```
evolution-api | 🚀 Application is running on: http://[::1]:8080
```

### 4.3 — Teste local na VPS

```bash
# Deve retornar JSON com informações da API
curl -s http://localhost:8080/ | head -5

# Teste autenticado — deve listar as instâncias
curl -s http://localhost:8080/instance/fetchInstances \
  -H "apikey: Sysmax@2026#" | python3 -m json.tool | head -20
```

---

## PARTE 5 — Nginx como proxy reverso com HTTPS (Certbot)

### 5.1 — Instale Nginx e Certbot

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### 5.2 — Crie o virtual host do Nginx

```bash
nano /etc/nginx/sites-available/evolution-api
```

Cole o conteúdo abaixo (ajuste o domínio se necessário):

```nginx
server {
    listen 80;
    server_name api-wpp.sysmaxsolutions.com;

    # Certbot vai usar este bloco para validar o domínio
    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # Headers necessários para WebSocket (Evolution API usa WS internamente)
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Timeouts generosos para operações longas (ex: envio de arquivo)
        proxy_read_timeout    600s;
        proxy_connect_timeout 60s;
        proxy_send_timeout    600s;

        # Tamanho máximo de payload (envio de mídia pelo WhatsApp)
        client_max_body_size  50M;
    }
}
```

Salve com `Ctrl+X → Y → Enter`.

### 5.3 — Ative o site e teste a configuração

```bash
# Ative o virtual host
ln -s /etc/nginx/sites-available/evolution-api /etc/nginx/sites-enabled/

# Remova o site padrão para evitar conflito
rm -f /etc/nginx/sites-enabled/default

# Teste a sintaxe
nginx -t

# Reinicie o Nginx
systemctl restart nginx
```

### 5.4 — Emita o certificado TLS com Certbot

```bash
certbot --nginx -d api-wpp.sysmaxsolutions.com \
  --non-interactive \
  --agree-tos \
  --email sysmax@sysmaxsolutions.com
```

O Certbot vai:
1. Validar que o domínio aponta para este servidor
2. Emitir o certificado Let's Encrypt
3. **Reescrever automaticamente o bloco Nginx** para HTTPS + redirect de HTTP→HTTPS

### 5.5 — Verifique o resultado

```bash
# Deve mostrar o bloco HTTPS que o Certbot adicionou
cat /etc/nginx/sites-enabled/evolution-api

# Teste o endpoint de fora (ou no navegador)
curl -s https://api-wpp.sysmaxsolutions.com/ | head -5
```

### 5.6 — Renovação automática do certificado

O Certbot já instala um timer systemd. Confirme:

```bash
systemctl status certbot.timer
# ou
certbot renew --dry-run
```

---

## PARTE 6 — Atualizar o VetMax para usar a nova URL

Após o HTTPS estar funcionando, atualize a variável de ambiente no Vercel (ou no `.env.local` para desenvolvimento):

```dotenv
# De:
EVOLUTION_API_URL=https://wpp.sysmaxsolutions.com
# Para:
EVOLUTION_API_URL=https://api-wpp.sysmaxsolutions.com
```

E na variável `SERVER_URL` dentro do `.env` da VPS já está configurada corretamente.

---

## PARTE 7 — Operação e manutenção

### Comandos do dia a dia

```bash
# Ver status de todos os containers
docker compose -f /opt/evolution/docker-compose.yml ps

# Logs em tempo real
docker compose -f /opt/evolution/docker-compose.yml logs -f evolution-api

# Reiniciar apenas a API (sem derrubar banco/redis)
docker compose -f /opt/evolution/docker-compose.yml restart evolution-api

# Parar tudo (instâncias ficam em /opt/evolution/instances — seguro)
docker compose -f /opt/evolution/docker-compose.yml down

# Subir tudo novamente
docker compose -f /opt/evolution/docker-compose.yml up -d

# Ver uso de recursos
docker stats
```

### Atualizar a imagem da Evolution API

```bash
cd /opt/evolution

# Baixe a nova imagem
docker compose pull evolution-api

# Recrie o container com a nova imagem (zero downtime para banco/redis)
docker compose up -d --no-deps evolution-api

# Confirme que voltou
docker compose logs -f evolution-api
```

> **Atenção ao patch de @lid JIDs no entrypoint.** Ao atualizar a versão da imagem, verifique se o patch ainda é necessário — pode ter sido incorporado na nova versão oficial. Teste com uma instância de desenvolvimento antes de atualizar produção.

### Backup das instâncias WhatsApp

```bash
# Na VPS — cria um tar.gz datado das instâncias
tar -czf /opt/evolution/backup-instances-$(date +%Y%m%d).tar.gz \
  -C /opt/evolution instances/

# Para copiar para sua máquina local (no seu PowerShell):
# scp sysmax@<IP_DA_VPS>:/opt/evolution/backup-instances-*.tar.gz .
```

---

## Checklist final antes de desligar a máquina local

- [ ] `https://api-wpp.sysmaxsolutions.com/` responde com JSON da Evolution API
- [ ] `GET /instance/fetchInstances` lista as 3 instâncias existentes
- [ ] Pelo menos uma instância mostra `connectionStatus: open` (WhatsApp conectado)
- [ ] Variável `EVOLUTION_API_URL` atualizada no Vercel
- [ ] `restart: always` confirmado: `docker inspect evolution-api | grep RestartPolicy`
- [ ] Cloudflare Tunnel (`start-cloudflared.ps1`) desativado do Task Scheduler da máquina local
- [ ] Watchdog PowerShell (`SysMax-Watchdog`) desativado do Task Scheduler
- [ ] Bot do VetMax enviando e recebendo mensagens normalmente

---

## Referências rápidas

| Item | Valor |
|------|-------|
| Diretório na VPS | `/opt/evolution/` |
| Instâncias WhatsApp | `/opt/evolution/instances/` |
| Arquivo de segredos | `/opt/evolution/.env` |
| Logs da API | `docker compose logs -f evolution-api` |
| URL da API (produção) | `https://api-wpp.sysmaxsolutions.com` |
| Porta interna | `127.0.0.1:8080` (não exposta ao mundo) |
| Imagem | `evoapicloud/evolution-api:v2.3.7` |
| Nginx config | `/etc/nginx/sites-available/evolution-api` |
| Certificado TLS | Renovação automática via `certbot.timer` |
