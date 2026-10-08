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
