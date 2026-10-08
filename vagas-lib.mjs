// Funções puras do buscador de vagas: normalizar cada fonte, filtrar pelas preferências, mesclar sem duplicar.
import { pickTag } from './lib.mjs';

export const MODALIDADES = ['remoto', 'hibrido', 'presencial', 'indefinida'];
const semAcento = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function textoDeHtml(html = '') {
  return String(html)
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/ul|\/ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e])
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

const localRemoto = (r) =>
  !r.length ? 'Qualquer lugar' : r.length <= 3 ? r.join(', ') : `${r.length} países${r.includes('Brazil') ? ', inclui Brasil' : ''}`;

const MODALIDADE_GUPY = { remote: 'remoto', hybrid: 'hibrido', 'on-site': 'presencial' };

// ponytail: lê o JSON que a própria página do portal embute (Next.js); se a Gupy mudar o layout, o erro aparece na aba Vagas
export function parseGupy(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Gupy: página sem __NEXT_DATA__ (layout mudou?)');
  const lista = JSON.parse(m[1]).props?.pageProps?.initialJobList?.data;
  if (!Array.isArray(lista)) throw new Error('Gupy: initialJobList.data ausente (layout mudou?)');
  return lista.map((j) => ({
    id: `gupy:${j.id}`,
    fonte: 'Gupy',
    url: j.jobUrl,
    titulo: j.name,
    empresa: j.careerPageName || '?',
    local: [j.city, j.state].filter(Boolean).join(', ') || 'Brasil',
    modalidade: MODALIDADE_GUPY[j.workplaceType] || 'indefinida',
    publicada: j.publishedDate || null,
    prazo: j.applicationDeadline || null,
    restricoes: ['Brazil'],
    descricao: (j.description || '').trim(),
  }));
}

export function parseHimalayas(dados) {
  return (dados.jobs || []).map((j) => {
    const restricoes = j.locationRestrictions || [];
    return {
      id: `himalayas:${j.guid}`,
      fonte: 'Himalayas',
      url: j.applicationLink || j.guid,
      titulo: j.title,
      empresa: j.companyName || '?',
      local: localRemoto(restricoes),
      modalidade: 'remoto',
      publicada: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
      prazo: j.expiryDate ? new Date(j.expiryDate * 1000).toISOString() : null,
      restricoes,
      descricao: textoDeHtml(j.description),
    };
  });
}

const empresaDoTitulo = (t) =>
  (t.match(/\(([^()]+)\)\)?\s*$/) || t.match(/\bna ([A-Z][\w.&\- ]+?)\s*(?:\||$)/) || [])[1]?.trim() || '?';

export function parseGithub(issues, repo) {
  return issues
    .filter((i) => !i.pull_request)
    .map((i) => {
      const t = semAcento(`${i.title} ${(i.labels || []).map((l) => l.name).join(' ')}`);
      const modalidade = /remot/.test(t) ? 'remoto' : /hibrid/.test(t) ? 'hibrido' : /presencial/.test(t) ? 'presencial' : 'indefinida';
      return {
        id: `github:${repo}#${i.number}`,
        fonte: `GitHub ${repo}`,
        url: i.html_url,
        titulo: i.title,
        empresa: empresaDoTitulo(i.title),
        local: modalidade === 'remoto' ? 'Brasil' : (i.title.match(/\[([^\]]+)\]/) || [])[1] || '?',
        modalidade,
        publicada: i.created_at || null,
        prazo: null,
        restricoes: ['Brazil'],
        descricao: i.body || '',
      };
    });
}

function jsonDaTag(texto, tag) {
  const bruto = pickTag(texto, tag).replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(bruto);
  } catch (e) {
    // o DeepSeek às vezes devolve uma lista por item ("[{…}]\n[{…}]"): junta numa lista só
    if (!/\]\s*\[/.test(bruto)) throw e;
    return JSON.parse(bruto.replace(/\]\s*\[/g, ','));
  }
}

