#!/usr/bin/env node
// Uso: node servidor.mjs  →  http://localhost:3000 (só local)
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerar } from './adaptar.mjs';
import { pontuarPasta, extrairAts } from './ats.mjs';
import { proporBanco } from './banco.mjs';
import { iniciarBuscador, ciclo, lerEstado, atualizar, status as statusBuscador, lerPreferencias, lerPreferenciasBrutas, salvarPreferencias } from './buscador.mjs';
import { configPublica, salvarConfig } from './ia.mjs';
import { caminho, nomeCandidato, nomeArquivo, bancoPreenchido } from './perfil.mjs';
import { textoVaga, passaFiltro, validarPreferencias, idadeDias, recente, aplicada } from './vagas-lib.mjs';
import { safeJoin, listarSaidas, origemLocal } from './lib.mjs';
import { emailsCandidatura } from './email-lib.mjs';
import { configEmail, prepararEmail, enviarCandidatura } from './candidatura.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const saidas = join(root, 'saidas');
const PORT = Number(process.env.PORT) || 3000;
const LIMITE = 10 * 1024 * 1024;
// arquivos fixos servidos da pasta de saída + qualquer *_Curriculo.pdf + o alias curriculo.pdf
const PERMITIDOS = new Set(['gupy.md', 'relatorio.md', 'vaga.txt', 'curriculo.pdf']);
const ehCurriculo = (nome) => /^[A-Za-z0-9_]+_Curriculo\.pdf$/.test(nome) || nome === 'Curriculo.pdf';
const TIPOS = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

let ocupado = false; // ponytail: uma operação com IA por vez; fila só se um dia tiver vários usuários
const enviando = new Set(); // ids com candidatura em envio agora, pra não mandar o mesmo e-mail duas vezes
const extraindoAts = new Set(); // pastas com extração ATS rodando, pra não disparar duas do mesmo

const falha = (status, msg) => Object.assign(new Error(msg), { status });

const json = (res, status, dados) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
};

function lerCorpo(req) {
  return new Promise((ok, erro) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE) {
        erro(falha(413, 'Arquivo maior que 10 MB.'));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', erro);
  });
}

async function comIA(res, fn) {
  if (ocupado) return json(res, 409, { erro: 'Já tem uma operação com IA rodando. Espere terminar.' });
  ocupado = true;
  try {
    json(res, 200, await fn());
  } finally {
    ocupado = false;
  }
}

