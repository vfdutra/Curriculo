# Frontend do Adaptador de Currículo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Neste ambiente:** execução via skill `cc-executor` (regra do `~/.claude/CLAUDE.md`). Todo passo "Commit" = propor e esperar o "pode commitar" do Vinicius.

**Goal:** Página web local (`node servidor.mjs` → http://localhost:3000) para gerar o currículo por vaga, ver o histórico e atualizar o `base/banco.md` por upload de PDF ou texto livre, sempre com revisão antes de salvar.

**Architecture:** Servidor `node:http` sem dependências, que serve `web/index.html` (HTML+CSS+JS vanilla num arquivo) e uma API JSON. A geração reaproveita a lógica do CLI, que vira a função `gerar()` exportada por `adaptar.mjs`. A proposta de banco é `banco.mjs` → `claude -p` com as regras de `prompt-banco.md`. A chamada ao Claude passa a ser assíncrona (`claude.mjs`) para não travar o servidor durante ~1 min.

**Tech Stack:** Node.js 24 stdlib (`node:http`, `node:fs/promises`, `node:child_process`, `node:test`), Claude Code CLI (`claude -p`), pdfLaTeX (MiKTeX).

Spec: `docs/superpowers/specs/2026-10-08-frontend-adaptador-design.md`

## Global Constraints

- Zero dependências npm, zero build. Só stdlib.
- Servidor escuta só em `127.0.0.1`, porta `process.env.PORT || 3000`.
- Toda requisição com `Host` fora de `localhost`/`127.0.0.1`, ou com `Origin` que não seja `http://localhost[:porta]`/`http://127.0.0.1[:porta]`, recebe `403`.
- Corpo de requisição máximo de 10 MB (`413` acima disso).
- Uma operação com Claude por vez (geração ou proposta de banco); a segunda recebe `409`.
- `/saidas/<pasta>/<arquivo>` só serve `Vinicius_Dutra_Curriculo.pdf`, `gupy.md`, `relatorio.md`, `vaga.txt`, e só caminhos dentro de `saidas/`.
- Nada é gravado no `banco.md` sem o clique "Salvar" do usuário.
- O CLI `node adaptar.mjs <vaga.txt>` continua funcionando igual (mesmas mensagens, mesmo exit code).
- Estilo do código igual ao existente: ESM, 2 espaços, aspas simples, comentários curtos em português.

## File Structure

```
lib.mjs            (modificar) + safeJoin, listarSaidas, promptBanco, origemLocal
lib.test.mjs       (modificar) + testes das 4 funções
claude.mjs         (criar)     askClaude assíncrono
adaptar.mjs        (modificar) vira módulo: export async gerar(); CLI só quando executado direto
prompt-banco.md    (criar)     regras da extração de fatos para o banco
banco.mjs          (criar)     export async proporBanco({ texto | pdfPath })
servidor.mjs       (criar)     HTTP + API + arquivos estáticos
web/index.html     (criar)     a página inteira
README.md          (modificar) seção "Interface web"
```

---

### Task 1: Funções puras novas em `lib.mjs`

**Files:**
- Modify: `lib.mjs` (acrescentar no fim, mais um import no topo)
- Test: `lib.test.mjs` (acrescentar no fim, ampliar o import)

**Interfaces:**
- Consumes: nada
- Produces:
  - `safeJoin(base: string, ...parts: string[]) => string | null`: caminho absoluto se ficar dentro de `base`, senão `null`
  - `listarSaidas(entradas: { nome: string, mtimeMs: number }[]) => { pasta: string, data: string, titulo: string }[]`: só nomes `AAAA-MM-DD-...`, ordenados por `mtimeMs` decrescente
  - `promptBanco(instrucoes: string, banco: string, fonte: { texto?: string, pdfPath?: string }) => string`: lança erro sem texto nem pdfPath
  - `origemLocal(headers: { host?: string, origin?: string }) => boolean`

- [ ] **Step 1: Acrescentar os testes ao fim de `lib.test.mjs`** e trocar a linha de import do topo por:

```js
import { splitTemplate, assemble, parseResponse, pickTag, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify, safeJoin, listarSaidas, promptBanco, origemLocal } from './lib.mjs';
```

Testes (fim do arquivo):

```js
test('safeJoin aceita caminho dentro da base e recusa saída dela', () => {
  assert.ok(safeJoin('/tmp/saidas', '2026-10-08-x', 'gupy.md').endsWith('gupy.md'));
  assert.equal(safeJoin('/tmp/saidas', '..', 'base'), null);
  assert.equal(safeJoin('/tmp/saidas', 'a/../../segredo'), null);
  assert.equal(safeJoin('/tmp/saidas', '/etc/passwd'), null);
});

test('listarSaidas filtra pastas de geração e ordena da mais recente', () => {
  const r = listarSaidas([
    { nome: '2026-10-08-dev-php', mtimeMs: 2 },
    { nome: '_uploads', mtimeMs: 9 },
    { nome: '2026-10-07-dev-react', mtimeMs: 5 },
    { nome: 'base', mtimeMs: 1 },
  ]);
  assert.deepEqual(r, [
    { pasta: '2026-10-07-dev-react', data: '2026-10-07', titulo: 'dev react' },
    { pasta: '2026-10-08-dev-php', data: '2026-10-08', titulo: 'dev php' },
  ]);
});

test('promptBanco monta a fonte de texto ou de PDF', () => {
  const t = promptBanco('REGRAS', 'BANCO', { texto: 'fiz X' });
  assert.ok(t.startsWith('REGRAS'));
  assert.ok(t.includes('<banco>\nBANCO\n</banco>'));
  assert.ok(t.includes('<fonte>\nfiz X\n</fonte>'));
  const p = promptBanco('REGRAS', 'BANCO', { pdfPath: 'C:/x/cv.pdf' });
  assert.ok(p.includes('C:/x/cv.pdf'));
  assert.match(p, /Leia o currículo em PDF/);
  assert.throws(() => promptBanco('R', 'B', {}), /texto ou pdfPath/);
});

test('origemLocal só aceita host e origin locais', () => {
  assert.equal(origemLocal({ host: 'localhost:3000' }), true);
  assert.equal(origemLocal({ host: '127.0.0.1:3000', origin: 'http://localhost:3000' }), true);
  assert.equal(origemLocal({ host: 'evil.com' }), false);
  assert.equal(origemLocal({ host: 'localhost:3000', origin: 'https://evil.com' }), false);
  assert.equal(origemLocal({ host: 'localhost:3000', origin: 'null' }), false);
  assert.equal(origemLocal({}), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test lib.test.mjs`
Expected: FAIL (`safeJoin` etc. não exportados: `does not provide an export named`)

- [ ] **Step 3: Implementar em `lib.mjs`.** No topo, depois do comentário da primeira linha:

```js
import { resolve, sep } from 'node:path';
```

No fim do arquivo:

```js
export function safeJoin(base, ...parts) {
  const raiz = resolve(base);
  const p = resolve(raiz, ...parts);
  return p === raiz || p.startsWith(raiz + sep) ? p : null;
}

export function listarSaidas(entradas) {
  return entradas
    .filter((e) => /^\d{4}-\d{2}-\d{2}-.+/.test(e.nome))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ nome }) => ({ pasta: nome, data: nome.slice(0, 10), titulo: nome.slice(11).replace(/-/g, ' ') }));
}

export function promptBanco(instrucoes, banco, { texto, pdfPath } = {}) {
  if (!texto && !pdfPath) throw new Error('informe texto ou pdfPath');
  const fonte = pdfPath ? `Leia o currículo em PDF no arquivo: ${pdfPath}` : texto;
  return `${instrucoes}\n\n<banco>\n${banco}\n</banco>\n\n<fonte>\n${fonte}\n</fonte>\n`;
}

const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

export function origemLocal({ host = '', origin } = {}) {
  // bloqueia DNS rebinding (Host) e sites de fora disparando requisições (Origin)
  if (!LOCAL.test(host)) return false;
  if (origin === undefined) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && LOCAL.test(u.host);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test lib.test.mjs`
Expected: `# pass 15`, `# fail 0`

- [ ] **Step 5: Commit** (só após autorização)

```bash
git add lib.mjs lib.test.mjs
git commit -m "feat: adiciona funções puras para o servidor web"
```

---

### Task 2: `claude.mjs` assíncrono e `adaptar.mjs` como módulo

**Files:**
- Create: `claude.mjs`
- Modify: `adaptar.mjs` (reescrita completa abaixo)

**Interfaces:**
- Consumes: de `lib.mjs`: `splitTemplate, assemble, parseResponse, pickTag, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify` (já existem)
- Produces:
  - `askClaude(prompt: string, opts?: { args?: string[], cwd?: string }) => Promise<string>`: stdout; rejeita com `Error('claude -p falhou (código N): <stderr>')`
  - `gerar(vaga: string, log?: (msg: string) => void) => Promise<{ pasta: string, outDir: string, avisos: string[], status: number | null }>`

- [ ] **Step 1: Criar `claude.mjs`**

```js
// Chamada ao Claude Code em modo headless (usa a assinatura, sem API key). Assíncrona para não travar o servidor.
import { spawn } from 'node:child_process';

export function askClaude(prompt, { args = [], cwd } = {}) {
  return new Promise((ok, falha) => {
    const p = spawn('claude', ['-p', '--model', 'opus', ...args], {
      cwd,
      shell: process.platform === 'win32', // o claude do npm é um .cmd no Windows
    });
    let out = '';
    let err = '';
    p.stdout.setEncoding('utf8').on('data', (c) => (out += c));
    p.stderr.setEncoding('utf8').on('data', (c) => (err += c));
    p.on('error', falha);
    p.on('close', (code) => {
      if (code === 0) ok(out);
      else falha(new Error(`claude -p falhou (código ${code}): ${err.trim() || out.trim()}`));
    });
    p.stdin.end(prompt, 'utf8');
  });
}
```

- [ ] **Step 2: Reescrever `adaptar.mjs` inteiro**

```js
#!/usr/bin/env node
// Uso: node adaptar.mjs <vaga.txt>  ·  ou: import { gerar } from './adaptar.mjs'
// Gera saidas/AAAA-MM-DD-<slug>/ com o currículo adaptado (.tex/.pdf), gupy.md e relatorio.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askClaude } from './claude.mjs';
import { splitTemplate, assemble, parseResponse, pickTag, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify } from './lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));

export async function gerar(vaga, log = console.log) {
  const banco = readFileSync(join(root, 'base', 'banco.md'), 'utf8');
  const instrucoes = readFileSync(join(root, 'prompt.md'), 'utf8');
  const { preamble, body: corpoBase } = splitTemplate(readFileSync(join(root, 'base', 'curriculo.tex'), 'utf8'));

  const pasta = `${new Date().toISOString().slice(0, 10)}-${slugify(vaga)}`;
  const outDir = join(root, 'saidas', pasta);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'vaga.txt'), vaga);

  const prompt = `${instrucoes}\n\n<banco>\n${banco}\n</banco>\n\n<corpo_base>\n${corpoBase}\n</corpo_base>\n\n<vaga>\n${vaga}\n</vaga>\n`;

  log('Gerando com o Claude (pode levar 1–2 min)...');
  const out = await askClaude(prompt);
  writeFileSync(join(outDir, 'resposta.txt'), out); // resposta crua, pra depurar o parse

  const r = parseResponse(out);
  const texFile = join(outDir, 'Vinicius_Dutra_Curriculo.tex');
  writeFileSync(texFile, assemble(preamble, r.body));
  writeFileSync(join(outDir, 'gupy.md'), `${r.gupy}\n`);

  // ponytail: pdflatex síncrono (~2 s) trava o servidor esse tempo; aceitável para uso local
  const compile = () => {
    const latex = spawnSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', outDir, texFile], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    return { status: latex.status, paginas: pageCount(latex.stdout ?? '') };
  };

  let result = compile();
  let body = r.body;
  for (let i = 1; i <= 2 && result.paginas > 1; i++) {
    const ajuste = `${instrucoes}\n\n<banco>\n${banco}\n</banco>\n\n<corpo_atual>\n${body}\n</corpo_atual>\n\n<vaga>\n${vaga}\n</vaga>\n\nAJUSTE: o corpo_atual compilou em ${result.paginas} páginas A4 e precisa caber em 1. Condense ou remova os bullets menos relevantes para a vaga, começando pelos empregos mais antigos e pelos bullets que quebram em 2 linhas, até caber em 1 página. Mantenha todas as regras acima. Responda SOMENTE com <corpo>...</corpo>.`;
    log(`PDF com ${result.paginas} páginas, condensando (tentativa ${i}/2)...`);
    const ajusteOut = await askClaude(ajuste);
    writeFileSync(join(outDir, `resposta-ajuste-${i}.txt`), ajusteOut);
    body = pickTag(ajusteOut, 'corpo');
    writeFileSync(texFile, assemble(preamble, body));
    result = compile();
  }

  const desconhecidas = unknownSkills([...skillsFromTex(body), ...skillsFromGupy(r.gupy)], banco);

  const avisos = [];
  if (result.status !== 0) avisos.push(`pdflatex falhou, veja ${join(outDir, 'Vinicius_Dutra_Curriculo.log')}`);
  if (result.paginas !== null && result.paginas > 1) avisos.push(`PDF com ${result.paginas} páginas, esperado 1: corte bullets no .tex e recompile`);
  if (desconhecidas.length) avisos.push(`habilidades fora do banco (pode ser invenção, revise): ${[...new Set(desconhecidas)].join(', ')}`);

  writeFileSync(
    join(outDir, 'relatorio.md'),
    `${r.relatorio}\n\n## Avisos automáticos\n${avisos.map((a) => `- ${a}`).join('\n') || '- nenhum'}\n`,
  );

  return { pasta, outDir, avisos, status: result.status };
}

