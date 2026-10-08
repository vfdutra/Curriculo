# Currículo ATS + Adaptador por Vaga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Neste ambiente:** o `~/.claude/CLAUDE.md` do Vinicius manda delegar implementação via skill `cc-executor` e proíbe commit/push sem um "pode commitar" explícito. Todo passo "Commit" abaixo é **propor o commit e esperar a autorização**.

**Goal:** Ter (1) uma versão melhorada e ATS-friendly do currículo em LaTeX, agregando o trabalho atual na Verden e na NodeAIoT, e (2) um CLI `node adaptar.mjs vaga.txt` que gera um currículo adaptado à vaga (PDF de 1 página), o texto pronto pra colar no perfil da Gupy e um relatório de aderência/lacunas, sem inventar experiência.

**Architecture:** `base/banco.md` é a fonte da verdade, com todos os fatos verdadeiros (mais do que cabe numa página). `base/curriculo.tex` é a versão base de 1 página. O CLI separa preâmbulo e corpo do template e manda corpo + banco + vaga + regras (`prompt.md`) ao `claude -p`, que usa a assinatura do Claude Code, sem API key. Recebe o corpo novo, `gupy.md` e `relatorio.md` em tags, remonta o `.tex` com o preâmbulo intacto, compila com `pdflatex` e roda dois guardas automáticos: página única e habilidades fora do banco.

**Tech Stack:** LaTeX (pdfLaTeX via MiKTeX), Node.js 24 (só stdlib: `node:fs`, `node:child_process`, `node:test`), Claude Code CLI (`claude -p`), Python 3.11 + `pypdf` (já instalado; só para verificação manual de extração de texto).

## Global Constraints

- Projeto em `C:\Users\dutra\Documents\Projetos\Pessoal\curriculo` (já criado, `git init` feito, `main.original.tex` = cópia do `main.tex` atual).
- Zero dependências npm. Só stdlib do Node.
- Layout de 1 coluna, sem ícones, sem imagens, sem cores; títulos de seção padrão ("Resumo", "Experiência Profissional", "Habilidades Técnicas", "Formação", "Certificações").
- Preâmbulo LaTeX mantém `\usepackage[T1]{fontenc}` e adiciona `\input{glyphtounicode}` + `\pdfgentounicode=1`. A versão antiga com ícones extraía `Experiˆ encia` e lixo de ícones; isso não pode voltar.
- Currículo final: **1 página A4**.
- **Nunca inventar:** todo fato, tecnologia e número do currículo gerado precisa existir em `base/banco.md`. Requisitos da vaga ausentes do banco vão para o relatório como lacuna, nunca para o currículo.
- Datas no formato `Mmm AAAA -- Atual` (ex.: `Fev 2026 -- Atual`), como no template atual.
- Idioma do currículo gerado = idioma da vaga (PT-BR por padrão; EN se a vaga estiver em inglês).
- Gupy ranqueia pelos campos **Experiência** e **Habilidades** do perfil (até 30 habilidades), então toda geração entrega também `gupy.md` com esse texto.

## Pesquisa que embasa as regras (resumo)

- Gupy: a ordenação lê os campos "Habilidades e Experiências" do perfil + critérios da vaga, considera contexto e tempo de experiência, recomenda "preencha as 30 habilidades" e usar termos comuns da área. Fonte: https://www.gupy.io/blog-do-emprego/como-funciona-a-ordenacao-da-gupy
- ATS em geral: 1 coluna, sem tabelas/ícones/imagens, títulos padrão, palavras-chave da vaga escritas como na vaga, seção de habilidades categorizada, bullets com resultado. Fontes: https://www.educative.io/blog/write-software-development-resume, https://resumegeni.com/ats-checklists/software-engineer
- LaTeX: `glyphtounicode` + `\pdfgentounicode=1` + `T1` para o texto extraído ficar correto; validar copiando o texto do PDF. Fonte: https://jobshinobi.com/blog/is-a-latex-resume-ats-friendly-2026
- O `tabular*` do cabeçalho de cada experiência é o mesmo do Jake's Resume e já extrai na ordem certa no PDF atual (verificado com `pypdf`), então fica.

## File Structure

```
curriculo/
  .gitignore                 # artefatos LaTeX e saidas/
  README.md                  # como usar (3 comandos)
  main.original.tex          # já existe: currículo atual, referência
  base/
    banco.md                 # fonte da verdade: todos os fatos/bullets/métricas verdadeiros
    curriculo.tex            # versão base melhorada, 1 página
  prompt.md                  # regras pro LLM (ATS + não inventar + formato de saída)
  lib.mjs                    # funções puras (split/parse/assemble/checks)
  lib.test.mjs               # node:test
  adaptar.mjs                # CLI: lê vaga, chama claude -p, compila, avisa
  exemplos/vaga-exemplo.txt  # vaga de teste com requisito que você NÃO tem (Kubernetes)
  saidas/                    # gerado, ignorado pelo git
```

---

### Task 0: Ferramentas (MiKTeX + Claude Code CLI) e esqueleto

**Files:**
- Create: `.gitignore`

**Interfaces:**
- Consumes: nada
- Produces: `pdflatex` e `claude` no PATH; `.gitignore`

- [ ] **Step 1: Instalar MiKTeX** (o Vinicius roda; é um instalador)

```bash
winget install --id MiKTeX.MiKTeX -e
```

Depois, ligar a instalação automática de pacotes (sem prompt no meio da compilação), num terminal novo:

```bash
initexmf --set-config-value [MPM]AutoInstall=1
```

- [ ] **Step 2: Instalar o Claude Code CLI e logar com a assinatura**

```bash
npm install -g @anthropic-ai/claude-code
```

```bash
claude
```

(no primeiro `claude`, fazer login com a conta da assinatura e sair com `/exit`)

- [ ] **Step 3: Verificar**

Run: `pdflatex --version` → Expected: linha começando com `MiKTeX-pdfTeX`
Run: `claude --version` → Expected: número de versão
Run: `echo "responda só: ok" | claude -p` → Expected: `ok`

