// Bot de vagas: busca nas fontes, filtra pelas preferências, guarda as novas e manda o Command Code avaliar.
// O servidor chama iniciarBuscador() (ciclo ao subir + a cada 1 h). Uso avulso: node buscador.mjs (um ciclo).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTES } from './fontes.mjs';
import { avaliar, LOTE } from './avaliar.mjs';
import { configurado } from './ia.mjs';
import { caminho } from './perfil.mjs';
import { passaFiltro, mesclar, aplicarAvaliacoes, validarPreferencias, recente, aplicada } from './vagas-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const arquivo = join(root, 'dados', 'vagas.json');
export const INTERVALO = 60 * 60_000;
export const MAX_LOTES = 10; // ponytail: 120 vagas por ciclo; o resto fica para o próximo
export const status = { rodando: false, proxima: null };

// Preferências cruas (sem validar): a UI lê o modelo em branco sem quebrar enquanto não for preenchido.
export function lerPreferenciasBrutas() {
  return JSON.parse(readFileSync(caminho('preferencias.json'), 'utf8'));
}

export async function lerPreferencias() {
  return validarPreferencias(lerPreferenciasBrutas());
}

export async function salvarPreferencias(p) {
  const validas = validarPreferencias(p);
  await writeFile(caminho('preferencias.json'), `${JSON.stringify(validas, null, 2)}\n`);
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
    let prefs;
    try {
      prefs = await lerPreferencias();
    } catch (e) {
      // preferências em branco/ inválidas: registra e não busca nada (a UI mostra o erro)
      await atualizar((s) => {
        s.erros = [{ fonte: 'Preferências', msg: `Preencha as preferências de busca: ${e.message}` }];
        s.ultimaBusca = new Date().toISOString();
      });
      log(`[vagas] preferências inválidas: ${e.message}`);
      return { novas: 0 };
    }
    const nomes = Object.keys(FONTES);
    const resultados = await Promise.allSettled(nomes.map((n) => FONTES[n](prefs)));
    const erros = [];
    const candidatas = [];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') candidatas.push(...r.value);
      else erros.push({ fonte: nomes[i], msg: String(r.reason?.message || r.reason) });
    });
    const noPerfil = candidatas.filter((v) => passaFiltro(v, prefs) && recente(v, prefs));
    const antigas = candidatas.filter((v) => passaFiltro(v, prefs) && !recente(v, prefs)).length;
    const novas = await atualizar((e) => {
      const m = mesclar(e.vagas, noPerfil);
      e.vagas = m.todas;
      e.ultimaBusca = new Date().toISOString();
      e.erros = erros;
      return m.novas.length;
    });
    log(`[vagas] ${candidatas.length} lidas, ${noPerfil.length} no perfil, ${novas} novas, ${antigas} antigas${erros.length ? `, ${erros.length} fontes com erro` : ''}`);

    let avaliadas = 0;
    if (!configurado('analista')) {
      log('[vagas] analista não configurado, avaliação pulada');
    } else {
      for (let lote = 0; lote < MAX_LOTES; lote++) {
        const pendentes = (await lerEstado()).vagas.filter((v) => v.status === 'pendente' && recente(v, prefs) && !aplicada(v)).slice(0, LOTE);
        if (!pendentes.length) break;
        let avals;
        try {
          avals = await avaliar(pendentes, prefs);
        } catch (err) {
          await atualizar((e) => { e.erros.push({ fonte: 'Avaliação', msg: err.message }); });
          log(`[vagas] avaliação falhou: ${err.message}`);
          break;
        }
        await atualizar((e) => { e.vagas = aplicarAvaliacoes(e.vagas, avals); });
        const ids = new Set(avals.map((a) => a.id));
        if (!pendentes.some((v) => ids.has(v.id))) break; // nenhuma pendente recebeu avaliação: não repetir o mesmo lote
        avaliadas += avals.length;
      }
    }
    if (avaliadas) log(`[vagas] ${avaliadas} avaliadas`);
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
