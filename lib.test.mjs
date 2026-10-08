// lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTemplate, assemble, pickTag, parseResponse, pageCount, skillsFromTex, skillsFromGupy, unknownSkills, slugify } from './lib.mjs';

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