- [ ] **Step 4: Criar `.gitignore`**

```gitignore
saidas/
*.aux
*.log
*.out
*.fls
*.fdb_latexmk
*.synctex.gz
```

- [ ] **Step 5: Commit** (só após autorização)

```bash
git add .gitignore main.original.tex docs/
git commit -m "chore: inicializa projeto do currículo"
```

---

### Task 1: Banco de fatos (`base/banco.md`)

**Files:**
- Create: `base/banco.md`

**Interfaces:**
- Consumes: nada
- Produces: `base/banco.md`, lido pelo CLI (Task 4) e usado pelo guarda `unknownSkills` (Task 3). Habilidades precisam aparecer escritas como aqui.

Fatos levantados de: git log por autor (`dutra`/`vinicius`) em verden-web (~1.870 commits seus desde fev/2026), verden-app (~310), puntaco-app (~450), locus-backend (22), nodeiot-front (~225), nodeiotapp (~280), workflow (42), nodeiot-ai (26), seqoia (24); `package.json`/`composer.json` de cada repo; ~250 sessões antigas do Claude Code; os dois PDFs. **Nada aqui foi inventado; números novos só entram se o Vinicius confirmar.**

- [ ] **Step 1: Escrever `base/banco.md`**

```markdown
# Banco de fatos — Vinicius Dutra

Fonte da verdade do adaptador. Só entra aqui o que é verdadeiro. O currículo gerado só pode usar o que está aqui.
Métricas marcadas (CONFIRMAR) não vão para o currículo até o Vinicius confirmar e remover a marca.

## Contato
- Vinicius Dutra — Santa Maria, RS
- +55 00 00000-0000 · fulano@example.com
- linkedin.com/in/seu-perfil · github.com/vfdutra

## Formação
- Bacharelado em Sistemas de Informação — Universidade Federal de Santa Maria (UFSM), 2019 – 2026

## Certificações
- Desenvolvimento Web Full Stack (Udemy)
- Node.js Avançado (The Developer's Conference — TDC)

## Experiência

### Verden — Desenvolvedor Full-Stack — Santa Maria, RS — Fev 2026 – Atual
Contexto: plataforma SaaS de telemetria e gestão de frotas (rastreadores, câmeras, sensores) + produtos do grupo (app esportivo Puntaco, sistema agrícola Locus).
Stack: Laravel 12 / PHP 8.4, PostgreSQL, Redis/Valkey, Laravel Horizon, React, TypeScript, TanStack Query, TanStack Table, Tailwind CSS, shadcn/ui (Radix UI), React Hook Form, Zod, Leaflet, React Native (Expo), Docker, GitHub Actions, Sentry, Caddy, Nginx, PHPUnit.
- Desenvolvo e mantenho plataforma SaaS de telemetria e gestão de frotas com Laravel, PostgreSQL, React e TypeScript, do modelo de dados à interface
- Integrações com APIs e webhooks de terceiros: multas de trânsito (Frota162) com deduplicação de entregas e histórico; webhook do Banco do Brasil com autenticação mTLS (certificado, Caddy); ponto eletrônico GerREP-P com rate limiting e token em cache; boletos
- Relatórios e dashboards de telemetria: motor via CAN (temperatura, KM com fallback GPS), jornada de motoristas (máquina de estados sobre pacotes do rastreador, auditável), comportamento de condução (faixas de RPM), multas (ranking por veículo, gráfico diário), risco de câmera DMS normalizado por km
- Alertas por jobs agendados e filas (Redis/Horizon): limite de temperatura de sensores, retorno do veículo à sede, relatório mensal de multas por e-mail
- Performance: índices compostos e parciais no PostgreSQL; leitura de agregados diários (vehicle_daily_data) em vez de reprocessar o mês; otimização do job de temperatura que roda a cada 5 min
- Faturamento: faturas com desconto, parcelamento de ordem de serviço nas faturas mensais, faturamento cruzado de veículo
- Módulos e dashboards por cliente com controle de permissões (abilities/policies); módulo de auditoria de alterações (laravel-auditing); correção de autorização em endpoint (policy)
- Refatorações: extração de lógica de controller para Services com transactions e Eloquent; padronização de enums; renomeação de domínio para inglês
- Front-end (React + TypeScript): migração de telas para TanStack Query, estado de filtros/ordenação/paginação das data tables na URL, filtros multi-seleção, seletor de tipo de mapa (Leaflet), formulários com validação (CPF)
- Modernização de sistemas legados em PHP, JavaScript e jQuery, integrando novas funcionalidades à plataforma existente
- Qualidade: testes automatizados com PHPUnit nas features entregues (CONFIRMAR: alterou 280+ arquivos de teste no verden-web segundo o git log); CI no GitHub Actions (lint, build, auditoria diária de dependências, actions fixadas por SHA); Renovate; code review em PRs
- App esportivo (Puntaco: Laravel, React, React Native/Expo, PostgreSQL, Valkey): pagamentos Pix com Asaas (subcontas por clube, webhooks, conciliação, reativação de filas), pacotes de aulas com créditos, agendamento de aulas e reservas de quadra, notificações push (FCM), e-mail transacional (Resend), processamento de vídeo com FFmpeg (anúncios e música nos vídeos de lances), controle de acesso e métricas de uso, CI de web/mobile
- Sistema agrícola (Locus): APIs REST em Laravel com policies, form requests e testes de feature (CRUDs de operadores, equipamentos, produtos e tipos de aplicação)

### NodeAIoT — Desenvolvedor Full-Stack — Guaíba, RS — Jul 2025 – Atual
Contexto: plataforma low-code de IoT com IA (nStudio, nApp, nStore), com fluxos de agentes de IA, datasets e dispositivos.
Stack: Node.js, Express, MongoDB (Mongoose), Redis, Socket.io, MQTT (Aedes), React, Redux, Vite, React Flow, Monaco Editor, Python, FastAPI, LangGraph, LangChain, ChromaDB, AWS (Bedrock, S3, EC2), Asaas, Docker.
- Desenvolvo plataforma low-code de IoT com IA com Node.js/Express, MongoDB, React e Python, atuando de back-end a front-end
- Serviço de execução de fluxos de agentes de IA em Python (FastAPI, LangGraph, LangChain): montagem do grafo a partir de nós/arestas, memória de conversa, saída estruturada (separar texto de JSON), prompts genéricos reutilizáveis, múltiplos provedores de LLM (AWS Bedrock, NVIDIA, Ollama)
- RAG: múltiplas bases por fluxo (multi-RAG) com ChromaDB, seleção e filtro de documentos por contexto, atualização em tempo real, integração com Bedrock, cálculo de custo por uso
- Pagamentos: migração de assinaturas para compra de créditos pré-pagos; integração com Asaas (pedidos, cupons de desconto, parcelamento, free trial, webhooks)
- Painel de controle de custos dos modelos do Bedrock; feedback de expiração de tokens; créditos padrão para novos usuários
- Front-end React: editor de fluxos (React Flow), datastore/datasets (dev/prod, edição de registros), gestão de usuários e grupos, convites de membros, tour inicial, compilação de firmware de dispositivos IoT no nStudio
- Correções de bugs, refatoração e performance (login/preview de projetos, listagem de aplicações)

### Delta Global — Desenvolvedor Full-Stack Júnior — Porto Alegre, RS (remoto) — Jun 2024 – Abr 2025
- Módulos de plataforma de rastreamento e gestão de frotas com PHP/CodeIgniter, React, HTML, CSS, JavaScript e Bootstrap, para gestão de 800 mil+ ativos
- APIs REST processando 25.000+ requisições diárias; integrações com sistemas terceiros
- Otimização de 35% no tempo de resposta das consultas de localização
- Integração bidirecional com rastreadores veiculares via TCP/IP; controle de acesso por cartão identificador
- Equipe ágil (Scrum/Kanban): daily, planning, retrospectivas

### Irriga Global — Desenvolvedor Full-Stack Estagiário — Santa Maria, RS — Set 2022 – Jun 2024
- Manutenção e evolução de sistema meteorológico monolítico com PHP/Laravel, JavaScript, jQuery e Bootstrap
- APIs RESTful com Node.js (Adonis.js) para integração com 700+ estações meteorológicas; otimização de consultas MySQL em 45%
- Sistema de alertas em JSON atendendo 3.500+ usuários
- Sprints quinzenais e revisões de código

### Prefeitura de Santa Maria — Desenvolvedor Web Estagiário — Santa Maria, RS — Jun 2021 – Ago 2022
- Modernização de sistemas legados com PHP/Laravel e Bootstrap para 200+ funcionários
- Módulos de ERP municipal; migração de dados críticos em MySQL com 99,9% de precisão; redução de 20% em processos manuais; modelagem de banco relacional

## Habilidades (grafia canônica — o currículo e a Gupy usam estes nomes)
- Linguagens: PHP, JavaScript, TypeScript, Python, SQL, HTML, CSS, Java
- Front-end: React, React Native, Expo, Redux, TanStack Query, Tailwind CSS, shadcn/ui, Bootstrap, jQuery, Vite, Leaflet
- Back-end: Laravel, CodeIgniter, Node.js, Express, Nest.js, Adonis.js, FastAPI, APIs REST, webhooks, filas, jobs assíncronos, Laravel Horizon
- IA: LangChain, LangGraph, RAG, ChromaDB, AWS Bedrock, agentes de IA, LLM
- Banco de dados: PostgreSQL, MySQL, MongoDB, Redis, Valkey, modelagem de dados, otimização de consultas
- Cloud e DevOps: Docker, Docker Compose, GitHub Actions, CI/CD, AWS, AWS S3, AWS EC2, Nginx, Caddy, Linux, Git
- Qualidade e observabilidade: PHPUnit, testes automatizados, code review, Sentry, Grafana
- Integrações: Pix, Asaas, Firebase Cloud Messaging (FCM), MQTT, WebSocket, Socket.io, FFmpeg, TCP/IP
- Metodologias: Scrum, Kanban, metodologias ágeis
- Spring (básico, da formação)

## Lacunas conhecidas (NÃO colocar no currículo; o relatório deve apontar quando a vaga pedir)
- Idioma inglês: nível não informado (CONFIRMAR e adicionar aqui)
```

