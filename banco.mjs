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
