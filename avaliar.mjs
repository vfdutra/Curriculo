// Avalia um lote de vagas no Command Code (DeepSeek): inscrição aberta, aceita Brasil, requisitos, incertezas e aderência ao banco.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askCommandCode } from './commandcode.mjs';
import { parseAvaliacoes } from './vagas-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
export const LOTE = 8; // ponytail: lote fixo por chamada; o resto fica 'pendente' para o próximo ciclo

export async function avaliar(vagas, prefs) {
  if (!vagas.length) return [];
  const enxutas = vagas.map(({ id, fonte, url, titulo, empresa, local, modalidade, prazo, restricoes, descricao }) => ({
    id, fonte, url, titulo, empresa, local, modalidade, prazo, restricoes, descricao: descricao.slice(0, 6000),
  }));
  const prompt = [
    readFileSync(join(root, 'prompt-vaga.md'), 'utf8'),
    `<preferencias>\n${JSON.stringify(prefs, null, 1)}\n</preferencias>`,
    `<banco>\n${readFileSync(join(root, 'base', 'banco.md'), 'utf8')}\n</banco>`,
    `<vagas>\n${JSON.stringify(enxutas, null, 1)}\n</vagas>`,
  ].join('\n\n');
  return parseAvaliacoes(await askCommandCode(prompt, { maxTurns: 60 }));
}