- [ ] **Step 2: Revisão do Vinicius**

O Vinicius lê o banco, corrige o que não for dele ou estiver exagerado, confirma ou remove os itens `(CONFIRMAR)` e adiciona métricas reais que souber (ex.: nº de clientes/veículos na Verden, usuários da NodeAIoT, nível de inglês). **O Task 2 não começa sem esse OK.**

- [ ] **Step 3: Commit** (só após autorização)

```bash
git add base/banco.md
git commit -m "docs: adiciona banco de fatos do currículo"
```

---

### Task 2: Currículo base melhorado (`base/curriculo.tex`)

**Files:**
- Create: `base/curriculo.tex`

**Interfaces:**
- Consumes: `base/banco.md` (Task 1, revisado)
- Produces: `base/curriculo.tex`, com preâmbulo + `\begin{document}` ... `\end{document}`. O CLI (Task 4) reaproveita tudo antes de `\begin{document}` e substitui só o corpo. Os macros `\resumeSubheading`, `\resumeItem`, `\resumeItemListStart/End`, `\resumeSubHeadingListStart/End` precisam continuar com esses nomes.

Mudanças em relação ao `main.original.tex`: `a4paper` (padrão no Brasil, ganha altura); `glyphtounicode` + `\pdfgentounicode=1`; cargo e cidade no cabeçalho; seção **Resumo** com as palavras-chave principais; bullets de Verden e NodeAIoT reescritos com fatos concretos do banco (integrações, IA/RAG, pagamentos, performance, qualidade); Delta e Irriga recuperam conquistas da versão antiga (35%, TCP/IP); habilidades reorganizadas com IA, Cloud/DevOps e Qualidade; seção **Certificações**.

