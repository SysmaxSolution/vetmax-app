# AI & RAG — Transcrição, Diagnóstico, Inteligência

**Data:** 2026-04-06  
**Modelos:** Claude 3.5 Sonnet, OpenAI Whisper

---

## 🎙️ Transcrição de Voz (Web Speech API)

**Módulo:** Triagem por voz  
**Fluxo:**
1. Auxiliar fala: "Animal deitado, sem apetite há 3 dias"
2. Web Speech API captura áudio
3. Whisper transcreve para texto
4. Claude pré-processa e estrutura em JSONB

---

## 🤖 Sugestões de Diagnóstico (RAG)

**Contexto fornecido ao Claude:**
- Espécie e raça do pet
- Predisposições genéticas
- Sintomas descritos
- Sinais vitais (peso, temp, mucosas)
- Histórico clínico

**Output esperado:**
```json
{
  "differential_diagnoses": [
    { "diagnosis": "X", "probability": "alta", "reasoning": "..." },
    { "diagnosis": "Y", "probability": "média", "reasoning": "..." }
  ],
  "next_steps": ["exame de sangue", "ultrassom"]
}
```

---

## 🚨 Limitações (OBRIGATÓRIO)

**IA NÃO substitui vet:**
- [ ] Diagnóstico final: sempre vet
- [ ] Prescrição: sempre vet
- [ ] Disclaimer exibido ao usuário

---

**Última revisão:** 2026-04-06
