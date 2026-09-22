# Instalação do Agente-ponte de Laboratório — Passo a passo

> Objetivo: fazer os analisadores **URIT BH-5100** (hematologia) e **MaxBio BK-200**
> (bioquímica) conversarem automaticamente com o SYSVETMAX — enviar exames
> (worklist por código de barras) e receber resultados, sem digitação.

**Sempre teste primeiro no ambiente de HOMOLOGAÇÃO (DEV) e só depois vá para PRODUÇÃO.**

---

## Pré-requisitos
- Acesso ao PC ligado aos aparelhos (via AnyDesk) com permissão de **Administrador**.
- **Não precisa instalar Node** no PC: o instalador baixa um `node.exe` portátil do próprio sistema (uma vez, ~80 MB) e roda o agente com ele. Só é preciso ter **internet** durante a instalação. (Se o PC já tiver Node, ele é usado como alternativa.)
- Saber o **IP do PC** na rede do laboratório e a **porta** do agente (padrão **9100**).
- Os aparelhos e o PC na **mesma rede** (LAN) do laboratório.

---

## Passo A — Preparar o PC (recomendado)
1. Dê um **IP fixo/reservado** ao PC no roteador (DHCP reservation). Isso garante que,
   se um dia precisar trocar de máquina, o aparelho **não** precisa ser reconfigurado.
2. Anote esse IP (ex.: `192.168.0.50`) e a porta `9100`.

## Passo B — Gerar o código de pareamento (no sistema)
1. No SYSVETMAX, entre em **Gestão › Configurações › Laboratório**.
2. Clique em **Gerar código**, dê um nome (ex.: “PC Hematologia (URIT)”).
3. **Copie o código** (`lab_...`). ⚠️ Gere no **mesmo ambiente** onde vai testar:
   para DEV, gere logado no ambiente DEV; para produção, no de produção.

## Passo C — Instalar o agente (comece pelo DEV)
No PC, abra o **PowerShell como Administrador**, entre na pasta `lab-agent` e rode:
```powershell
.\install.ps1 -Env dev -Token lab_xxxxxxxx -Port 9100
```
(ou só `.\install.ps1` e responda as perguntas.)

O instalador:
- valida o Node, copia o agente para `C:\SysvetmaxLabAgent`,
- grava o `config.json` (ambiente + token + porta),
- cria o serviço **SysvetmaxLabAgent** (roda no boot, oculto, reinicia sozinho),
- mostra **o IP e a porta** para você configurar nos aparelhos.

> Para ver os logs ao vivo: `cd C:\SysvetmaxLabAgent ; node agent.mjs`

## Passo D — Ligar “Transmitir para o host/LIS” em cada aparelho
O que precisa ficar configurado nos DOIS (o caminho de menu pode variar conforme o
firmware — confira na tela; temos as fotos dos manuais no local):

**O que configurar (comum aos dois):**
- **IP do host/LIS** = IP do PC do agente (Passo A) · **Porta** = 9100
- **Protocolo** = HL7 / TCP-IP (v2.3.1)
- **Transmissão de resultados** = **Automática** (enviar ao terminar o teste)
- **Bidirecional / Consulta ao host** = **Ligado** (para o aparelho perguntar os exames pelo código de barras)

### D.1 — URIT BH-5100 (hematologia)
1. Tecle **Menu / Setup** → **Communication** (ou **Comm. Setup**) → **Host / LIS**.
2. Preencha: **IP Address** = IP do PC, **Port** = `9100`, **Protocol** = **HL7**.
3. **Communication / Transmit** = **On** e **Transmit mode** = **Auto** (enviar após o teste).
   - *No protocolo URIT, o modo automático corresponde ao MSH-10 `0001/1001` — é o "envia sozinho".*
4. **Bi-directional / Host Query** = **On** (para a consulta por código de barras).
5. **Salvar** e, se pedir, **reiniciar** o aparelho.

### D.2 — MaxBio BK-200 (bioquímica)
1. Entre em **Setup / System** → **Communication** (ou **LIS / Network**).
2. Preencha: **IP** = IP do PC, **Port** = `9100`, **Protocol/HL7** = **2.3.1**, **Transporte** = **TCP/IP**.
3. **Upload / Transmit to LIS** = **Auto** (envio automático dos resultados).
4. **Bidirectional / Query sample from LIS (por barcode)** = **On**.
5. **Salvar** e **reiniciar** se solicitado.

> Se o aparelho tiver a opção "cliente/servidor": deixe o aparelho como **cliente**
> conectando ao **IP do PC** (o agente é o servidor/host). Assim, trocar de PC só
> exige manter o mesmo IP (Passo A).

## Passo E — Testar
**Sem rodar exame (rápido):** no PC, `cd C:\SysvetmaxLabAgent`, pare o serviço um instante e rode manual em modo teste:
```powershell
node agent.mjs --dry --token teste --port 9199   # numa janela
node simulate.mjs --port 9199 --barcode 204457    # noutra janela
```
Deve aparecer `ACK` (resultado) e `DSR` (worklist) — prova que a ponta HL7 funciona.

**Com o aparelho (real):**
1. Crie uma OS/atendimento de exame no sistema e **imprima a etiqueta** do tubo (o código de barras é o nº da OS).
2. No aparelho, **bipe o tubo** e inicie a análise.
3. Confira: o aparelho recebe os exames (worklist) e, ao terminar, o resultado aparece
   em **Exames › (abrir o exame) › Resultados** como rascunho.
4. O **Médico Veterinário confere e libera** (botão *Conferir e liberar*).

## Passo F — Passar para PRODUÇÃO
1. Gere um **novo código** logado no ambiente de **produção** (Passo B).
2. Reinstale apontando para produção:
   ```powershell
   .\install.ps1 -Env prod -Token lab_yyyy -Port 9100
   ```
3. Repita o teste do Passo E em produção.

---

## Contingência — a máquina queimou / não liga
1. Instale o agente em outra máquina (Passo C) com o **mesmo código de pareamento**.
2. Dê a ela o **mesmo IP** do PC antigo (DHCP reservation) → o aparelho nem percebe.
3. Enquanto isso, o laboratório continua no **lançamento manual** (Exames › Resultados › digitar/colar HL7). Nada trava.

## Problemas comuns
- **“pareamento falhou”**: token errado ou de outro ambiente. Gere de novo no ambiente certo.
- **Aparelho não conecta**: confira IP/porta, firewall do Windows liberando a porta `9100` (entrada, TCP), e se o aparelho está na mesma rede.
- **Resultado não aparece**: confira se a OS/etiqueta bipada tem o mesmo nº que o aparelho enviou; e se o serviço `SysvetmaxLabAgent` está rodando (`Get-ScheduledTask SysvetmaxLabAgent`).
- **Remover**: `.\uninstall.ps1`.