// CLI: só roda quando o arquivo é executado direto, não quando o servidor importa
const executadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (executadoDireto) {
  const vagaPath = process.argv[2];
  if (!vagaPath) {
    console.error('Uso: node adaptar.mjs <vaga.txt>');
    process.exit(1);
  }
  try {
    const r = await gerar(readFileSync(vagaPath, 'utf8'));
    console.log(`Pronto: ${r.outDir}`);
    for (const a of r.avisos) console.warn(`AVISO: ${a}`);
    process.exit(r.status === 0 ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Verificar**

Run: `node --check claude.mjs && node --check adaptar.mjs`
Expected: sem saída
Run: `node adaptar.mjs` → Expected: `Uso: node adaptar.mjs <vaga.txt>`, exit 1
Run: `node -e "import('./adaptar.mjs').then(m => console.log(typeof m.gerar))"` → Expected: `function` (e nenhuma mensagem de uso: importar não executa o CLI)

- [ ] **Step 4: Commit** (só após autorização)

```bash
git add claude.mjs adaptar.mjs
git commit -m "refactor: expõe gerar() e torna a chamada ao Claude assíncrona"
```

---

### Task 3: Proposta de banco (`prompt-banco.md` + `banco.mjs`)

**Files:**
- Create: `prompt-banco.md`
- Create: `banco.mjs`

**Interfaces:**
- Consumes: `askClaude` (Task 2, `claude.mjs`); `promptBanco`, `pickTag` (Task 1 / existente, `lib.mjs`)
- Produces: `proporBanco(fonte: { texto?: string, pdfPath?: string }) => Promise<{ resumo: string, banco: string }>`. Não grava nada.

- [ ] **Step 1: Criar `prompt-banco.md`**

```markdown
Você mantém o banco de fatos do currículo do Vinicius (<banco>). Recebeu uma fonte nova (<fonte>): um texto livre escrito por ele ou um currículo em PDF. Sua tarefa é devolver o banco atualizado com o que a fonte traz de NOVO, sem inventar nada.

## Regras (inegociáveis)
1. Só acrescente o que está explícito na <fonte>. Não deduza números, tecnologias, cargos, datas ou resultados.
2. Não remova nem reescreva conteúdo existente. Exceção: se a fonte corrige um fato (ex.: uma data), altere e liste em "Alterado".
3. Duplicata: se o fato já existe no banco com outras palavras, não adicione; liste em "Já existia".
4. Encaixe cada fato novo na experiência certa (seção `### Empresa — Cargo — Cidade — Período`), no mesmo estilo dos bullets que já estão lá.
5. Empresa nova: crie a seção no mesmo formato só se a fonte trouxer empresa, cargo e período; senão liste em "Precisa de informação" o que faltou.
6. Tecnologia nova: acrescente na linha de "## Habilidades" da categoria certa, com a grafia oficial (ex.: Node.js, PostgreSQL, Next.js).
7. Número ou métrica sem certeza (ex.: "uns 30%"): acrescente com a marca (CONFIRMAR).
8. Preserve exatamente títulos, ordem das seções, formato e todo o resto do banco.
9. Se a fonte for um PDF, leia o arquivo indicado com a ferramenta Read antes de responder.

## Formato de saída (exatamente estas duas tags)
<resumo>
## Adicionado
- (cada fato novo e onde entrou; "nada" se nenhum)

## Alterado
- (cada correção; "nada" se nenhuma)

## Já existia
- (fatos da fonte que o banco já tinha)

## Precisa de informação
- (o que não entrou por falta de dado; "nada" se nada)
</resumo>
<banco>
(o banco.md COMPLETO e atualizado, do título "# Banco de fatos" até o fim)
</banco>
```

- [ ] **Step 2: Criar `banco.mjs`**

```js
// Propõe um banco.md atualizado a partir de texto livre ou de um currículo em PDF. Não grava nada: quem salva é o usuário.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askClaude } from './claude.mjs';
import { promptBanco, pickTag } from './lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));

export async function proporBanco({ texto, pdfPath } = {}) {
  const banco = readFileSync(join(root, 'base', 'banco.md'), 'utf8');
  const instrucoes = readFileSync(join(root, 'prompt-banco.md'), 'utf8');
  const prompt = promptBanco(instrucoes, banco, { texto, pdfPath });
  // com PDF, o Claude precisa da ferramenta Read para abrir o arquivo
  const out = await askClaude(prompt, { cwd: root, args: pdfPath ? ['--allowedTools', 'Read'] : [] });
  return { resumo: pickTag(out, 'resumo'), banco: `${pickTag(out, 'banco')}\n` };
}
```

- [ ] **Step 3: Verificar**

Run: `node --check banco.mjs`
Expected: sem saída
Run: `node -e "import('./banco.mjs').then(m => console.log(typeof m.proporBanco))"` → Expected: `function`

- [ ] **Step 4: Commit** (só após autorização)

```bash
git add prompt-banco.md banco.mjs
git commit -m "feat: propõe atualização do banco a partir de texto ou PDF"
```

---

### Task 4: Servidor (`servidor.mjs`)

**Files:**
- Create: `servidor.mjs`

**Interfaces:**
- Consumes: `gerar` (Task 2), `proporBanco` (Task 3), `safeJoin`, `listarSaidas`, `origemLocal` (Task 1)
- Produces: a API do spec, consumida pelo `web/index.html` (Task 5):
  - `GET /` → HTML
  - `GET /api/historico` → `[{ pasta, data, titulo }]`
  - `GET /saidas/<pasta>/<arquivo>` → arquivo (só a lista permitida)
  - `POST /api/gerar` (text/plain) → `{ pasta, avisos, status }`
  - `POST /api/banco/propor` (text/plain ou application/pdf) → `{ resumo, banco }`
  - `GET /api/banco` → text/markdown
  - `PUT /api/banco` (text/plain) → `204`
  - Erros sempre `{ erro: string }` com status 400/403/404/409/413/500

- [ ] **Step 1: Criar `servidor.mjs`**

```js
#!/usr/bin/env node
// Uso: node servidor.mjs  →  http://localhost:3000 (só local)
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerar } from './adaptar.mjs';
import { proporBanco } from './banco.mjs';
import { safeJoin, listarSaidas, origemLocal } from './lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const saidas = join(root, 'saidas');
const bancoPath = join(root, 'base', 'banco.md');
const PORT = Number(process.env.PORT) || 3000;
const LIMITE = 10 * 1024 * 1024;
const ARQUIVOS = new Set(['Vinicius_Dutra_Curriculo.pdf', 'gupy.md', 'relatorio.md', 'vaga.txt']);
const TIPOS = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

let ocupado = false; // ponytail: uma operação com Claude por vez; fila só se um dia tiver vários usuários

const falha = (status, msg) => Object.assign(new Error(msg), { status });

const json = (res, status, dados) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
};

function lerCorpo(req) {
  return new Promise((ok, erro) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE) {
        erro(falha(413, 'Arquivo maior que 10 MB.'));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', erro);
  });
}

