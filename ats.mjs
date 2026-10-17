// Pontuação ATS do currículo: o Command Code extrai as palavras-chave da vaga (ats.json) e a nota é
// calculada no código, lendo o .tex atual — então editar o .tex à mão reflete na nota. Só stdlib.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickTag, safeJoin } from './lib.mjs';
import { casaTermo } from './vagas-lib.mjs';
import { perguntar } from './ia.mjs';
import { nomeArquivo } from './perfil.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const BEGIN = '\\begin{document}';
const END = '\\end{document}';
const PESOS = { obrigatorio: 2, desejavel: 1 };

const semAcento = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// O que um ATS leria do PDF: só o corpo entre \begin{document} e \end{document}, sem comandos, comentários nem chaves.
export function textoDoTex(tex) {
  const begin = tex.indexOf(BEGIN);
  const end = tex.lastIndexOf(END);
  const corpo = begin >= 0 && end > begin ? tex.slice(begin + BEGIN.length, end) : tex;
  return corpo
    .replace(/(?<!\\)%.*$/gm, ' ') // comentários (\% escapado fica)
    .replace(/\\\\/g, ' ') // quebras de linha \\
    .replace(/\\[a-zA-Z]+\*?/g, ' ') // comandos (\resumeItem, \textbf, \section, …)
    .replace(/\\([%&#_$])/g, '$1') // \% \& \# \_ \$ viram o caractere
    .replace(/[{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizarPeso = (p) => (semAcento(p) === 'desejavel' ? 'desejavel' : 'obrigatorio');

// Valida a lista vinda do modelo (ou do ats.json salvo): descarta o que não serve e garante o termo nas alternativas.
function validarPalavras(lista) {
  const palavras = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const termo = typeof p?.termo === 'string' ? p.termo.trim() : '';
    if (!termo) continue;
    const alternativas = (Array.isArray(p?.alternativas) ? p.alternativas : [])
      .map((a) => String(a).trim())
      .filter(Boolean);
    if (!alternativas.includes(termo)) alternativas.unshift(termo);
    palavras.push({ termo, alternativas, peso: normalizarPeso(p?.peso) });
  }
  if (!palavras.length) throw new Error('ATS sem palavras-chave');
  return palavras;
}

export function parseAts(texto) {
  const bruto = pickTag(texto, 'ats').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const dados = JSON.parse(bruto);
  return { palavras: validarPalavras(dados?.palavras) };
}

const porPeso = (a, b) => (a.peso === b.peso ? 0 : a.peso === 'obrigatorio' ? -1 : 1);

// Casa as palavras-chave com o texto do currículo: obrigatória vale 2, desejável 1; a nota é a fração do peso presente.
export function pontuarAts(texto, palavras) {
  const presentes = [];
  const ausentes = [];
  let pesoPresente = 0;
  let pesoTotal = 0;
  for (const p of palavras) {
    const peso = PESOS[p.peso] ?? 1;
    pesoTotal += peso;
    if (casaTermo(texto, p.alternativas)) {
      presentes.push(p);
      pesoPresente += peso;
    } else ausentes.push(p);
  }
  presentes.sort(porPeso);
  ausentes.sort(porPeso);
  return {
    nota: pesoTotal ? Math.round((100 * pesoPresente) / pesoTotal) : 0,
    fortes: presentes.map((p) => p.termo),
    fracos: ausentes.map((p) => ({ termo: p.termo, peso: p.peso })),
    total: palavras.length,
  };
}

const caminhoAts = (pasta) => safeJoin(root, 'saidas', pasta, 'ats.json');

// Nota de uma pasta já gerada; null quando ainda não há ats.json (currículo antigo).
export async function pontuarPasta(pasta) {
  const atsPath = caminhoAts(pasta);
  if (!atsPath || !existsSync(atsPath)) return null;
  const dir = safeJoin(root, 'saidas', pasta);
  const atual = safeJoin(root, 'saidas', pasta, `${await nomeArquivo()}.tex`);
  let texPath = atual && existsSync(atual) ? atual : null;
  if (!texPath && dir && existsSync(dir)) {
    const antigo = readdirSync(dir).find((n) => /_Curriculo\.tex$/.test(n)); // saídas antigas
    texPath = antigo ? join(dir, antigo) : null;
  }
  if (!texPath) return null;
  const { palavras } = JSON.parse(readFileSync(atsPath, 'utf8'));
  return pontuarAts(textoDoTex(readFileSync(texPath, 'utf8')), validarPalavras(palavras));
}

// Extrai as palavras-chave da vaga de um currículo antigo e salva o ats.json (modelo barato, só texto).
export async function extrairAts(pasta) {
  const atsPath = caminhoAts(pasta);
  const vagaPath = safeJoin(root, 'saidas', pasta, 'vaga.txt');
  if (!atsPath || !vagaPath || !existsSync(vagaPath)) throw new Error('Vaga não encontrada para este currículo.');
  const prompt = `${readFileSync(join(root, 'prompt-ats.md'), 'utf8')}\n\n<vaga>\n${readFileSync(vagaPath, 'utf8')}\n</vaga>\n`;
  const out = await perguntar('analista', prompt, { timeoutMs: 5 * 60_000 });
  const { palavras } = parseAts(out);
  writeFileSync(atsPath, JSON.stringify({ palavras }, null, 2));
  return pontuarPasta(pasta);
}
