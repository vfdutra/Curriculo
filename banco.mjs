// Propõe um banco.md atualizado a partir de texto livre ou de um currículo em PDF. Não grava nada: quem salva é o usuário.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { perguntar } from './ia.mjs';
import { caminho } from './perfil.mjs';
import { promptBanco, pickTag } from './lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));

// pdf = { nome, dados: Buffer } quando a fonte for um arquivo; a camada de IA decide como entregá-lo.
export async function proporBanco({ texto, pdf } = {}) {
  const banco = readFileSync(caminho('banco.md'), 'utf8');
  const instrucoes = readFileSync(join(root, 'prompt-banco.md'), 'utf8');
  const prompt = promptBanco(instrucoes, banco, { texto, pdf });
  const out = await perguntar('gerador', prompt, { pdf });
  return { resumo: pickTag(out, 'resumo'), banco: `${pickTag(out, 'banco')}\n` };
}