async function comClaude(res, fn) {
  if (ocupado) return json(res, 409, { erro: 'Já tem uma operação com o Claude rodando. Espere terminar.' });
  ocupado = true;
  try {
    json(res, 200, await fn());
  } finally {
    ocupado = false;
  }
}

const rotas = {
  'GET /': async (req, res) => {
    res.writeHead(200, { 'content-type': TIPOS['.html'] });
    res.end(await readFile(join(root, 'web', 'index.html')));
  },

  'GET /api/historico': async (req, res) => {
    const nomes = await readdir(saidas).catch(() => []);
    const entradas = await Promise.all(nomes.map(async (nome) => ({ nome, mtimeMs: (await stat(join(saidas, nome))).mtimeMs })));
    json(res, 200, listarSaidas(entradas));
  },

  'GET /api/banco': async (req, res) => {
    res.writeHead(200, { 'content-type': TIPOS['.md'] });
    res.end(await readFile(bancoPath));
  },

  'PUT /api/banco': async (req, res) => {
    const texto = (await lerCorpo(req)).toString('utf8');
    if (!texto.includes('# Banco de fatos')) throw falha(400, 'Conteúdo não parece o banco.md (falta o título "# Banco de fatos").');
    await writeFile(bancoPath, texto);
    res.writeHead(204);
    res.end();
  },

  'POST /api/gerar': (req, res) =>
    comClaude(res, async () => {
      const vaga = (await lerCorpo(req)).toString('utf8');
      if (!vaga.trim()) throw falha(400, 'Cole a descrição da vaga.');
      const r = await gerar(vaga, () => {});
      return { pasta: r.pasta, avisos: r.avisos, status: r.status };
    }),

  'POST /api/banco/propor': (req, res) =>
    comClaude(res, async () => {
      const dados = await lerCorpo(req);
      if (!dados.length) throw falha(400, 'Envie um PDF ou escreva o que você fez.');
      if ((req.headers['content-type'] || '').startsWith('application/pdf')) {
        if (dados.subarray(0, 4).toString('latin1') !== '%PDF') throw falha(400, 'O arquivo não é um PDF.');
        await mkdir(join(saidas, '_uploads'), { recursive: true });
        const pdfPath = join(saidas, '_uploads', `${Date.now()}.pdf`);
        await writeFile(pdfPath, dados);
        return proporBanco({ pdfPath });
      }
      return proporBanco({ texto: dados.toString('utf8') });
    }),
};