- [ ] **Step 1: Escrever `base/curriculo.tex`** (se o Task 1 mudou fatos, refletir aqui)

```latex
%-------------------------
% Currículo - Vinicius Dutra (base ATS)
%-------------------------
\documentclass[a4paper,10pt]{article}

\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[portuguese]{babel}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\setlength{\footskip}{3.7pt}
\usepackage{tabularx}
\usepackage{geometry}

% Texto do PDF legível por ATS (copiar/colar e extração corretos)
\input{glyphtounicode}
\pdfgentounicode=1

\geometry{top=0.5in, bottom=0.5in, left=0.5in, right=0.5in}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Formatação das seções
\titleformat{\section}{
  \vspace{-6pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-4pt}]

%-------------------------
% Comandos customizados
%-------------------------
\newcommand{\resumeItem}[1]{
  \item\small{#1 \vspace{-2pt}}
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-1pt}\item
    \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & \small #2 \\
      \textit{\small #3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-5pt}
}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.15in]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-2pt}}

%=========================
\begin{document}
%=========================

%----------CABEÇALHO----------
\begin{center}
  {\LARGE \textbf{VINICIUS DUTRA}} \\[2pt]
  {\large Desenvolvedor Full-Stack} \\[4pt]
  \small
  Santa Maria, RS $|$
  +55 00 00000-0000 $|$
  \href{mailto:fulano@example.com}{fulano@example.com} $|$
  \href{https://linkedin.com/in/seu-perfil}{linkedin.com/in/seu-perfil} $|$
  \href{https://github.com/vfdutra}{github.com/vfdutra}
\end{center}

%----------RESUMO----------
\section{Resumo}
\small{Desenvolvedor Full-Stack com 5 anos de experiência (desde 2021) em PHP/Laravel, React/TypeScript, Node.js e Python, atuando em plataformas SaaS de gestão de frotas, IoT e IA em produção. Experiência com APIs REST, integrações via webhooks, filas e jobs assíncronos, pagamentos Pix (Asaas), agentes de IA com LangGraph e RAG, PostgreSQL e MongoDB, testes automatizados e CI/CD com Docker e GitHub Actions.}

%---------EXPERIÊNCIA---------
\section{Experiência Profissional}
\resumeSubHeadingListStart

  % Verden
  \resumeSubheading
    {Verden}{Fev 2026 -- Atual}
    {Desenvolvedor Full-Stack}{Santa Maria, RS}
  \resumeItemListStart
    \resumeItem{Desenvolvo e mantenho plataforma SaaS de telemetria e gestão de frotas com Laravel (PHP 8.4), PostgreSQL, React, TypeScript e TanStack Query, do modelo de dados à interface}
    \resumeItem{Construí integrações com APIs e webhooks de terceiros: multas de trânsito com deduplicação de entregas, webhook do Banco do Brasil com autenticação mTLS e ponto eletrônico com rate limiting e token em cache}
    \resumeItem{Implementei relatórios e dashboards de telemetria (motor via CAN, jornada de motoristas, comportamento de condução, multas) e alertas por jobs agendados e filas com Redis e Laravel Horizon}
    \resumeItem{Otimizei jobs e consultas PostgreSQL com índices compostos e parciais e leitura de agregados diários em vez de reprocessar o mês inteiro}
    \resumeItem{Desenvolvi pagamentos Pix com Asaas (subcontas, webhooks, conciliação), notificações push (FCM) e processamento de vídeo com FFmpeg em app esportivo com Laravel, React e React Native (Expo)}
    \resumeItem{Garanto qualidade com testes automatizados (PHPUnit), code review, CI no GitHub Actions (lint, build, auditoria de dependências), trilha de auditoria e policies de autorização}
  \resumeItemListEnd

  % NodeAIoT
  \resumeSubheading
    {NodeAIoT}{Jul 2025 -- Atual}
    {Desenvolvedor Full-Stack}{Guaíba, RS}
  \resumeItemListStart
    \resumeItem{Desenvolvo plataforma low-code de IoT com IA usando Node.js/Express, MongoDB, React e Python, atuando de back-end a front-end}
    \resumeItem{Implementei a execução de fluxos de agentes de IA em Python (FastAPI, LangGraph, LangChain): montagem do grafo, memória de conversa, saída estruturada e múltiplos provedores de LLM (AWS Bedrock, NVIDIA, Ollama)}
    \resumeItem{Desenvolvi RAG com múltiplas bases vetoriais (ChromaDB), filtro de documentos por contexto e cálculo de custo por uso de modelo}
    \resumeItem{Implementei a migração de assinaturas para créditos pré-pagos com Asaas (cupons, parcelamento, webhooks) e painel de custos dos modelos do AWS Bedrock}
    \resumeItem{Criei interfaces React para editor de fluxos (React Flow), datasets dev/prod, gestão de usuários e grupos e compilação de firmware de dispositivos IoT}
  \resumeItemListEnd

  % Delta Global
  \resumeSubheading
    {Delta Global}{Jun 2024 -- Abr 2025}
    {Desenvolvedor Full-Stack Júnior}{Porto Alegre, RS}
  \resumeItemListStart
    \resumeItem{Desenvolvi módulos de plataforma de gestão de frotas com PHP/CodeIgniter, React, JavaScript e Bootstrap, para gestão de 800 mil+ ativos}
    \resumeItem{Criei e mantive APIs REST processando 25.000+ requisições diárias e integrações com rastreadores veiculares via TCP/IP}
    \resumeItem{Otimizei em 35\% o tempo de resposta das consultas de localização}
    \resumeItem{Atuei em equipe ágil (Scrum/Kanban) com daily, planning e retrospectivas}
  \resumeItemListEnd

  % Irriga Global
  \resumeSubheading
    {Irriga Global}{Set 2022 -- Jun 2024}
    {Desenvolvedor Full-Stack Estagiário}{Santa Maria, RS}
  \resumeItemListStart
    \resumeItem{Mantive e evoluí sistema meteorológico com PHP/Laravel, JavaScript, jQuery e Bootstrap}
    \resumeItem{Desenvolvi APIs RESTful com Node.js (Adonis.js) para integração com 700+ estações meteorológicas, otimizando consultas MySQL em 45\%}
    \resumeItem{Implementei sistema de alertas atendendo 3.500+ usuários}
  \resumeItemListEnd

  % Prefeitura de Santa Maria
  \resumeSubheading
    {Prefeitura de Santa Maria}{Jun 2021 -- Ago 2022}
    {Desenvolvedor Web Estagiário}{Santa Maria, RS}
  \resumeItemListStart
    \resumeItem{Modernizei sistemas legados com PHP/Laravel e Bootstrap para 200+ funcionários}
    \resumeItem{Desenvolvi módulos de ERP municipal e migrei dados críticos em MySQL com 99,9\% de precisão}
  \resumeItemListEnd

\resumeSubHeadingListEnd

%---------HABILIDADES---------
\section{Habilidades Técnicas}
\begin{itemize}[leftmargin=0in, label={}]
  \small{\item{
    \textbf{Linguagens:} PHP, JavaScript, TypeScript, Python, SQL \\
    \textbf{Front-end:} React, React Native, Expo, TanStack Query, Tailwind CSS, Redux, Vite, Bootstrap, jQuery \\
    \textbf{Back-end:} Laravel, Node.js, Express, Nest.js, Adonis.js, FastAPI, CodeIgniter, APIs REST, webhooks, filas e jobs assíncronos \\
    \textbf{IA:} LangChain, LangGraph, RAG, ChromaDB, AWS Bedrock, agentes de IA \\
    \textbf{Banco de Dados:} PostgreSQL, MySQL, MongoDB, Redis, modelagem de dados, otimização de consultas \\
    \textbf{Cloud e DevOps:} Docker, GitHub Actions, CI/CD, AWS (S3, EC2), Nginx, Linux, Git \\
    \textbf{Qualidade:} PHPUnit, testes automatizados, code review, Sentry \\
    \textbf{Metodologias:} Scrum, Kanban
  }}
\end{itemize}

%---------FORMAÇÃO---------
\section{Formação}
\resumeSubHeadingListStart
  \resumeSubheading
    {Universidade Federal de Santa Maria (UFSM)}{2019 -- 2026}
    {Bacharelado em Sistemas de Informação}{}
\resumeSubHeadingListEnd

%---------CERTIFICAÇÕES---------
\section{Certificações}
\small{Desenvolvimento Web Full Stack (Udemy) $|$ Node.js Avançado (The Developer's Conference)}

\end{document}
```