const rotas = {
  'GET /': async (req, res) => {
    res.writeHead(200, { 'content-type': TIPOS['.html'] });
    res.end(await readFile(join(root, 'web', 'index.html')));
  },

  'GET /api/historico': async (req, res) => {
    const nomes = await readdir(saidas).catch(() => []);
    const entradas = await Promise.all(
      nomes.map(async (nome) => {
        // título = 1ª linha da vaga; o nome da pasta é slug cortado em 50 chars
        const vaga = await readFile(join(saidas, nome, 'vaga.txt'), 'utf8').catch(() => '');
        const titulo = vaga.split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 90);
        return { nome, mtimeMs: (await stat(join(saidas, nome))).mtimeMs, titulo };
      }),
    );
    json(res, 200, listarSaidas(entradas));
  },

  'GET /api/banco': async (req, res) => {
    res.writeHead(200, { 'content-type': TIPOS['.md'] });
    res.end(await readFile(caminho('banco.md'))); // resolve por requisição: recria o modelo se faltar
  },

  'PUT /api/banco': async (req, res) => {
    const texto = (await lerCorpo(req)).toString('utf8');
    if (!texto.includes('# Banco de fatos')) throw falha(400, 'Conteúdo não parece o banco.md (falta o título "# Banco de fatos").');
    await writeFile(caminho('banco.md'), texto);
    res.writeHead(204);
    res.end();
  },

  'GET /api/perfil': async (req, res) => {
    const banco = await readFile(caminho('banco.md'), 'utf8');
    let preferenciasValidas = true;
    try {
      validarPreferencias(lerPreferenciasBrutas());
    } catch {
      preferenciasValidas = false;
    }
    json(res, 200, {
      nome: nomeCandidato(banco),
      arquivo: await nomeArquivo(),
      bancoPreenchido: bancoPreenchido(banco),
      preferenciasValidas,
      config: configPublica(),
    });
  },

  'GET /api/config': async (req, res) => json(res, 200, configPublica()),

  'PUT /api/config': async (req, res) => {
    const novo = await lerJson(req);
    try {
      json(res, 200, salvarConfig(novo));
    } catch (e) {
      throw falha(400, e.message);
    }
  },

  'POST /api/gerar': (req, res) =>
    comIA(res, async () => {
      const vaga = (await lerCorpo(req)).toString('utf8');
      if (!vaga.trim()) throw falha(400, 'Cole a descrição da vaga.');
      const r = await gerar(vaga, () => {});
      return { pasta: r.pasta, avisos: r.avisos, status: r.status, arquivo: r.arquivo };
    }),

  'POST /api/banco/propor': (req, res) =>
    comIA(res, async () => {
      const dados = await lerCorpo(req);
      if (!dados.length) throw falha(400, 'Envie um PDF ou escreva o que você fez.');
      if ((req.headers['content-type'] || '').startsWith('application/pdf')) {
        if (dados.subarray(0, 4).toString('latin1') !== '%PDF') throw falha(400, 'O arquivo não é um PDF.');
        return proporBanco({ pdf: { nome: 'curriculo.pdf', dados } }); // a IA anexa ou grava o arquivo
      }
      return proporBanco({ texto: dados.toString('utf8') });
    }),

  'GET /api/vagas': async (req, res) => {
    const [e, prefs] = await Promise.all([lerEstado(), lerPreferencias()]);
    const ativas = e.vagas.filter((v) => v.status !== 'descartada');
    // e-mails de candidatura calculados na hora (não ficam salvos no json); aplicadas ficam sempre visíveis
    const vagas = ativas
      .filter((v) => aplicada(v) || (passaFiltro(v, prefs) && recente(v, prefs)))
      .map((v) => ({ ...v, emails: emailsCandidatura(v.descricao), aplicadaEm: aplicada(v), idade: idadeDias(v) }));
    json(res, 200, {
      ...e, vagas,
      descartadas: e.vagas.length - ativas.length,
      ocultas: ativas.filter((v) => !aplicada(v) && !passaFiltro(v, prefs)).length,
      antigas: ativas.filter((v) => !aplicada(v) && passaFiltro(v, prefs) && !recente(v, prefs)).length,
      diasMaximos: prefs.diasMaximos,
      rodando: statusBuscador.rodando,
      proxima: statusBuscador.proxima,
    });
  },

  'GET /api/email/status': async (req, res) => {
    const { configurado, usuario } = configEmail();
    json(res, 200, { configurado, usuario }); // nunca devolve a senha
  },

  'POST /api/vagas/buscar': async (req, res) => {
    if (statusBuscador.rodando) throw falha(409, 'A busca já está rodando.');
    ciclo().catch((e) => console.error(e));
    json(res, 202, { ok: true });
  },

  'GET /api/preferencias': async (req, res) => json(res, 200, lerPreferenciasBrutas()),

  'PUT /api/preferencias': async (req, res) => {
    const corpo = (await lerCorpo(req)).toString('utf8');
    let prefs;
    try {
      prefs = validarPreferencias(JSON.parse(corpo));
    } catch (e) {
      throw falha(400, e instanceof SyntaxError ? 'JSON inválido.' : e.message);
    }
    json(res, 200, await salvarPreferencias(prefs));
  },
};

async function lerJson(req) {
  const texto = (await lerCorpo(req)).toString('utf8');
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto);
  } catch {
    throw falha(400, 'JSON inválido.');
  }
}

const dataBR = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

async function prepararEmailVaga(req, res, vaga, marcar) {
  const { refazer } = await lerJson(req);
  if (vaga.candidatura?.rascunho && !refazer) {
    return json(res, 200, { pasta: vaga.pasta, rascunho: vaga.candidatura.rascunho }); // já tem rascunho: não chama a IA de novo
  }
  return comIA(res, async () => {
    let pasta = vaga.pasta;
    if (!pasta) {
      const r = await gerar(textoVaga(vaga), () => {});
      pasta = r.pasta;
      await marcar({ pasta });
    }
    const rascunho = await prepararEmail({ ...vaga, pasta });
    await marcar({ candidatura: { ...vaga.candidatura, rascunho } });
    return { pasta, rascunho };
  });
}

async function enviarEmailVaga(req, res, vaga, marcar) {
  const corpo = await lerJson(req);
  if (vaga.candidatura?.enviadaEm) throw falha(409, `Candidatura já enviada em ${dataBR(vaga.candidatura.enviadaEm)}`);
  if (!vaga.pasta) throw falha(400, 'Gere o currículo antes.');
  if (enviando.has(vaga.id)) throw falha(409, 'Essa candidatura já está sendo enviada.');
  enviando.add(vaga.id);
  try {
    const enviadaEm = await enviarCandidatura(vaga, corpo);
    await marcar({ candidatura: { rascunho: { para: corpo.para, assunto: corpo.assunto, corpo: corpo.corpo }, para: corpo.para, enviadaEm }, aplicadaEm: enviadaEm, aplicadaVia: 'e-mail' });
    json(res, 200, { enviadaEm });
  } finally {
    enviando.delete(vaga.id);
  }
}

