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