- [ ] **Step 2: Compilar**

Run: `mkdir -p saidas/base && pdflatex -interaction=nonstopmode -halt-on-error -output-directory saidas/base base/curriculo.tex` (o pdflatex não cria a pasta de saída)
Expected: termina com `Output written on saidas/base/curriculo.pdf (1 page, ...)`.
Se der **2 pages**, cortar nesta ordem e recompilar: (a) remover a seção Certificações; (b) Prefeitura com 1 bullet só; (c) juntar os bullets 3 e 4 da Delta.

- [ ] **Step 3: Verificar a extração de texto (o que o ATS lê)**

Run:
```bash
python -I -c "import sys,pypdf; sys.stdout.reconfigure(encoding='utf-8'); print(''.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))" saidas/base/curriculo.pdf
```
Expected: `Experiência Profissional`, `Habilidades Técnicas` e `Formação` com acentos íntegros (sem `ˆ`, `¸`, `´` soltos); seções na ordem Resumo → Experiência → Habilidades → Formação → Certificações; nenhum caractere-lixo de ícone; palavras como `workflow`/`Profissional` sem quebra de ligatura.

- [ ] **Step 4: Revisão visual do Vinicius**: abrir `saidas/base/curriculo.pdf` e conferir se segue o visual clean do atual.

- [ ] **Step 5: Commit** (só após autorização)

```bash
git add base/curriculo.tex
git commit -m "feat: adiciona currículo base ATS com experiências atuais"
```

---

### Task 3: Funções puras do adaptador (`lib.mjs`) com testes

**Files:**
- Create: `lib.mjs`
- Test: `lib.test.mjs`

**Interfaces:**
- Consumes: nada (puro)
- Produces (usado pelo Task 4):
  - `splitTemplate(tex: string) => { preamble: string, body: string }`: `preamble` inclui `\begin{document}`; `body` é o que fica entre ele e `\end{document}`. Lança erro se faltar algum dos dois.
  - `assemble(preamble: string, body: string) => string`: remove `\begin{document}`/`\end{document}` que o LLM tenha repetido no body e devolve `preamble + body + \end{document}`.
  - `parseResponse(text: string) => { body, gupy, relatorio }`: conteúdo das tags `<corpo>`, `<gupy>`, `<relatorio>`. Lança `resposta sem <tag>`.
  - `pageCount(pdflatexStdout: string) => number | null`
  - `skillsFromTex(body: string) => string[]`: itens da seção `Habilidades`/`Skills`
  - `skillsFromGupy(gupy: string) => string[]`: itens da seção `## Habilidades` do gupy.md
  - `unknownSkills(skills: string[], banco: string) => string[]`: itens que não aparecem no banco (case/acento-insensível)
  - `slugify(vaga: string) => string`: slug da 1ª linha não vazia, máx. 50 chars, fallback `vaga`

- [ ] **Step 1: Escrever os testes**

