// Busca vagas nas fontes conforme as preferências. Cada função devolve Vaga[] normalizada (ver vagas-lib.mjs).
// LinkedIn/Indeed/Catho/InfoJobs não têm API e bloqueiam robôs: entram só pela busca web do Command Code.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { perguntar, configurado } from './ia.mjs';
import { parseGupy, parseHimalayas, parseGithub, parseBuscaWeb } from './vagas-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const CABECALHOS = { 'user-agent': 'curriculo-buscador/1.0 (uso pessoal)' };

async function baixar(url, tipo = 'text') {
  const r = await fetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return tipo === 'json' ? r.json() : r.text();
}

export async function buscarGupy(p) {
  // ponytail: o portal não filtra por cidade; varre 3 páginas de híbridas/presenciais e o filtro local acha a cidade. Se faltar vaga, aumente.
  const tipos = [
    p.modalidades.remoto && ['remote', 1],
    p.modalidades.hibrido && ['hybrid', 3],
    p.modalidades.presencial && ['on-site', 3],
  ].filter(Boolean);
  const vagas = [];
  for (const termo of p.termos) {
    const base = `https://portal.gupy.io/job-search/term=${encodeURIComponent(termo)}`;
    for (const [tipo, paginas] of tipos) {
      for (let page = 1; page <= paginas; page++) vagas.push(...parseGupy(await baixar(`${base}&workplaceTypes[]=${tipo}&page=${page}`)));
    }
  }
  return vagas;
}

export async function buscarHimalayas(p) {
  if (!p.modalidades.remoto) return [];
  const vagas = [];
  for (const q of p.termos) {
    const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=BR&sort=recent&limit=20`;
    vagas.push(...parseHimalayas(await baixar(url, 'json')));
  }
  return vagas;
}

const REPOS = ['backend-br/vagas', 'frontendbr/vagas', 'react-brasil/vagas'];

export async function buscarGithub() {
  const vagas = [];
  // 3 requisições/h, bem abaixo do limite anônimo de 60/h da API do GitHub
  for (const repo of REPOS) {
    const issues = await baixar(`https://api.github.com/repos/${repo}/issues?state=open&sort=created&per_page=30`, 'json');
    vagas.push(...parseGithub(issues, repo));
  }
  return vagas;
}

export async function buscarWeb(p) {
  if (!configurado('busca')) throw new Error('Busca web não configurada (aba Configuração).');
  const prompt = `${readFileSync(join(root, 'prompt-busca.md'), 'utf8')}\n\n<preferencias>\n${JSON.stringify(p, null, 1)}\n</preferencias>`;
  return parseBuscaWeb(await perguntar('busca', prompt, { web: true, timeoutMs: 15 * 60_000 }));
}

export const FONTES = { Gupy: buscarGupy, Himalayas: buscarHimalayas, GitHub: buscarGithub, 'Busca web': buscarWeb };
