// Avalia um lote de vagas com o provedor "analista": aderência, requisitos e incertezas a partir de um perfil compacto.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { perguntar } from './ia.mjs';
import { caminho } from './perfil.mjs';
import { parseAvaliacoes, perfilCompacto } from './vagas-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
export const LOTE = 12; // ponytail: lote fixo por chamada; o ciclo repete até a fila de pendentes esvaziar

export async function avaliar(vagas, prefs) {
  if (!vagas.length) return [];
  const { modalidades, cidades, paisesRemoto, excluir, aceitarNivel, observacoes } = prefs;
  const prompt = [
    readFileSync(join(root, 'prompt-vaga.md'), 'utf8'),
    `<perfil>\n${perfilCompacto(readFileSync(caminho('banco.md'), 'utf8'))}\n</perfil>`,
    `<preferencias>\n${JSON.stringify({ modalidades, cidades, paisesRemoto, excluir, aceitarNivel, observacoes })}\n</preferencias>`,
    `<vagas>\n${JSON.stringify(vagas.map(({ id, titulo, empresa, local, modalidade, restricoes, descricao }) => ({ id, titulo, empresa, local, modalidade, restricoes: restricoes.slice(0, 8), descricao: descricao.slice(0, 3500) })))}\n</vagas>`,
  ].join('\n\n');

  const avals = parseAvaliacoes(await perguntar('analista', prompt, { timeoutMs: 5 * 60_000 }));
  if (!avals.length) throw new Error('avaliação falhou — resposta vazia');
  return avals;
}