export function parseBuscaWeb(texto) {
  return jsonDaTag(texto, 'vagas')
    .filter((v) => /^https?:\/\//.test(v?.url || ''))
    .map((v) => ({
      id: `web:${v.url.split(/[?#]/)[0]}`,
      fonte: v.fonte || 'Busca web',
      url: v.url,
      titulo: v.titulo || '?',
      empresa: v.empresa || '?',
      local: v.local || '?',
      modalidade: MODALIDADES.includes(v.modalidade) ? v.modalidade : 'indefinida',
      publicada: v.publicada || null,
      prazo: null,
      aberta: SIM_NAO.includes(v.aberta) ? v.aberta : 'incerto',
      restricoes: Array.isArray(v.restricoes) ? v.restricoes.map(String) : [],
      descricao: v.descricao || '',
    }));
}

// Termos editáveis na aba Vagas: sem acento/caixa/pontuação, palavra inteira; termo terminado em * casa como prefixo.
const normalizar = (s = '') => semAcento(s).replace(/[^a-z0-9*]+/g, ' ').trim();

export function casaTermo(texto, termos) {
  const t = ` ${normalizar(texto).replace(/\*/g, '')} `;
  return termos.some((termo) => {
    const n = normalizar(termo);
    if (!n.replace(/\*/g, '')) return false;
    return n.endsWith('*') ? t.includes(` ${n.slice(0, -1).trim()}`) : t.includes(` ${n} `);
  });
}

const BR = ['brazil', 'brasil', 'latam', 'latin america', 'south america', 'americas', 'worldwide', 'anywhere'];

// Decide no código o que o modelo erraria: Gupy/Himalayas/GitHub só listam vagas abertas, então 'aberta' e 'aceitaBrasil' saem daqui.
export function fatos(v, agora = new Date().toISOString()) {
  const api = !v.id.startsWith('web:');
  const aberta = v.prazo && v.prazo < agora ? 'não' : api ? 'sim' : (SIM_NAO.includes(v.aberta) ? v.aberta : 'incerto');
  const aceitaBrasil = v.restricoes?.length
    ? (v.restricoes.some((r) => casaTermo(r, BR)) ? 'sim' : 'não')
    : (api || casaTermo(v.local, ['brasil', 'brazil']) ? 'sim' : 'incerto');
  return { aberta, aceitaBrasil };
}

// Filtro barato antes do modelo: só corta o que com certeza não serve; na dúvida deixa passar e o avaliador decide.
export function passaFiltro(v, p) {
  if (!casaTermo(v.titulo, p.area)) return false;
  if (casaTermo(v.titulo, p.excluir) && !casaTermo(v.titulo, p.aceitarNivel)) return false;
  const naCidade = casaTermo(`${v.local} ${v.titulo}`, p.cidades);
  if (v.modalidade === 'remoto') return p.modalidades.remoto && (!v.restricoes?.length || v.restricoes.some((r) => casaTermo(r, p.paisesRemoto)));
  if (v.modalidade === 'hibrido') return p.modalidades.hibrido && naCidade;
  if (v.modalidade === 'presencial') return p.modalidades.presencial && naCidade;
  return true; // indefinida
}

const LISTAS_PREFS = ['termos', 'area', 'excluir', 'aceitarNivel', 'paisesRemoto', 'cidades'];

export function validarPreferencias(p) {
  if (!p || typeof p !== 'object') throw new Error('Preferências inválidas.');
  const out = { perfil: String(p.perfil ?? '').trim(), observacoes: String(p.observacoes ?? '').trim(), modalidades: {} };
  for (const m of ['remoto', 'hibrido', 'presencial']) out.modalidades[m] = p.modalidades?.[m] === true;
  for (const k of LISTAS_PREFS) {
    if (!Array.isArray(p[k])) throw new Error(`"${k}" precisa ser uma lista.`);
    out[k] = [...new Set(p[k].map((x) => String(x).trim()).filter(Boolean))];
  }
  if (!out.termos.length) throw new Error('Informe ao menos um termo de busca.');
  if (!out.area.length) throw new Error('Informe ao menos uma palavra de área.');
  if (!Object.values(out.modalidades).some(Boolean)) throw new Error('Marque ao menos uma modalidade.');
  if ((out.modalidades.hibrido || out.modalidades.presencial) && !out.cidades.length) throw new Error('Informe a cidade para vagas híbridas/presenciais.');
  return out;
}

const soLetras = (s) => semAcento(s).replace(/[^a-z0-9]/g, '');
export const chave = (v) => `${soLetras(v.empresa)}|${soLetras(v.titulo)}`;

// A mesma vaga aparece em fontes diferentes (Gupy e LinkedIn, backend-br e frontendbr): dedup por id e por empresa+título.
export function mesclar(existentes, candidatas, agora = new Date().toISOString()) {
  const ids = new Set(existentes.map((v) => v.id));
  const chaves = new Set(existentes.map(chave));
  const novas = [];
  for (const v of candidatas) {
    if (ids.has(v.id) || chaves.has(chave(v))) continue;
    ids.add(v.id);
    chaves.add(chave(v));
    novas.push({ ...v, encontrada: agora, status: 'pendente' });
  }
  return { todas: [...novas, ...existentes], novas };
}

// Entrada do gerar(): a 1ª linha vira o título no histórico.
export function textoVaga(v) {
  return [`${v.titulo} — ${v.empresa}`, `Modalidade: ${v.modalidade} | Local: ${v.local}`, `Link: ${v.url}`, '', v.descricao].join('\n');
}

// Perfil enxuto para o avaliador: só o que muda a nota, com os cargos/empresas da experiência e sem os bullets de detalhe.
export function perfilCompacto(banco) {
  const secoes = banco.split(/^## /m);
  const pega = (n) => (secoes.find((s) => s.startsWith(n)) || '').trim();
  const cabecalhos = [...banco.matchAll(/^### (.+)$/gm)].map((m) => `- ${m[1]}`).join('\n');
  return [pega('Formação'), `Experiência:\n${cabecalhos}`, pega('Habilidades'), pega('Idiomas'), pega('Lacunas')].filter(Boolean).join('\n\n');
}

export function parseAvaliacoes(texto) {
  const lista = jsonDaTag(texto, 'avaliacoes');
  if (!Array.isArray(lista)) throw new Error('<avaliacoes> não é uma lista');
  return lista.filter((a) => a && typeof a.id === 'string');
}

const SIM_NAO = ['sim', 'não', 'incerto'];
const textos = (x) => (Array.isArray(x) ? x.map(String) : []);

export function aplicarAvaliacoes(vagas, avaliacoes, agora = new Date().toISOString()) {
  const porId = new Map(avaliacoes.map((a) => [a.id, a]));
  return vagas.map((v) => {
    const a = porId.get(v.id);
    if (!a || v.status !== 'pendente') return v;
    const { aberta, aceitaBrasil } = fatos(v, agora);
    const avaliacao = {
      aberta,
      aceitaBrasil,
      urlOficial: /^https?:\/\//.test(a.urlOficial || '') ? a.urlOficial : null,
      requisitos: textos(a.requisitos),
      incertezas: textos(a.incertezas),
      aderencia: Number.isFinite(a.aderencia) ? Math.max(0, Math.min(10, Math.round(a.aderencia))) : null,
      resumo: String(a.resumo || ''),
    };
    const atualizada = {
      ...v,
      empresa: v.empresa === '?' && a.empresa ? String(a.empresa) : v.empresa,
      modalidade: MODALIDADES.includes(a.modalidade) ? a.modalidade : v.modalidade,
      avaliacao,
    };
    const motivo = a.descartar
      || (aberta === 'não' && 'Inscrições encerradas')
      || (aceitaBrasil === 'não' && 'Não aceita candidatos do Brasil')
      || null;
    return motivo
      ? { ...atualizada, status: 'descartada', motivo: String(motivo) }
      : { ...atualizada, status: 'avaliada' };
  });
}