async function acaoVaga(req, res, id, acao) {
  const vaga = (await lerEstado()).vagas.find((v) => v.id === id);
  if (!vaga) throw falha(404, 'Vaga não encontrada.');
  const marcar = (campos) => atualizar((e) => { Object.assign(e.vagas.find((v) => v.id === id) || {}, campos); });
  if (acao === 'descartar') {
    await marcar({ status: 'descartada', motivo: 'Descartada por você' });
    res.writeHead(204);
    return res.end();
  }
  if (acao === 'email-preparar') return prepararEmailVaga(req, res, vaga, marcar);
  if (acao === 'email-enviar') return enviarEmailVaga(req, res, vaga, marcar);
  if (acao === 'aplicar') {
    const { desfazer } = await lerJson(req);
    // desfazer só limpa a marca manual: o e-mail enviado continua em candidatura.enviadaEm (não dá para reenviar)
    const aplicadaEm = desfazer ? null : new Date().toISOString();
    await marcar({ aplicadaEm, aplicadaVia: desfazer ? null : 'manual' });
    return json(res, 200, { aplicadaEm });
  }
  if (vaga.pasta) return json(res, 200, { pasta: vaga.pasta, avisos: [], status: 'ok' });
  return comIA(res, async () => {
    const r = await gerar(textoVaga(vaga), () => {});
    await marcar({ pasta: r.pasta }); // ponto de entrada da futura candidatura automática
    return { pasta: r.pasta, avisos: r.avisos, status: r.status, arquivo: r.arquivo };
  });
}

// primeiro *.pdf da pasta (saídas antigas, geradas antes do nome vir do perfil)
async function primeiroPdf(dir) {
  const outro = (await readdir(dir)).find((n) => n.toLowerCase().endsWith('.pdf'));
  return outro ? join(dir, outro) : null;
}

async function servirSaida(res, pasta, arquivo) {
  const dir = safeJoin(saidas, pasta);
  if (!dir || !existsSync(dir) || (!PERMITIDOS.has(arquivo) && !ehCurriculo(arquivo))) throw falha(404, 'Não encontrado.');
  // alias estável: a UI sempre pede curriculo.pdf, aqui resolvido para o PDF de verdade da pasta
  const alvo = arquivo === 'curriculo.pdf' ? (await nomeArquivo()) + '.pdf' : arquivo;
  let caminho = join(dir, alvo);
  if (!existsSync(caminho) && arquivo === 'curriculo.pdf') caminho = await primeiroPdf(dir);
  if (!caminho || !existsSync(caminho)) throw falha(404, 'Não encontrado.');
  const conteudo = await readFile(caminho);
  res.writeHead(200, { 'content-type': TIPOS[extname(caminho)] });
  res.end(conteudo);
}

async function responderAts(res, pasta) {
  const r = await pontuarPasta(pasta);
  if (!r) return json(res, 404, { erro: 'Sem pontuação ATS para este currículo.' });
  json(res, 200, r);
}

// Extrai as palavras-chave de um currículo antigo (usa o Command Code, não o Claude); uma extração por pasta.
async function calcularAts(res, pasta) {
  const vaga = safeJoin(saidas, pasta, 'vaga.txt');
  if (!vaga || !existsSync(vaga)) throw falha(404, 'Currículo não encontrado.');
  if (extraindoAts.has(pasta)) throw falha(409, 'Essa pontuação já está sendo calculada.');
  extraindoAts.add(pasta);
  try {
    json(res, 200, await extrairAts(pasta));
  } finally {
    extraindoAts.delete(pasta);
  }
}

createServer(async (req, res) => {
  try {
    if (!origemLocal(req.headers)) throw falha(403, 'Acesso só local.');
    const url = new URL(req.url, 'http://localhost');
    const rota = rotas[`${req.method} ${url.pathname}`];
    if (rota) return await rota(req, res);
    const v = req.method === 'POST' && url.pathname.match(/^\/api\/vagas\/([^/]+)\/(gerar|descartar|email-preparar|email-enviar|aplicar)$/);
    if (v) return await acaoVaga(req, res, decodeURIComponent(v[1]), v[2]);
    const a = url.pathname.match(/^\/api\/ats\/([^/]+)$/);
    if (a && req.method === 'GET') return await responderAts(res, decodeURIComponent(a[1]));
    if (a && req.method === 'POST') return await calcularAts(res, decodeURIComponent(a[1]));
    const m = req.method === 'GET' && url.pathname.match(/^\/saidas\/([^/]+)\/([^/]+)$/);
    if (m) return await servirSaida(res, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    throw falha(404, 'Não encontrado.');
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { erro: status === 404 ? 'Não encontrado.' : e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Abra http://localhost:${PORT}`);
  if (process.env.BUSCADOR !== '0') iniciarBuscador();
});
