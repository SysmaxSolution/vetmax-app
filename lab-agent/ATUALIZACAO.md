# Atualizar o agente-ponte que JÁ está instalado na clínica

Vale para o PC do laboratório da **Clínica Animais** (`C:\SysvetmaxLabAgent`,
tarefa agendada `SysvetmaxLabAgent`, rodando como SYSTEM).

O que muda nesta versão: o agente passa a **comprimir (gzip)** o corpo que
envia para `/api/lab/results` — cerca de **28% menos** por exame. Nada mais
muda: mesmo token, mesma URL, mesma porta, mesmo aparelho.

> **Não há pressa.** A rota na nuvem aceita os **dois** formatos. O agente que
> está lá hoje (JSON sem compressão) continua funcionando normalmente. Esta
> atualização é só para colher a economia.

---

## O que trocar: **um arquivo**

| Arquivo | Onde | Trocar? |
|---|---|---|
| `agent.mjs` | `C:\SysvetmaxLabAgent\agent.mjs` | **sim — é o único obrigatório** |
| `config.json` | `C:\SysvetmaxLabAgent\config.json` | **NÃO** (tem o token e a URL) |
| `node.exe` | `C:\SysvetmaxLabAgent\node.exe` | **NÃO** (80 MB; o que está lá serve) |
| `simulate.mjs` | `C:\SysvetmaxLabAgent\simulate.mjs` | opcional |

---

## Passo a passo por AnyDesk (sem comando longo)

1. No PC do laboratório, crie a pasta `C:\atualiza-agente`.
2. Copie para dentro dela, pelo AnyDesk, **3 arquivos** desta pasta `lab-agent/`:
   - `agent.mjs`
   - `atualizar.ps1`
   - `ATUALIZAR.bat`
3. **Duplo-clique em `ATUALIZAR.bat`.**
4. Confirme a janela azul do Windows (pede Administrador).
5. Leia a última linha. Tem que aparecer:
   `[OK] Agente no ar, escutando na porta 9100.`

Pronto. O `atualizar.ps1` para a tarefa, guarda um backup do `agent.mjs`
anterior (`agent.mjs.bak-AAAAMMDD-HHMM`), troca o arquivo, religa a tarefa e
confere a porta — nessa ordem, sozinho.

---

## Verificação (comandos curtos, um por vez)

Abra o **PowerShell como Administrador** e rode um de cada vez:

```
Get-ScheduledTask SysvetmaxLabAgent | % State
```
→ esperado: `Running`

```
Get-NetTCPConnection -State Listen -LocalPort 9100
```
→ esperado: uma linha (o agente está escutando o aparelho)

```
cd C:\SysvetmaxLabAgent
```
```
dir agent.mjs*
```
→ esperado: `agent.mjs` com a data de hoje + o `.bak-...` do anterior

### Ver o primeiro envio chegando

A tarefa roda oculta. Para acompanhar ao vivo, pare a tarefa e rode à mão:

```
Stop-ScheduledTask SysvetmaxLabAgent
```
```
cd C:\SysvetmaxLabAgent
```
```
.\node.exe agent.mjs
```

Rode uma amostra no aparelho. Na tela deve aparecer:

```
↓ ORU de 5190Vet · amostra 226404
   ✓ gravado: 26 analitos na consulta <uuid>
```

Depois feche com `Ctrl+C` e religue a tarefa:

```
Start-ScheduledTask SysvetmaxLabAgent
```

E confirme no sistema: **Exames → fila** deve mostrar o resultado do Pet, com
os histogramas no laudo.

---

## Se der errado (voltar atrás em 3 passos)

```
Stop-ScheduledTask SysvetmaxLabAgent
```
```
cd C:\SysvetmaxLabAgent
```
```
copy /y agent.mjs.bak-* agent.mjs
```
```
Start-ScheduledTask SysvetmaxLabAgent
```

O agente antigo volta a funcionar na hora — a rota na nuvem nunca deixou de
aceitar o formato sem compressão.

---

## Desligar só a compressão (sem trocar o arquivo)

Se precisar, o próprio agente novo aceita rodar sem gzip:

```
cd C:\SysvetmaxLabAgent
```
```
.\node.exe agent.mjs --no-gzip
```

Para fixar isso, acrescente `"gzip": false` ao `config.json`. E se o servidor
recusar o corpo comprimido, o agente **desliga a compressão sozinho** e reenvia
sem gzip, sem perder o resultado.
