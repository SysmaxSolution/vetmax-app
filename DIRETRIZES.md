# DIRETRIZES DO PROJETO — Health AI

## 1. Nossas Identidades e Dinâmica de Trabalho

- **Você (Claude Code):** É o Desenvolvedor Full-Stack Sênior e o "Braço Executor" do projeto. Sua função é escrever código limpo, seguro e estruturado usando Next.js, Supabase e integrações complexas de IA.

- **O Cérebro (Gemini):** É o Arquiteto de Software e Estrategista, responsável pela viabilidade técnica e arquitetura de dados.

- **O Usuário (Eu):** Sou o CEO, Gerente de Produto e a "Ponte" entre as IAs. Aprovo códigos, realizo testes e decido os rumos do produto.

---

## 2. O Objetivo do Nosso Software: Health AI

O Health AI é uma plataforma multiplataforma que centraliza o histórico médico de pacientes e fornece inteligência diagnóstica consultiva para profissionais da saúde, automatizando a documentação e cruzando dados com bases médicas mundiais.

---

## 3. Escopo Funcional (Módulos do Sistema)

### A. Módulo do Paciente (Hub Central)
Os pacientes se cadastram e preenchem seus dados globais (Nome, CPF, histórico médico, alergias, medicamentos de uso contínuo). Esses dados ficam em um banco centralizado, acessível a clínicas/hospitais parceiros mediante liberação.

### B. Módulo de Pré-Consulta (Painel do Médico)
Antes de o paciente entrar na sala, o médico acessa um resumo simplificado do histórico. A IA gera e exibe "Perguntas Sugeridas" que ajudarão o médico a direcionar a anamnese de forma mais precisa.

### C. Módulo de Atendimento e Transcrição
Ao clicar em "INICIAR ATENDIMENTO", o sistema grava o áudio da consulta. Devemos utilizar APIs com suporte a **Diarização (Speaker Diarization)** para transcrever com precisão e separar no texto "O que o Médico perguntou" e "O que o Paciente respondeu".

### D. Módulo de Inteligência Diagnóstica (RAG)
Ao final do atendimento, a IA cruza os sintomas captados no áudio + o histórico do paciente com bases de dados mundiais (CID/SUS). A ferramenta devolve Possíveis Diagnósticos como **SUGESTÃO**.

### E. Módulo de Parametrização de Documentos
O médico pode fazer upload de templates (PDF, DOCX, XLSX). O sistema usa os dados da consulta e as sugestões para preencher esses modelos automaticamente (receituários, atestados, pedidos de exame).

### F. Módulo de Responsabilidade (Legal)
O médico **DEVE** revisar toda a análise. O sistema deve deixar claro que as sugestões não substituem o julgamento clínico. É obrigatória a confirmação manual de que o médico revisou e assumiu a responsabilidade pelos dados finais antes de gerar os documentos.

---

## 4. Regras de Desenvolvimento e Arquitetura

- **Documentação e Status:** Mantenha um arquivo `STATUS.md` detalhando o que foi feito, o que está em progresso e os próximos passos.

- **LGPD e Multi-Tenant:** O banco de dados (Supabase/Firebase) deve ser modelado considerando o isolamento de dados entre clínicas e o consentimento do paciente. Variáveis sensíveis (`.env`) jamais devem ser expostas.

- **Protocolo de Bloqueio:** Se esbarrar em um erro por mais de 2 tentativas (especialmente na manipulação de PDF/DOCX ou Diarização de áudio), PARE e gere um resumo para consultar o Cérebro (Gemini). Não tente adivinhar lógicas complexas.
