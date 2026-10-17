# Currículo

Busca vagas de emprego e gera, para cada uma, um currículo em PDF adaptado à vaga e legível por ATS, usando só fatos que você mesmo cadastrou. Roda na sua máquina, com a sua chave de IA.

## O que ele faz

- **Encontra vagas** a cada 1 h:
  - de onde vêm: Gupy, Himalayas, os repositórios de vagas do GitHub (`backend-br`, `frontendbr`, `react-brasil`) e, pela busca web da IA, LinkedIn, Indeed, Catho e InfoJobs;
  - filtros: as suas preferências (modalidade, cidade, área, nível, prazo desde a publicação);
  - a mesma vaga encontrada em vários sites aparece uma vez só.
- **Avalia cada vaga**: dá uma nota de aderência ao seu perfil, lista os requisitos, aponta o que não está claro e descarta o que claramente não serve.
- **Gera o currículo adaptado**:
  - um PDF de 1 página em LaTeX, mais textos prontos para colar na Gupy e um relatório com lacunas e sugestões;
  - nunca inventa: só usa o seu **banco de fatos**, e avisa quando aparece habilidade que não está nele.
- **Mostra a pontuação ATS**: nota de 0 a 100, palavras-chave da vaga que o currículo cobre (pontos fortes) e as que faltam (pontos fracos).
- **Candidata por e-mail**, nas vagas que pedem isso:
  - a IA escreve o e-mail e você revisa;
  - o envio sai da sua conta do Gmail, com o PDF anexado.
- **Registra o que você já aplicou**: marcação manual ou automática quando o envio é por e-mail.

## Como rodar

