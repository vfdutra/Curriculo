// Bot de vagas: busca nas fontes, filtra pelas preferências, guarda as novas e manda o Command Code avaliar.
// O servidor chama iniciarBuscador() (ciclo ao subir + a cada 1 h). Uso avulso: node buscador.mjs (um ciclo).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTES } from './fontes.mjs';
import { avaliar, LOTE } from './avaliar.mjs';
import { passaFiltro, mesclar, aplicarAvaliacoes, validarPreferencias } from './vagas-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const arquivo = join(root, 'dados', 'vagas.json');
const arquivoPrefs = join(root, 'base', 'preferencias.json');
export const INTERVALO = 60 * 60_000;
export const status = { rodando: false, proxima: null };

export async function lerPreferencias() {
  return validarPreferencias(JSON.parse(await readFile(arquivoPrefs, 'utf8')));
}

export async function salvarPreferencias(p) {
  const validas = validarPreferencias(p);
  await writeFile(arquivoPrefs, `${JSON.stringify(validas, null, 2)}\n`);
  return validas;
}

export async function lerEstado() {
  try {
    return JSON.parse(await readFile(arquivo, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { ultimaBusca: null, erros: [], vagas: [] };
    throw e;
  }
}

// ponytail: fila em memória serializa as escritas deste processo; rodar `node buscador.mjs` com o servidor no ar pode perder uma escrita
let fila = Promise.resolve();
export function atualizar(fn) {
  const feito = fila.then(async () => {
    const estado = await lerEstado();
    const r = await fn(estado);
    await mkdir(dirname(arquivo), { recursive: true });
    await writeFile(`${arquivo}.tmp`, JSON.stringify(estado, null, 1));
    await rename(`${arquivo}.tmp`, arquivo); // troca atômica: nunca deixa o json pela metade
    return r;
  });
  fila = feito.catch(() => {});
  return feito;
}

export async function ciclo(log = console.log) {
  if (status.rodando) return { novas: 0, pulou: true };
  status.rodando = true;
  try {
    const prefs = await lerPreferencias();
    const nomes = Object.keys(FONTES);
    const resultados = await Promise.allSettled(nomes.map((n) => FONTES[n](prefs)));
    const erros = [];
    const candidatas = [];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') candidatas.push(...r.value);
      else erros.push({ fonte: nomes[i], msg: String(r.reason?.message || r.reason) });
    });
    const noPerfil = candidatas.filter((v) => passaFiltro(v, prefs));
    const novas = await atualizar((e) => {
      const m = mesclar(e.vagas, noPerfil);
      e.vagas = m.todas;
      e.ultimaBusca = new Date().toISOString();
      e.erros = erros;
      return m.novas.length;
    });
    log(`[vagas] ${candidatas.length} lidas, ${noPerfil.length} no perfil, ${novas} novas${erros.length ? `, ${erros.length} fontes com erro` : ''}`);

    const pendentes = (await lerEstado()).vagas.filter((v) => v.status === 'pendente').slice(0, LOTE);
    if (pendentes.length) {
      try {
        const avals = await avaliar(pendentes, prefs);
        await atualizar((e) => { e.vagas = aplicarAvaliacoes(e.vagas, avals); });
        log(`[vagas] ${avals.length} avaliadas`);
      } catch (err) {
        await atualizar((e) => { e.erros.push({ fonte: 'Avaliação', msg: err.message }); });
        log(`[vagas] avaliação falhou: ${err.message}`);
      }
    }
    return { novas };
  } finally {
    status.rodando = false;
  }
}

export function iniciarBuscador(log = console.log) {
  const rodar = () => {
    status.proxima = new Date(Date.now() + INTERVALO).toISOString();
    ciclo(log).catch((e) => log(`[vagas] ciclo falhou: ${e.message}`));
  };
  rodar(); // sem esperar horário fixo: busca ao subir e depois a cada INTERVALO
  setInterval(rodar, INTERVALO);
}

const executadoDireto = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (executadoDireto) {
  const r = await ciclo();
  console.log(`Pronto: ${r.novas} vagas novas em ${arquivo}`);
}
