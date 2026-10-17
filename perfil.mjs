// Perfil do candidato: os dados pessoais ficam em dados/perfil/ (fora do git) e nascem dos modelos
// em base/*.exemplo*, na primeira leitura. Assim nada no código sabe o nome do dono. Só stdlib.
import { readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
export const PASTA = join(root, 'dados', 'perfil');

// modelo de onde cada arquivo pessoal é copiado na primeira vez
const MODELOS = {
  'banco.md': join(root, 'base', 'banco.exemplo.md'),
  'preferencias.json': join(root, 'base', 'preferencias.exemplo.json'),
};

// Caminho de um arquivo do perfil; cria dados/perfil/ e copia o modelo se ainda não existir.
export function caminho(nome) {
  const destino = join(PASTA, nome);
  if (!existsSync(destino) && MODELOS[nome]) {
    mkdirSync(PASTA, { recursive: true });
    copyFileSync(MODELOS[nome], destino); // ponytail: cópia síncrona, roda uma vez por arquivo
  }
  return destino;
}

const SEM_NOME = (s) => s.startsWith('Seu nome') || s.includes('[');

// Nome do candidato: primeiro bullet do "## Contato", até o separador (— / - / vírgula).
export function nomeCandidato(banco) {
  const secao = String(banco || '').split(/^## /m).find((s) => /^Contato/.test(s)) || '';
  const bullet = secao.split(/\r?\n/).find((l) => l.trim().startsWith('- '));
  if (!bullet) return '';
  const nome = bullet.trim().slice(2).split(/ — | - |,/)[0].trim();
  return SEM_NOME(nome) ? '' : nome;
}

// Nome de arquivo do PDF/TeX: sem acento, sem caractere especial, terminado em _Curriculo.
export function arquivoCurriculo(nome) {
  const base = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base ? `${base}_Curriculo` : 'Curriculo';
}

// O banco só está preenchido quando tem experiência e nome — senão é o modelo em branco.
export function bancoPreenchido(banco) {
  return /^### /m.test(String(banco || '')) && !!nomeCandidato(banco);
}

// Nome base dos arquivos do currículo, já a partir do banco em dados/perfil/.
export async function nomeArquivo() {
  return arquivoCurriculo(nomeCandidato(readFileSync(caminho('banco.md'), 'utf8')));
}