### Requisitos
- [Node.js](https://nodejs.org) 24 ou mais novo. Não tem `npm install`: o projeto não tem dependências.
- Uma distribuição LaTeX com `pdflatex`:
  - Windows: [MiKTeX](https://miktex.org) (na primeira geração ele pede para instalar alguns pacotes; aceite);
  - macOS: MacTeX;
  - Linux: `texlive-latex-extra`.
- Uma API key de IA (Anthropic, OpenAI ou DeepSeek) **ou** os CLIs `claude` e Command Code instalados e logados.

### Subir
```bash
git clone <url-do-repositório> curriculo
cd curriculo
node servidor.mjs
```
Abra http://localhost:3000. O servidor só aceita acesso desta máquina.

Para subir sem a busca automática de vagas (não gasta IA com o buscador):
```bash
BUSCADOR=0 node servidor.mjs
```
No PowerShell: `$env:BUSCADOR=0; node servidor.mjs`. Para outra porta, use `PORT=3001`.

## Primeira configuração

Na primeira vez, a aba **Vagas** mostra os **Primeiros passos**. Siga na ordem.

### 1. Provedores de IA (aba Configuração)
Escolha o provedor, o modelo e a API key de cada função:

| Função | O que faz | Provedores |
|---|---|---|
| **Busca web** (opcional) | Procura vagas no LinkedIn, Indeed, Catho e InfoJobs pela web | Anthropic, OpenAI, CLI local |
| **Analista de vagas** | Dá a nota de aderência e extrai as palavras-chave do ATS | Todos |
| **Gerador de currículo** | Escreve o currículo e o e-mail e monta o banco a partir do seu PDF | Todos (DeepSeek não lê PDF) |

- Onde pegar a chave: [console.anthropic.com](https://console.anthropic.com), [platform.openai.com](https://platform.openai.com) ou [platform.deepseek.com](https://platform.deepseek.com).
- O modelo vem preenchido com um padrão; troque se quiser.
- Sugestão de custo: um modelo mais barato no analista, que roda o tempo todo, e o melhor no gerador.
- Sem a busca web, o buscador continua usando Gupy, Himalayas e GitHub, que não precisam de IA.
- **CLI local** usa o `claude` (assinatura) e o Command Code instalados na máquina, sem API key.

As chaves ficam só em `dados/config.json`, na sua máquina, e a tela mostra apenas os 4 últimos caracteres.

### 2. Banco de fatos (aba Atualizar banco)
É a fonte da verdade do currículo: contato, formação, experiências, habilidades e idiomas.

1. Envie o PDF do seu currículo atual, ou descreva o que você fez em texto.
2. O gerador propõe o banco preenchido.
3. Revise, corrija e salve.

Depois, edite quando quiser na aba **Banco de fatos**. Escreva também as **Lacunas conhecidas**: o que você não sabe e o relatório deve apontar quando a vaga pedir. Quanto mais completo o banco, melhor o currículo.

### 3. Preferências de busca (lateral da aba Vagas)
- **Obrigatórios:**
  - termos de busca (ex.: `desenvolvedor, developer`);
  - modalidades;
  - cidade, se aceitar híbrido ou presencial.
- **Em "Todas as opções":**
  - palavras de área;
  - níveis a excluir e exceções;
  - países aceitos para vagas remotas;
  - prazo máximo desde a publicação (padrão 5 dias);
  - observações para o avaliador.

Listas são separadas por vírgula. A comparação não diferencia acento nem maiúsculas, e `*` no fim casa prefixo (`desenvolv*`).

### 4. Gmail (opcional, para candidatar por e-mail)
1. Ative a verificação em 2 etapas na Conta Google.
2. Crie uma senha de app em https://myaccount.google.com/apppasswords.
3. Copie `.env.exemplo` para `.env` e preencha `GMAIL_USUARIO` e `GMAIL_SENHA_APP`.
4. Reinicie o servidor.

O e-mail só é enviado quando você clica em enviar, e cada vaga só pode receber uma candidatura.

## Uso do dia a dia

- **Vagas**:
  - mostra as novas primeiro;
  - tem filtros por texto, modalidade, site, idade, nota e "Aplicadas", além de ordenação e paginação;
  - no card da vaga ficam os botões **Gerar currículo**, **Candidatar por e-mail**, **Já me candidatei** e **Descartar**.
- **Nova vaga**: cole a descrição de qualquer vaga para gerar o currículo. O resultado traz:
  - o PDF;
  - a nota de aderência e a pontuação ATS;
  - os avisos;
  - os blocos para a Gupy, com botão "Copiar".
- **Currículos gerados** (lateral): reabre qualquer geração anterior.

Pela linha de comando: `node adaptar.mjs vaga.txt` gera o currículo, e `node buscador.mjs` roda um ciclo de busca avulso.

### Arquivos de cada geração (`saidas/<data>-<vaga>/`)
- `<Seu_Nome>_Curriculo.pdf`: o currículo para enviar. O `.tex` ao lado pode ser editado e recompilado com `pdflatex`.
- `gupy.md`: as habilidades, em ordem de aderência, e as descrições de experiência para o perfil da Gupy.
- `relatorio.md`: aderência, palavras-chave cobertas, lacunas, sugestões e avisos automáticos. Leia os avisos antes de enviar.
- `ats.json`: as palavras-chave da vaga usadas na pontuação.

### Pontuação ATS
- Quem extrai as palavras-chave da vaga: a IA, uma vez só.
- Como a nota sai: é calculada no código, lendo o `.tex` atual. Uma palavra obrigatória vale 2 e uma desejável vale 1, então editar o `.tex` muda a nota.
- Currículos antigos: aparecem com o botão **Calcular pontuação**.

## Onde ficam os seus dados

Nada pessoal vai para o git.

| Caminho | Conteúdo |
|---|---|
| `dados/perfil/banco.md` | Banco de fatos (criado a partir de `base/banco.exemplo.md`) |
| `dados/perfil/preferencias.json` | Preferências de busca (criado a partir de `base/preferencias.exemplo.json`) |
| `dados/config.json` | Provedores e API keys |
| `dados/vagas.json` | Vagas encontradas, avaliações e candidaturas |
| `saidas/` | Currículos gerados |
| `.env` | Gmail |

Para começar do zero, apague `dados/perfil/`: os modelos em branco são copiados de novo.

## Para quem vai mexer no código

- **Stack:** Node.js puro (ESM, só a biblioteca padrão), front-end em um único `web/index.html` e LaTeX.
- **Mapa dos arquivos:**

| Arquivo | Papel |
|---|---|
| `servidor.mjs` | API HTTP e interface (localhost:3000) |
| `ia.mjs` | Camada de provedores: `perguntar(funcao, prompt)` chama Anthropic, OpenAI, DeepSeek ou os CLIs |
| `perfil.mjs` | Caminhos de `dados/perfil/` e nome do candidato |
| `adaptar.mjs` + `prompt.md` | Geração do currículo; compila e condensa até caber em 1 página |
| `buscador.mjs`, `fontes.mjs`, `avaliar.mjs` | Ciclo do buscador, fontes de vagas e avaliação |
| `ats.mjs` | Pontuação ATS |
| `candidatura.mjs`, `smtp.mjs`, `email-lib.mjs` | Candidatura por e-mail |
| `banco.mjs` + `prompt-banco.md` | Proposta de banco a partir de texto ou PDF |
| `base/modelo.tex` | Preâmbulo e formato do currículo; mudanças de visual vão aqui |

- **Testes:** `node --test`.
- **Busca web pelo CLI local:** o Command Code roda isolado numa pasta temporária, só com as ferramentas web liberadas (ver `commandcode.mjs`).
