# SYSVETMAX — Agente-ponte de Laboratório

Serviço leve que roda no PC ligado aos analisadores (URIT BH-5100 / MaxBio BK-200)
e faz a ponte **aparelho ⟷ nuvem**:

```
Aparelho  ── MLLP/HL7 (LAN) ──►  AGENTE  ── HTTPS ──►  SYSVETMAX (nuvem)
          ◄── DSR (worklist) ──         ◄── worklist/resultados ──
```

- **Recebe resultados** (`ORU^R01`) do aparelho → envia à nuvem → caem em *Resultados do exame* (rascunho) para o MV conferir e liberar.
- **Responde a worklist** (`QRY^Q02` → `DSR^Q03`): o aparelho lê o código de barras do tubo e o agente devolve **quais exames dosar**.
- **Fila com retry**: se a internet cair, guarda os resultados e reenvia sozinho (nada se perde).
- **Sem dependências** (Node ≥ 18). Config vem da nuvem pelo código de pareamento.

## Instalação (via AnyDesk)

1. Copie a pasta `lab-agent/` para o PC (ou baixe o instalador).
2. Escolha o **ambiente** e cole o **código de pareamento** (gerado em
   *Gestão › Configurações › Laboratório*, **no mesmo ambiente**):

   ```bash
   # Homologação (DEV) — para testar
   node agent.mjs --env dev --token lab_xxxxxxxx --port 9100

   # Produção
   node agent.mjs --env prod --token lab_xxxxxxxx --port 9100
   ```

   Ou crie um `config.json` na pasta:
   ```json
   { "environment": "dev", "token": "lab_xxxxxxxx", "port": 9100 }
   ```

3. No **aparelho**, ligue *“Transmitir para o host/LIS”* e aponte para o **IP deste PC : porta** (ex.: `192.168.0.50:9100`).
4. (Recomendado) Reserve o IP do PC no roteador (DHCP reservation) — assim, se trocar de máquina, o aparelho não precisa de reconfiguração.

### Rodar como serviço do Windows (auto-start)
Use `nssm` (Non-Sucking Service Manager) ou Agendador de Tarefas:
```
nssm install SysvetmaxLabAgent "C:\Program Files\nodejs\node.exe" "C:\lab-agent\agent.mjs --env prod --token lab_xxxx"
```

## Testar sem aparelho (simulador)
```bash
# terminal 1
node agent.mjs --dry --token teste --port 9199
# terminal 2
node simulate.mjs --port 9199 --barcode 204457
```
`--dry` não chama a nuvem (só valida a ponta MLLP/HL7). Sem `--dry`, valida ponta a ponta contra o ambiente do token.

## Trocar de máquina (contingência)
1. Instale o agente na nova máquina.
2. Cole o **mesmo código de pareamento** (a config vive na nuvem).
3. Dê à nova máquina o **mesmo IP** do PC antigo (DHCP reservation) → o aparelho nem percebe.
4. Enquanto isso, o laboratório segue no **lançamento manual** de resultados (rede de segurança sempre disponível).

## Segurança
- Só saída HTTPS autenticada por token (sem abrir porta de entrada no firewall).
- Token por clínica; do lado da nuvem o `clinic_id` isola os dados (multi-tenant).
- O AnyDesk é só para instalar/gerenciar — o agente opera sozinho.