```js
// lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTemplate, assemble, parseResponse, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify } from './lib.mjs';

const TEX = '\\documentclass{article}\n\\usepackage{x}\n\\begin{document}\nCORPO\n\\end{document}\n';

test('splitTemplate separa preâmbulo e corpo', () => {
  const { preamble, body } = splitTemplate(TEX);
  assert.ok(preamble.endsWith('\\begin{document}'));
  assert.equal(body.trim(), 'CORPO');
});

test('splitTemplate falha sem \\begin{document}', () => {
  assert.throws(() => splitTemplate('\\documentclass{article}'), /begin\{document\}/);
});

test('assemble recoloca o end e ignora begin/end repetidos pelo LLM', () => {
  const { preamble } = splitTemplate(TEX);
  const out = assemble(preamble, '\\begin{document}\nNOVO\n\\end{document}');
  assert.equal(out.match(/\\begin\{document\}/g).length, 1);
  assert.equal(out.match(/\\end\{document\}/g).length, 1);
  assert.ok(out.includes('NOVO'));
  assert.ok(out.startsWith('\\documentclass'));
});

test('parseResponse extrai as três tags', () => {
  const r = parseResponse('lixo <corpo>\nC\n</corpo> x <gupy>G</gupy><relatorio> R </relatorio>');
  assert.deepEqual(r, { body: 'C', gupy: 'G', relatorio: 'R' });
});

test('parseResponse reclama de tag faltando', () => {
  assert.throws(() => parseResponse('<corpo>C</corpo>'), /<gupy>/);
});

test('pageCount lê o número de páginas mesmo com a linha quebrada no log', () => {
  assert.equal(pageCount('Output written on saidas/x/Vinicius_Dutra_Curr\niculo.pdf (1 page, 51234 bytes).'), 1);
  assert.equal(pageCount('Output written on a.pdf (2 pages, 9 bytes).'), 2);
  assert.equal(pageCount('! Emergency stop.'), null);
});

test('skillsFromTex pega os itens da seção de habilidades', () => {
  const body = '\\section{Resumo}\nReact\n\\section{Habilidades Técnicas}\n\\textbf{Back-end:} Laravel, Node.js (Express, Nest.js) \\\\\n\\textbf{Dados:} PostgreSQL \\& Redis \\\\\n\\section{Formação}\nUFSM';
  assert.deepEqual(skillsFromTex(body), ['Laravel', 'Node.js', 'Express', 'Nest.js', 'PostgreSQL & Redis']);
});

test('skillsFromGupy pega a lista da seção Habilidades', () => {
  const gupy = '## Habilidades\n1. React\n2. Laravel\n- Docker\n\n## Experiências\n- não é skill';
  assert.deepEqual(skillsFromGupy(gupy), ['React', 'Laravel', 'Docker']);
});

test('unknownSkills ignora caixa e acento e devolve só o que não está no banco', () => {
  const banco = '- Back-end: Laravel, Node.js\n- Integrações: Pix, Asaas\n- otimização de consultas';
  assert.deepEqual(unknownSkills(['laravel', 'NODE.JS', 'Kubernetes', 'Otimizacao de consultas'], banco), ['Kubernetes']);
});

test('slugify usa a primeira linha não vazia', () => {
  assert.equal(slugify('\n  Desenvolvedor(a) Full Stack Pleno — PHP/Laravel\nresto'), 'desenvolvedor-a-full-stack-pleno-php-laravel');
  assert.equal(slugify('   '), 'vaga');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test lib.test.mjs`
Expected: FAIL com `Cannot find module` / `lib.mjs`

- [ ] **Step 3: Implementar `lib.mjs`**

```js
// Funções puras do adaptador de currículo. Só stdlib.

const BEGIN = '\\begin{document}';
const END = '\\end{document}';

export function splitTemplate(tex) {
  const begin = tex.indexOf(BEGIN);
  const end = tex.lastIndexOf(END);
  if (begin < 0 || end < 0) throw new Error('template sem \\begin{document} ou \\end{document}');
  const start = begin + BEGIN.length;
  return { preamble: tex.slice(0, start), body: tex.slice(start, end) };
}

export function assemble(preamble, body) {
  const clean = body
    .replace(/^[\s\S]*\\begin\{document\}/, '')
    .replace(/\\end\{document\}[\s\S]*$/, '')
    .trim();
  return `${preamble}\n\n${clean}\n\n${END}\n`;
}

export function parseResponse(text) {
  const pick = (tag) => {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    if (!m) throw new Error(`resposta sem <${tag}>`);
    return m[1].trim();
  };
  return { body: pick('corpo'), gupy: pick('gupy'), relatorio: pick('relatorio') };
}

export function pageCount(stdout) {
  // pdflatex quebra linhas do log em 79 colunas, então junta antes de casar
  const m = stdout.replace(/\r?\n/g, '').match(/Output written on .*?\((\d+) pages?/);
  return m ? Number(m[1]) : null;
}

export function skillsFromTex(body) {
  const sec = body.split('\\section{').find((s) => /^(Habilidades|Skills)/i.test(s));
  if (!sec) return [];
  return [...sec.matchAll(/\\textbf\{[^}]*\}([^\n]*)/g)]
    .flatMap((m) => m[1].replace(/\\\\\s*$/, '').split(/[,()]/))
    .map((s) => s.replace(/\\[a-zA-Z]+/g, '').replace(/\\(.)/g, '$1').trim())
    .filter(Boolean);
}

export function skillsFromGupy(gupy) {
  const sec = gupy.split(/^## /m).find((s) => /^Habilidades/i.test(s));
  if (!sec) return [];
  return [...sec.matchAll(/^\s*(?:[-*]|\d+\.)\s+(.+)$/gm)].map((m) => m[1].trim());
}

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function unknownSkills(skills, banco) {
  // ponytail: substring no banco inteiro; falso negativo raro ("Java" casa com "JavaScript"), aceitável para um aviso
  const b = norm(banco);
  return skills.filter((s) => !b.includes(norm(s)));
}

export function slugify(vaga) {
  const first = vaga.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const slug = norm(first).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return slug || 'vaga';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test lib.test.mjs`
Expected: `# pass 10`, `# fail 0`

- [ ] **Step 5: Commit** (só após autorização)

```bash
git add lib.mjs lib.test.mjs
git commit -m "feat: adiciona funções puras do adaptador com testes"
```

---

### Task 4: Regras do LLM (`prompt.md`) + CLI (`adaptar.mjs`)

