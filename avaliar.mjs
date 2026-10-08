// Avalia um lote de vagas no Command Code: aderência, requisitos e incertezas a partir de um perfil compacto, sem ferramentas.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askCommandCode, MODELO_AVALIACAO, MODELO_RESERVA } from './commandcode.mjs';
import { parseAvaliacoes, perfilCompacto } from './vagas-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
export const LOTE = 12; // ponytail: lote fixo por chamada; o ciclo repete até a fila de pendentes esvaziar

export async function avaliar(vagas, prefs) {
  if (!vagas.length) return [];
  const { modalidades, cidades, paisesRemoto, excluir, aceitarNivel, observacoes } = prefs;
  const prompt = [
    readFileSync(join(root, 'prompt-vaga.md'), 'utf8'),
    `<perfil>\n${perfilCompacto(readFileSync(join(root, 'base', 'banco.md'), 'utf8'))}\n</perfil>`,
    `<preferencias>\n${JSON.stringify({ modalidades, cidades, paisesRemoto, excluir, aceitarNivel, observacoes })}\n</preferencias>`,
    `<vagas>\n${JSON.stringify(vagas.map(({ id, titulo, empresa, local, modalidade, restricoes, descricao }) => ({ id, titulo, empresa, local, modalidade, restricoes: restricoes.slice(0, 8), descricao: descricao.slice(0, 3500) })))}\n</vagas>`,
  ].join('\n\n');

  const erros = [];
  for (const modelo of [MODELO_AVALIACAO, MODELO_RESERVA]) {
    try {
      const avals = parseAvaliacoes(await askCommandCode(prompt, { modelo, web: false, maxTurns: 3, timeoutMs: 5 * 60_000 }));
      if (avals.length) return avals;
      erros.push(`${modelo}: resposta vazia`);
    } catch (e) {
      erros.push(`${modelo}: ${e.message}`);
    }
  }
  throw new Error(`avaliação falhou — ${erros.join('; ')}`);
}
