// lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTemplate, assemble, parseResponse, pickTag, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify, safeJoin, listarSaidas, promptBanco, origemLocal } from './lib.mjs';

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

test('pickTag extrai uma tag e reclama se faltar', () => {
  assert.equal(pickTag('a <corpo> X </corpo> b', 'corpo'), 'X');
  assert.throws(() => pickTag('nada', 'corpo'), /<corpo>/);
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
    { nome: '2026-10-07-dev-react', mtimeMs: 5, titulo: 'Dev React Pleno — remoto' },
    { nome: 'base', mtimeMs: 1 },
  ]);
  assert.deepEqual(r, [
    { pasta: '2026-10-07-dev-react', data: '2026-10-07', titulo: 'Dev React Pleno — remoto' },
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