async function servirSaida(res, pasta, arquivo) {
  const caminho = ARQUIVOS.has(arquivo) && safeJoin(saidas, pasta, arquivo);
  if (!caminho) throw falha(404, 'Não encontrado.');
  const conteudo = await readFile(caminho);
  res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] });
  res.end(conteudo);
}

createServer(async (req, res) => {
  try {
    if (!origemLocal(req.headers)) throw falha(403, 'Acesso só local.');
    const url = new URL(req.url, 'http://localhost');
    const rota = rotas[`${req.method} ${url.pathname}`];
    if (rota) return await rota(req, res);
    const m = req.method === 'GET' && url.pathname.match(/^\/saidas\/([^/]+)\/([^/]+)$/);
    if (m) return await servirSaida(res, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    throw falha(404, 'Não encontrado.');
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { erro: status === 404 ? 'Não encontrado.' : e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Abra http://localhost:${PORT}`));
```

- [ ] **Step 2: Verificar com o servidor no ar** (num terminal: `node servidor.mjs`; noutro:)

Run: `curl -s http://localhost:3000/api/historico` → Expected: JSON com a pasta `2026-10-08-desenvolvedor-a-full-stack-pleno-php-laravel-e-rea`
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/saidas/2026-10-08-desenvolvedor-a-full-stack-pleno-php-laravel-e-rea/Vinicius_Dutra_Curriculo.pdf` → Expected: `200`
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/saidas/..%2Fbase/banco.md` → Expected: `404`
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/saidas/x/resposta.txt` → Expected: `404` (fora da lista)
Run: `curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://evil.com" -X POST http://localhost:3000/api/gerar -d x` → Expected: `403`
Run: `curl -s -o /dev/null -w "%{http_code}" -H "Host: evil.com" http://localhost:3000/api/banco` → Expected: `403`
Run: `curl -s -o /dev/null -w "%{http_code}" -X PUT http://localhost:3000/api/banco -d "lixo"` → Expected: `400` (e o banco.md intacto)

- [ ] **Step 3: Commit** (só após autorização)

```bash
git add servidor.mjs
git commit -m "feat: adiciona servidor web local do adaptador"
```

---

### Task 5: Página (`web/index.html`)

**Files:**
- Create: `web/index.html`

**Interfaces:**
- Consumes: a API do Task 4 (contratos acima). Erros chegam como `{ erro }`.
- Produces: a interface. Sem dependências externas (sem CDN, sem fontes externas).

- [ ] **Step 1: Criar `web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adaptador de Currículo</title>
<style>
  :root {
    --bg: #f6f6f8; --surface: #ffffff; --text: #18181b; --muted: #6b7280; --border: #e6e6eb;
    --accent: #4f46e5; --accent-hover: #4338ca; --accent-soft: #eef2ff; --on-accent: #ffffff;
    --warn-bg: #fffbeb; --warn-border: #fde68a; --warn: #92400e;
    --err-bg: #fef2f2; --err: #b91c1c; --ok: #047857;
    --radius: 14px; --shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04);
    --mono: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0c0c10; --surface: #16161d; --text: #ececf1; --muted: #9a9aa8; --border: #26262f;
      --accent: #818cf8; --accent-hover: #a5b4fc; --accent-soft: #1e1b4b; --on-accent: #0c0c10;
      --warn-bg: #2a2006; --warn-border: #5c4708; --warn: #fcd34d;
      --err-bg: #2a0e0e; --err: #fca5a5; --ok: #6ee7b7;
      --shadow: none;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: grid; grid-template-columns: 280px 1fr; min-height: 100vh;
  }
  aside { border-right: 1px solid var(--border); padding: 28px 18px; background: var(--surface); }
  .marca { font-weight: 700; font-size: 17px; letter-spacing: -.01em; margin: 0 6px 4px; }
  .marca span { color: var(--accent); }
  .sub { color: var(--muted); font-size: 13px; margin: 0 6px 24px; }
  .rotulo { text-transform: uppercase; font-size: 11px; letter-spacing: .08em; color: var(--muted); margin: 0 6px 8px; }
  #historico { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .hist {
    width: 100%; text-align: left; border: 0; background: none; color: inherit; cursor: pointer;
    padding: 9px 10px; border-radius: 10px; display: grid; gap: 1px; font: inherit;
  }
  .hist:hover { background: var(--bg); }
  .hist.ativo { background: var(--accent-soft); }
  .hist-titulo { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: capitalize; }
  .hist-data { font-size: 12px; color: var(--muted); }
  .vazio { color: var(--muted); font-size: 13px; padding: 8px 10px; }
  main { padding: 28px clamp(16px, 4vw, 48px); max-width: 1100px; width: 100%; }
  .abas { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 24px; }
  .aba { border: 0; background: none; color: var(--muted); font: inherit; font-weight: 500; padding: 7px 14px; border-radius: 9px; cursor: pointer; }
  .aba[aria-selected="true"] { background: var(--accent-soft); color: var(--text); }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow); margin-bottom: 18px; }
  h2 { font-size: 20px; letter-spacing: -.01em; margin: 0 0 4px; }
  .dica { color: var(--muted); margin: 0 0 16px; font-size: 14px; }
  textarea {
    width: 100%; min-height: 200px; resize: vertical; font: inherit; color: inherit; background: var(--bg);
    border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; outline: none;
  }
  textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  textarea.mono { font: 13px/1.5 var(--mono); min-height: 420px; }
  .acoes { display: flex; gap: 10px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
  .btn {
    border: 0; border-radius: 10px; padding: 10px 18px; font: inherit; font-weight: 600; cursor: pointer;
    background: var(--accent); color: var(--on-accent); display: inline-flex; align-items: center; gap: 8px;
  }
  .btn:hover { background: var(--accent-hover); }
  .btn:disabled { opacity: .7; cursor: progress; }
  .sec { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 9px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; }
  .sec:hover { border-color: var(--accent); }
  a.sec { text-decoration: none; }
  .spin { width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: gira .8s linear infinite; }
  @keyframes gira { to { transform: rotate(360deg); } }
  .erro { background: var(--err-bg); color: var(--err); border-radius: 10px; padding: 10px 14px; margin-top: 14px; font-size: 14px; }
  .resultado { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  .pdf-card { padding: 0; overflow: hidden; }
  .pdf-topo { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  iframe { width: 100%; height: 78vh; border: 0; background: #fff; display: block; }
  .nota { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
  .nota strong { font-size: 40px; line-height: 1; letter-spacing: -.02em; color: var(--accent); }
  .nota span { color: var(--muted); }
  .aviso { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn); border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 8px; }
  .md h3 { font-size: 14px; margin: 18px 0 6px; }
  .md h4 { font-size: 13px; margin: 14px 0 4px; }
  .md p, .md li { font-size: 14px; }
  .md ul, .md ol { padding-left: 20px; margin: 4px 0; }
  .md code { font-family: var(--mono); font-size: 12px; }
  .bloco { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; }
  .bloco-topo { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .bloco pre { margin: 0; padding: 10px 12px; white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.5; max-height: 220px; overflow: auto; }
  .upload {
    display: grid; place-items: center; gap: 6px; border: 1.5px dashed var(--border); border-radius: 12px;
    padding: 26px; text-align: center; cursor: pointer; color: var(--muted); margin-bottom: 14px;
  }
  .upload:hover, .upload.arrastando { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
  .upload input { display: none; }
  .ou { text-align: center; color: var(--muted); font-size: 13px; margin: 6px 0 12px; }
  pre.banco { white-space: pre-wrap; font: 13px/1.55 var(--mono); margin: 0; }
  .toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 10px 16px; border-radius: 10px; font-size: 14px; }
  [hidden] { display: none !important; }
  @media (max-width: 900px) {
    body { grid-template-columns: 1fr; }
    aside { border-right: 0; border-bottom: 1px solid var(--border); padding: 18px 16px; }
    #historico { grid-auto-flow: column; grid-auto-columns: minmax(180px, 1fr); overflow-x: auto; }
    .resultado { grid-template-columns: 1fr; }
    iframe { height: 70vh; }
  }
</style>
</head>
<body>
<aside>
  <p class="marca">Currículo<span>.</span></p>
  <p class="sub">Adaptação por vaga, pronta pra ATS e Gupy</p>
  <p class="rotulo">Vagas geradas</p>
  <ul id="historico"><li class="vazio">Carregando…</li></ul>
</aside>

<main>
  <nav class="abas" role="tablist">
    <button class="aba" role="tab" data-aba="vaga" aria-selected="true">Nova vaga</button>
    <button class="aba" role="tab" data-aba="atualizar" aria-selected="false">Atualizar banco</button>
    <button class="aba" role="tab" data-aba="banco" aria-selected="false">Banco</button>
  </nav>

  <section id="aba-vaga">
    <div class="card">
      <h2>Nova vaga</h2>
      <p class="dica">Cole a descrição completa da vaga. A geração leva cerca de 1 minuto.</p>
      <textarea id="vaga" placeholder="Desenvolvedor(a) Full Stack Pleno…"></textarea>
      <div class="acoes"><button class="btn" id="gerar">Gerar currículo</button></div>
      <div class="erro" id="erro-vaga" hidden></div>
    </div>

    <div class="resultado" id="resultado" hidden>
      <div class="card pdf-card">
        <div class="pdf-topo">
          <strong>Currículo</strong>
          <a class="sec" id="baixar" download="Vinicius_Dutra_Curriculo.pdf">Baixar PDF</a>
        </div>
        <iframe id="pdf" title="Currículo em PDF"></iframe>
      </div>
      <div>
        <div class="card">
          <div class="nota"><strong id="nota">–</strong><span>/ 10 de aderência</span></div>
          <div id="avisos"></div>
          <div class="md" id="relatorio"></div>
        </div>
        <div class="card">
          <h2>Para a Gupy</h2>
          <p class="dica">Cole cada bloco no campo correspondente do seu perfil.</p>
          <div id="gupy"></div>
        </div>
      </div>
    </div>
  </section>

  <section id="aba-atualizar" hidden>
    <div class="card">
      <h2>Atualizar banco</h2>
      <p class="dica">Envie um currículo em PDF ou conte o que você fez. O Claude propõe as mudanças e você revisa antes de salvar.</p>
      <label class="upload" id="upload">
        <input type="file" id="pdf-input" accept="application/pdf">
        <strong>Arraste um PDF ou clique para escolher</strong>
        <span id="pdf-nome">Nenhum arquivo</span>
      </label>
      <p class="ou">ou</p>
      <textarea id="texto-livre" placeholder="Ex.: Na Verden, implementei um relatório de consumo de combustível com Laravel e React que reduziu o tempo de análise do cliente de 2 dias para 10 minutos."></textarea>
      <p class="dica" style="margin:8px 0 0">Se você enviar um PDF, o texto acima é ignorado.</p>
      <div class="acoes"><button class="btn" id="propor">Propor mudanças</button></div>
      <div class="erro" id="erro-banco" hidden></div>
    </div>

    <div class="card" id="revisao" hidden>
      <h2>Revise antes de salvar</h2>
      <div class="md" id="resumo"></div>
      <p class="dica" style="margin-top:16px">Banco proposto (editável):</p>
      <textarea class="mono" id="banco-novo"></textarea>
      <div class="acoes">
        <button class="btn" id="salvar">Salvar no banco</button>
        <button class="sec" id="descartar">Descartar</button>
      </div>
    </div>
  </section>

  <section id="aba-banco" hidden>
    <div class="card">
      <h2>Banco de fatos</h2>
      <p class="dica">Fonte da verdade: o adaptador só usa o que está aqui.</p>
      <pre class="banco" id="banco-atual">Carregando…</pre>
    </div>
  </section>
</main>

<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// markdown mínimo: títulos ##/###/####, listas, **negrito**, `código`, parágrafos
function md(src) {
  const out = [];
  let lista = null;
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const fecha = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (const l of src.split(/\r?\n/)) {
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)/))) { fecha(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if ((m = l.match(/^\s*([-*]|\d+\.)\s+(.*)/))) {
      const tipo = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (lista !== tipo) { fecha(); out.push(`<${tipo}>`); lista = tipo; }
      out.push(`<li>${inline(m[2])}</li>`);
    }
    else if (!l.trim()) fecha();
    else { fecha(); out.push(`<p>${inline(l)}</p>`); }
  }
  fecha();
  return out.join('');
}

async function api(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try { msg = (await r.json()).erro || msg; } catch {}
    throw new Error(msg);
  }
  return r;
}

const mostrarErro = (sel, msg) => { const el = $(sel); el.textContent = msg; el.hidden = false; };
const limparErro = (sel) => { $(sel).hidden = true; };

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

const timers = {};
function ocupar(sel, on, rotulo = '') {
  const b = $(sel);
  if (on) {
    b.dataset.rotulo = b.textContent; b.disabled = true;
    const t0 = Date.now();
    const tick = () => { b.innerHTML = `<span class="spin"></span>${rotulo} ${Math.round((Date.now() - t0) / 1000)}s`; };
    tick(); timers[sel] = setInterval(tick, 1000);
  } else {
    clearInterval(timers[sel]); b.disabled = false; b.textContent = b.dataset.rotulo;
  }
}

function mostrarAba(nome) {
  for (const b of document.querySelectorAll('.aba')) b.setAttribute('aria-selected', String(b.dataset.aba === nome));
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== `aba-${nome}`;
  if (nome === 'banco') carregarBanco();
}
for (const b of document.querySelectorAll('.aba')) b.onclick = () => mostrarAba(b.dataset.aba);

async function carregarHistorico(ativa) {
  const ul = $('#historico');
  try {
    const itens = await (await api('/api/historico')).json();
    ul.innerHTML = itens.length ? '' : '<li class="vazio">Nenhuma vaga ainda</li>';
    for (const it of itens) {
      const li = document.createElement('li');
      li.innerHTML = `<button class="hist${it.pasta === ativa ? ' ativo' : ''}"><span class="hist-titulo">${esc(it.titulo)}</span><span class="hist-data">${esc(it.data.split('-').reverse().join('/'))}</span></button>`;
      li.querySelector('button').onclick = () => abrirResultado(it.pasta);
      ul.append(li);
    }
  } catch (e) {
    ul.innerHTML = `<li class="vazio">${esc(e.message)}</li>`;
  }
}

function renderRelatorio(rel) {
  const [principal, avisos = ''] = rel.split(/^## Avisos automáticos\s*$/m);
  const nota = principal.match(/(\d+(?:[.,]\d+)?)\s*\/\s*10/);
  $('#nota').textContent = nota ? nota[1] : '–';
  $('#relatorio').innerHTML = md(principal.replace(/^## Aderência\s*$/m, '')); // a nota já está em destaque; a justificativa fica
  const itens = [...avisos.matchAll(/^\s*-\s+(.+)$/gm)].map((m) => m[1]).filter((a) => a.trim() !== 'nenhum');
  $('#avisos').innerHTML = itens.map((a) => `<div class="aviso">${esc(a)}</div>`).join('');
}

function renderGupy(texto) {
  const blocos = [];
  let atual = null;
  for (const l of texto.split(/\r?\n/)) {
    const m = l.match(/^(#{2,3})\s+(.*)/);
    if (m) { atual = { titulo: m[2], linhas: [] }; blocos.push(atual); }
    else if (atual) atual.linhas.push(l);
  }
  const cont = $('#gupy');
  cont.innerHTML = '';
  for (const b of blocos) {
    const conteudo = b.linhas.join('\n').replace(/^\s*(?:\d+\.|[-*])\s+/gm, '').trim();
    if (!conteudo) continue;
    const div = document.createElement('div');
    div.className = 'bloco';
    div.innerHTML = `<div class="bloco-topo"><strong>${esc(b.titulo)}</strong><button class="sec">Copiar</button></div><pre>${esc(conteudo)}</pre>`;
    const btn = div.querySelector('button');
    btn.onclick = async () => {
      await navigator.clipboard.writeText(conteudo);
      btn.textContent = 'Copiado ✓';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 1500);
    };
    cont.append(div);
  }
}

async function abrirResultado(pasta) {
  mostrarAba('vaga');
  const base = `/saidas/${encodeURIComponent(pasta)}/`;
  const [gupy, rel, vaga] = await Promise.all(
    ['gupy.md', 'relatorio.md', 'vaga.txt'].map((f) => api(base + f).then((r) => r.text()).catch(() => '')),
  );
  $('#vaga').value = vaga;
  $('#pdf').src = `${base}Vinicius_Dutra_Curriculo.pdf?t=${Date.now()}`;
  $('#baixar').href = `${base}Vinicius_Dutra_Curriculo.pdf`;
  renderRelatorio(rel);
  renderGupy(gupy);
  $('#resultado').hidden = false;
  carregarHistorico(pasta);
}

$('#gerar').onclick = async () => {
  const vaga = $('#vaga').value.trim();
  if (!vaga) return mostrarErro('#erro-vaga', 'Cole a descrição da vaga.');
  limparErro('#erro-vaga');
  ocupar('#gerar', true, 'Gerando…');
  try {
    const r = await (await api('/api/gerar', { method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: vaga })).json();
    await abrirResultado(r.pasta);
  } catch (e) {
    mostrarErro('#erro-vaga', e.message);
  } finally {
    ocupar('#gerar', false);
  }
};

let pdfEscolhido = null;
function escolherPdf(arquivo) {
  pdfEscolhido = arquivo || null;
  $('#pdf-nome').textContent = pdfEscolhido ? pdfEscolhido.name : 'Nenhum arquivo';
}
$('#pdf-input').onchange = (e) => escolherPdf(e.target.files[0]);
const zona = $('#upload');
zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('arrastando'); };
zona.ondragleave = () => zona.classList.remove('arrastando');
zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove('arrastando'); escolherPdf(e.dataTransfer.files[0]); };

$('#propor').onclick = async () => {
  const texto = $('#texto-livre').value.trim();
  if (!pdfEscolhido && !texto) return mostrarErro('#erro-banco', 'Envie um PDF ou escreva o que você fez.');
  limparErro('#erro-banco');
  const opts = pdfEscolhido
    ? { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: pdfEscolhido }
    : { method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: texto };
  ocupar('#propor', true, 'Analisando…');
  try {
    const r = await (await api('/api/banco/propor', opts)).json();
    $('#resumo').innerHTML = md(r.resumo);
    $('#banco-novo').value = r.banco;
    $('#revisao').hidden = false;
    $('#revisao').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    mostrarErro('#erro-banco', e.message);
  } finally {
    ocupar('#propor', false);
  }
};

$('#salvar').onclick = async () => {
  try {
    await api('/api/banco', { method: 'PUT', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: $('#banco-novo').value });
    $('#revisao').hidden = true;
    $('#texto-livre').value = '';
    $('#pdf-input').value = '';
    escolherPdf(null);
    toast('Banco salvo');
  } catch (e) {
    mostrarErro('#erro-banco', e.message);
  }
};
$('#descartar').onclick = () => { $('#revisao').hidden = true; };

async function carregarBanco() {
  try { $('#banco-atual').textContent = await (await api('/api/banco')).text(); }
  catch (e) { $('#banco-atual').textContent = e.message; }
}

carregarHistorico();
</script>
</body>
</html>
```

- [ ] **Step 2: Verificar** abrindo http://localhost:3000 (servidor do Task 4 no ar)
  - Lateral lista a vaga já gerada; clicar mostra PDF, nota `9`, relatório e 3+ blocos da Gupy com "Copiar".
  - Aba "Banco" mostra o `banco.md`.
  - Em 375px de largura (DevTools), sem scroll horizontal da página; lista do histórico vira faixa horizontal.
  - Tema escuro do sistema: cores trocam, texto legível.

- [ ] **Step 3: Commit** (só após autorização)

```bash
git add web/index.html
git commit -m "feat: adiciona interface web do adaptador"
```

---

### Task 6: README + verificação ponta a ponta

**Files:**
- Modify: `README.md` (inserir seção depois de "## Uso")

**Interfaces:**
- Consumes: tudo acima
- Produces: documentação

- [ ] **Step 1: Inserir no `README.md`, logo antes de `## Manter atualizado`:**

```markdown
## Interface web
`node servidor.mjs` e abra http://localhost:3000 (só acessível nesta máquina).
- **Nova vaga**: cole a vaga → PDF, nota de aderência, avisos e blocos prontos pra Gupy com "Copiar".
- **Atualizar banco**: envie um currículo em PDF ou descreva o que fez; o Claude propõe o banco atualizado e você revisa/edita antes de salvar.
- **Lateral**: histórico das vagas geradas (pastas de `saidas/`).
```

- [ ] **Step 2: Verificação ponta a ponta no navegador** (servidor no ar)
  1. Nova vaga com `exemplos/vaga-exemplo.txt` colado → resultado em ~1 min, 1 página, aparece no topo do histórico.
  2. Clicar "Gerar" duas vezes seguidas em abas diferentes → a segunda mostra "Já tem uma operação com o Claude rodando".
  3. Atualizar banco com texto livre: "Na NodeAIoT implementei login com Google OAuth." → resumo com "Adicionado"; textarea com o banco inteiro; "Descartar" não altera `base/banco.md` (`git diff --stat base/banco.md` vazio).
  4. Atualizar banco com o PDF antigo (`C:\Users\dutra\Downloads\Curriculo_versao_anterior.pdf`) → resumo com quase tudo em "Já existia"; nada salvo sem clicar "Salvar".
  5. `node --test` → `# pass 15`.

- [ ] **Step 3: Commit** (só após autorização)

```bash
git add README.md docs/superpowers/specs/2026-10-08-frontend-adaptador-design.md docs/superpowers/plans/2026-10-08-frontend-adaptador.md
git commit -m "docs: documenta a interface web do adaptador"
```
