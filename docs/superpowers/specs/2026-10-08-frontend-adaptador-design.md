# Frontend do adaptador de currículo — Design

Data: 2026-10-08 · Status: aprovado pelo Vinicius

## Objetivo
Interface web local para o que hoje é o CLI `node adaptar.mjs vaga.txt`, mais duas formas de alimentar o `base/banco.md`: upload de um currículo em PDF e texto livre. Clean, bonita, sem dependências.

## Decisões
- **Stack:** servidor `node:http` (stdlib) + uma página `web/index.html` com HTML/CSS/JS vanilla. Zero npm, zero build. Roda com `node servidor.mjs`, escuta só em `127.0.0.1:3000`.
- **Visual:** fonte do sistema, espaçamento generoso, 1 cor de destaque, tema claro/escuro por `prefers-color-scheme`, layout que funciona em 360px de largura.
- **Upload de currículo** = extrair fatos novos para o banco (não troca o template LaTeX).
- **Adicionar experiências** = texto livre; o Claude encaixa no banco. Sempre com revisão humana antes de salvar.
- **Histórico** = lista das pastas de `saidas/`, só leitura.

## Arquitetura
- `adaptar.mjs` vira módulo: exporta `gerar(vaga: string) => { outDir, avisos, status }`. Executado direto (`node adaptar.mjs vaga.txt`) mantém o comportamento atual do CLI.
- `banco.mjs`: `proporBanco({ texto?, pdfPath? }) => { resumo, banco }`. Uma chamada `claude -p`; com PDF usa `--allowedTools Read` e passa o caminho do arquivo.
- `prompt-banco.md`: regras da extração (não inventar, só adicionar o que está na fonte, apontar duplicatas, não alterar conteúdo existente sem dizer, manter o formato do banco, grafia canônica nas Habilidades).
- `lib.mjs` ganha funções puras: `safeJoin(base, rel)` (bloqueia path traversal), `listarSaidas(nomes)` (ordena e formata o histórico), `promptBanco(...)`.
- `servidor.mjs`: rotas abaixo + arquivos estáticos de `web/`.

## Rotas
| Método e rota | Entrada | Saída |
|---|---|---|
| `GET /` | — | `web/index.html` |
| `GET /api/historico` | — | `[{ pasta, data, titulo }]`, mais recente primeiro |
| `GET /saidas/<pasta>/<arquivo>` | — | PDF, `gupy.md`, `relatorio.md`, `vaga.txt` (só nomes dessa lista) |
| `POST /api/gerar` | texto da vaga (text/plain) | `{ pasta, avisos, status }`; `409` se já houver uma geração rodando |
| `POST /api/banco/propor` | text/plain (texto livre) ou application/pdf (bytes) | `{ resumo, banco }` |
| `GET /api/banco` | — | conteúdo atual do `banco.md` |
| `PUT /api/banco` | texto completo revisado | `204`; grava `base/banco.md` |

Uma operação com Claude por vez (geração ou proposta), bloqueio simples em memória. Corpo de requisição limitado a 10 MB.

## Tela
- **Lateral:** histórico; clique abre o resultado da vaga.
- **Aba "Nova vaga":** textarea + "Gerar"; estado "gerando…" (~1 min); resultado com PDF embutido (`<iframe>`) + link de download, texto da Gupy com "Copiar" por seção (`##`/`###`), relatório renderizado (nota em destaque, avisos em amarelo).
- **Aba "Atualizar banco":** upload de PDF ou textarea de texto livre → "Propor" → resumo das novidades + textarea editável com o banco novo → "Salvar" ou "Descartar".
- **Aba "Banco":** banco.md atual, só leitura.

## Erros
Falha do `claude` ou do `pdflatex` → mensagem na tela com o caminho do log; texto digitado é mantido. `409` mostra "já tem uma geração rodando".

## Testes
`node:test` para `safeJoin`, `listarSaidas`, `promptBanco`. Fluxos reais (gerar, propor com texto, propor com PDF, salvar) verificados uma vez manualmente no navegador.

## Fora do escopo
Autenticação, deploy, edição do template LaTeX pela página, múltiplos usuários, fila de gerações.