**Files:**
- Create: `prompt.md`
- Create: `adaptar.mjs`
- Create: `exemplos/vaga-exemplo.txt`

**Interfaces:**
- Consumes: todas as funções de `lib.mjs` (Task 3); `base/curriculo.tex` (Task 2); `base/banco.md` (Task 1)
- Produces: `node adaptar.mjs <vaga.txt>` → `saidas/AAAA-MM-DD-<slug>/` com `vaga.txt`, `resposta.txt`, `Vinicius_Dutra_Curriculo.tex`, `Vinicius_Dutra_Curriculo.pdf`, `gupy.md`, `relatorio.md`. Exit 0 se compilou, 1 se não.

- [ ] **Step 1: Escrever `prompt.md`**

```markdown
Você é um especialista em recrutamento de desenvolvedores e em ATS (Gupy, Greenhouse, Lever, Workday). Sua tarefa é adaptar o currículo do Vinicius para a vaga em <vaga>, maximizando a aderência na triagem por IA e na leitura humana, **sem inventar nada**.

## Entradas
- <banco>: fonte da verdade. Todos os fatos, tecnologias, números e certificações permitidos.
- <corpo_base>: corpo LaTeX do currículo base (entre \begin{document} e \end{document}). Use os mesmos macros e a mesma estrutura.
- <vaga>: descrição da vaga.

## Regras de veracidade (inegociáveis)
1. Só use fatos, tecnologias e números que existem no <banco>. Pode reescrever, condensar, combinar e reordenar; não pode criar.
2. Itens marcados (CONFIRMAR) no banco não podem ser usados.
3. Se a vaga pede algo que não está no banco, NÃO coloque no currículo nem no gupy; liste em "Lacunas" no relatório.
4. Pode usar o termo da vaga no lugar de um sinônimo verdadeiro do banco (ex.: vaga diz "Node" e o banco diz "Node.js": escreva "Node.js"; vaga diz "mensageria" e o banco tem "filas": escreva "filas e mensageria"). Nunca troque uma tecnologia por outra diferente.
5. Datas, empresas, cargos e formação ficam exatamente como no banco.

## Regras de ATS e de conteúdo
- 1 página A4 obrigatória. Em média 4–6 bullets nos empregos atuais (Verden, NodeAIoT), 2–4 na Delta Global, 2–3 na Irriga Global, 1–2 na Prefeitura. Corte primeiro o que é menos relevante para a vaga.
- Linha de cargo do cabeçalho (`{\large ...}`): use o título da vaga se ele for coerente com a experiência (ex.: "Desenvolvedor Back-end PHP"), senão "Desenvolvedor Full-Stack".
- Resumo: 2–3 linhas, com as 6–10 palavras-chave mais importantes da vaga que o banco comprova, escritas como na vaga.
- Bullets: verbo de ação + o quê + com quê + resultado/escala quando o banco tiver número. Coloque primeiro os bullets que casam com os requisitos da vaga.
- Habilidades Técnicas: categorias em `\textbf{Categoria:} item, item \\`. Comece pelas tecnologias que a vaga pede. Só itens do banco, com a grafia do banco (ou a da vaga, se for a mesma tecnologia).
- Mantenha títulos de seção padrão. Se a vaga estiver em inglês, escreva tudo em inglês: Summary, Professional Experience, Technical Skills, Education, Certifications, datas `Feb 2026 -- Present`, cargos traduzidos (Full-Stack Developer, Intern).
- LaTeX: escape `%`, `&`, `#`, `_`, `$` como `\%`, `\&`, `\#`, `\_`, `\$`. Não use pacotes, cores, ícones, tabelas novas nem colunas. Não mexa no preâmbulo (você não o recebe).

## Formato de saída (exatamente estas três tags, nada fora delas importa)
<corpo>
(o corpo LaTeX completo, do cabeçalho `\begin{center}` até o fim da última seção, SEM \begin{document} e SEM \end{document})
</corpo>
<gupy>
## Habilidades
1. (até 30 habilidades do banco, em ordem de aderência à vaga, uma por linha, grafia da vaga quando for a mesma tecnologia)

## Experiências
### Empresa — Cargo
(descrição em texto corrido de 3–6 frases para colar no campo de descrição da experiência na Gupy: responsabilidades, entregas, ferramentas, resultados; com as palavras-chave da vaga que o banco comprova. Uma subseção por empresa, mesma ordem do currículo.)

## Resumo
(o mesmo resumo do currículo, em texto puro)
</gupy>
<relatorio>
## Aderência
(nota 0–10 e uma frase de justificativa)

## Palavras-chave da vaga cobertas
(lista)

## Lacunas
(requisitos da vaga que o banco não comprova, com obrigatório/desejável)

## Sugestões
(até 3 ações concretas: estudar X, adicionar ao banco Y se for verdade, destacar Z na entrevista)
</relatorio>
```

- [ ] **Step 2: Escrever `adaptar.mjs`**

```js
#!/usr/bin/env node
// Uso: node adaptar.mjs <vaga.txt>
// Gera saidas/AAAA-MM-DD-<slug>/ com o currículo adaptado (.tex/.pdf), gupy.md e relatorio.md.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitTemplate, assemble, parseResponse, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify } from './lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const vagaPath = process.argv[2];
if (!vagaPath) {
  console.error('Uso: node adaptar.mjs <vaga.txt>');
  process.exit(1);
}

const vaga = readFileSync(vagaPath, 'utf8');
const banco = readFileSync(join(root, 'base', 'banco.md'), 'utf8');
const instrucoes = readFileSync(join(root, 'prompt.md'), 'utf8');
const { preamble, body } = splitTemplate(readFileSync(join(root, 'base', 'curriculo.tex'), 'utf8'));

const outDir = join(root, 'saidas', `${new Date().toISOString().slice(0, 10)}-${slugify(vaga)}`);
mkdirSync(outDir, { recursive: true });
copyFileSync(vagaPath, join(outDir, 'vaga.txt'));

const prompt = `${instrucoes}\n\n<banco>\n${banco}\n</banco>\n\n<corpo_base>\n${body}\n</corpo_base>\n\n<vaga>\n${vaga}\n</vaga>\n`;

console.log('Gerando com o Claude (pode levar 1–2 min)...');
const llm = spawnSync('claude', ['-p', '--model', 'opus'], {
  input: prompt,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: process.platform === 'win32', // o claude do npm é um .cmd no Windows
});
if (llm.status !== 0) {
  console.error('claude -p falhou:', llm.stderr || llm.error);
  process.exit(1);
}
writeFileSync(join(outDir, 'resposta.txt'), llm.stdout); // resposta crua, pra depurar o parse

const r = parseResponse(llm.stdout);
const texFile = join(outDir, 'Vinicius_Dutra_Curriculo.tex');
writeFileSync(texFile, assemble(preamble, r.body));
writeFileSync(join(outDir, 'gupy.md'), `${r.gupy}\n`);

const latex = spawnSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', outDir, texFile], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
const paginas = pageCount(latex.stdout ?? '');
const desconhecidas = unknownSkills([...skillsFromTex(r.body), ...skillsFromGupy(r.gupy)], banco);

const avisos = [];
if (latex.status !== 0) avisos.push(`pdflatex falhou, veja ${join(outDir, 'Vinicius_Dutra_Curriculo.log')}`);
if (paginas !== null && paginas > 1) avisos.push(`PDF com ${paginas} páginas, esperado 1: corte bullets no .tex e recompile`);
if (desconhecidas.length) avisos.push(`habilidades fora do banco (pode ser invenção, revise): ${[...new Set(desconhecidas)].join(', ')}`);

writeFileSync(
  join(outDir, 'relatorio.md'),
  `${r.relatorio}\n\n## Avisos automáticos\n${avisos.map((a) => `- ${a}`).join('\n') || '- nenhum'}\n`,
);

console.log(`Pronto: ${outDir}`);
for (const a of avisos) console.warn(`AVISO: ${a}`);
process.exit(latex.status === 0 ? 0 : 1);
```

- [ ] **Step 3: Escrever `exemplos/vaga-exemplo.txt`** (de propósito com requisitos que você não tem, pra testar o "não inventar")

```text
Desenvolvedor(a) Full Stack Pleno — PHP/Laravel e React

Sobre a vaga
Buscamos pessoa desenvolvedora para evoluir nossa plataforma SaaS de logística, atuando do back-end ao front-end.

Requisitos obrigatórios
- Experiência sólida com PHP 8 e Laravel
- React com TypeScript
- PostgreSQL e modelagem de dados
- Construção e consumo de APIs RESTful e webhooks
- Filas e processamento assíncrono (Redis, Horizon ou similares)
- Testes automatizados (PHPUnit ou Pest)
- Git e code review

Diferenciais
- Kubernetes e AWS Lambda
- Experiência com integrações de pagamento (Pix)
- Docker e CI/CD com GitHub Actions
- Inglês intermediário

Modelo: remoto
```

- [ ] **Step 4: Rodar ponta a ponta**

Run: `node adaptar.mjs exemplos/vaga-exemplo.txt`
Expected: `Pronto: ...\saidas\2026-..-desenvolvedor-a-full-stack-pleno-php-laravel-e-rea` (slug cortado em 50 chars), exit 0, sem `AVISO` de páginas.

- [ ] **Step 5: Verificar o "não inventar" e o ATS**

Run: `node -e "const fs=require('fs');const d=process.argv[1];const t=fs.readFileSync(d+'/Vinicius_Dutra_Curriculo.tex','utf8')+fs.readFileSync(d+'/gupy.md','utf8');console.log(/kubernetes|lambda/i.test(t)?'FALHOU: inventou':'ok: nada inventado')" "saidas/<pasta gerada>"`
Expected: `ok: nada inventado`
E: `relatorio.md` lista Kubernetes, AWS Lambda e inglês em **Lacunas**; Laravel, React, TypeScript, PostgreSQL, webhooks, filas, PHPUnit e Pix em **cobertas**.
E: extração de texto do PDF gerado com o mesmo comando `pypdf` do Task 2, Step 3. Acentos íntegros, resumo começando com as palavras-chave da vaga.

- [ ] **Step 6: Commit** (só após autorização)

```bash
git add prompt.md adaptar.mjs exemplos/vaga-exemplo.txt
git commit -m "feat: adiciona CLI de adaptação do currículo por vaga"
```

---

### Task 5: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: comandos dos Tasks 0–4
- Produces: documentação de uso

- [ ] **Step 1: Escrever `README.md`**

````markdown
# Currículo

Currículo em LaTeX (ATS-friendly) + adaptador por vaga.

## Pré-requisitos
MiKTeX (`pdflatex`), Node 20+, Claude Code CLI logado (`claude`).

## Uso
1. Salve a descrição da vaga em um `.txt`.
2. `node adaptar.mjs caminho/da/vaga.txt`
3. Abra `saidas/<data>-<vaga>/`:
   - `Vinicius_Dutra_Curriculo.pdf`: envie este
   - `gupy.md`: cole as Habilidades (até 30) e as descrições de Experiência no seu perfil da Gupy; a ordenação da Gupy lê esses campos
   - `relatorio.md`: aderência, lacunas e avisos (leia os avisos antes de enviar)

## Manter atualizado
- Fato novo (projeto, métrica, tecnologia) → `base/banco.md`. O adaptador só usa o que está lá.
- Mudança de visual → preâmbulo de `base/curriculo.tex` (vale pra todas as gerações).
- Currículo base: `mkdir -p saidas/base && pdflatex -interaction=nonstopmode -output-directory saidas/base base/curriculo.tex`
- Testes: `node --test`
````

- [ ] **Step 2: Verificar** `node --test` → Expected: `# pass 10`

- [ ] **Step 3: Commit** (só após autorização)

```bash
git add README.md
git commit -m "docs: adiciona README de uso"
```
