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

// Idade em dias desde a publicação (ou desde que encontramos, se a fonte não informa a data).
export function idadeDias(v, agora = new Date().toISOString()) {
  const base = Date.parse(v.publicada || '') || Date.parse(v.encontrada || '') || Date.parse(agora);
  return Math.max(0, Math.floor((Date.parse(agora) - base) / 86_400_000));
}

export const recente = (v, p, agora) => idadeDias(v, agora) <= (p.diasMaximos ?? 5);

const LISTAS_PREFS = ['termos', 'area', 'excluir', 'aceitarNivel', 'paisesRemoto', 'cidades'];

export function validarPreferencias(p) {
  if (!p || typeof p !== 'object') throw new Error('Preferências inválidas.');
  const out = { perfil: String(p.perfil ?? '').trim(), observacoes: String(p.observacoes ?? '').trim(), modalidades: {} };
  for (const m of ['remoto', 'hibrido', 'presencial']) out.modalidades[m] = p.modalidades?.[m] === true;
  for (const k of LISTAS_PREFS) {
    if (!Array.isArray(p[k])) throw new Error(`"${k}" precisa ser uma lista.`);
    out[k] = [...new Set(p[k].map((x) => String(x).trim()).filter(Boolean))];
  }
  out.diasMaximos = p.diasMaximos === undefined ? 5 : Number(p.diasMaximos);
  if (!Number.isInteger(out.diasMaximos) || out.diasMaximos < 1 || out.diasMaximos > 60) throw new Error('Informe o prazo em dias (1 a 60).');
  if (!out.termos.length) throw new Error('Informe ao menos um termo de busca.');
  if (!out.area.length) throw new Error('Informe ao menos uma palavra de área.');
  if (!Object.values(out.modalidades).some(Boolean)) throw new Error('Marque ao menos uma modalidade.');
  if ((out.modalidades.hibrido || out.modalidades.presencial) && !out.cidades.length) throw new Error('Informe a cidade para vagas híbridas/presenciais.');
  return out;
}

const soLetras = (s) => semAcento(s).replace(/[^a-z0-9]/g, '');
export const chave = (v) => `${soLetras(v.empresa)}|${soLetras(v.titulo)}`;

// Palavras de razão social que não distinguem empresas ("Acme Tecnologia Ltda" = "ACME").
const PALAVRAS_EMPRESA = ['ltda', 'sa', 's/a', 'inc', 'ltd', 'llc', 'me', 'eireli', 'tecnologia', 'technologies', 'technology', 'tech', 'brasil', 'brazil', 'group', 'grupo'];
const RE_EMPRESA = new RegExp(`\\b(?:${PALAVRAS_EMPRESA.join('|')})\\b`, 'g');
const normalizarEmpresa = (nome = '') => (nome === '?' ? '' : semAcento(nome).replace(RE_EMPRESA, ' ').replace(/[^a-z0-9]/g, ''));

const STOP_TITULO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o', 'the', 'of', 'for', 'and', 'with', 'to', 'in', 'vaga', 'vagas', 'remoto', 'remote', 'hibrido', 'hybrid', 'presencial', 'onsite', 'i', 'ii', 'iii']);
const CURTOS = new Set(['ai', 'ia', 'ml']);
const NIVEIS = new Map([['jr', 'junior'], ['junior', 'junior'], ['pl', 'pleno'], ['pleno', 'pleno'], ['mid', 'pleno'], ['middle', 'pleno'], ['sr', 'senior'], ['senior', 'senior']]);

// Assinatura para reconhecer a mesma vaga em sites diferentes: empresa normalizada + palavras significativas do título + nível.
export function assinatura(v) {
  const alvo = normalizarEmpresa(v.empresa || '');
  let titulo = semAcento(v.titulo || '').replace(/\[[^\]]*\]/g, ' ');
  // "(Android)" e "(Java)" guardam a tecnologia: mantém o conteúdo, só some com a pontuação
  const m = titulo.match(/(?:\s+(?:na|at)\s+|\s+[-|]\s+)([^|\n]+?)\s*$/);
  const empresa = alvo || (m ? normalizarEmpresa(m[1]) : ''); // empresa desconhecida: o sufixo é a empresa
  if (m && (!alvo || normalizarEmpresa(m[1]) === alvo)) titulo = titulo.slice(0, m.index);
  const palavras = new Set();
  const nivel = new Set();
  for (const p of titulo.replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    if (!p) continue;
    if (NIVEIS.has(p)) nivel.add(NIVEIS.get(p));
    else if (!STOP_TITULO.has(p) && (p.length >= 2 || CURTOS.has(p))) palavras.add(p);
  }
  return { empresa, palavras, nivel };
}

// ponytail: só junta entre sites diferentes; nível (pleno x júnior) separa vagas; 75% de título com empresa igual, 90% quando a empresa é desconhecida.
export function mesmaVaga(a, b) {
  if (a.fonte === b.fonte) return false; // duas vagas no mesmo site são aberturas distintas
  const A = assinatura(a);
  const B = assinatura(b);
  if (!A.palavras.size || !B.palavras.size) return false;
  if (A.nivel.size && B.nivel.size && ![...A.nivel].some((n) => B.nivel.has(n))) return false;
  const comuns = [...A.palavras].filter((p) => B.palavras.has(p)).length;
  const jaccard = comuns / new Set([...A.palavras, ...B.palavras]).size;
  if (A.empresa && B.empresa) return A.empresa === B.empresa && jaccard >= 0.75;
  return jaccard >= 0.9 && Math.min(A.palavras.size, B.palavras.size) >= 3;
}

// Já candidatado? cobre o e-mail enviado antes deste campo existir.
export function aplicada(v) {
  return v.aplicadaEm || v.candidatura?.enviadaEm || null;
}

// A mesma vaga aparece em fontes diferentes (Gupy e LinkedIn, backend-br e frontendbr): dedup por id, empresa+título e mesmaVaga.
// ponytail: comparação O(n·m), ok para algumas centenas de vagas; indexar por empresa se crescer.
export function mesclar(existentes, candidatas, agora = new Date().toISOString()) {
  const copias = existentes.map((v) => ({ ...v })); // não mutar as vagas já guardadas
  const novas = [];
  const registrar = (alvo, v) => {
    if (alvo.url === v.url) return;
    const outras = alvo.outras || (alvo.outras = []);
    if (!outras.some((o) => o.url === v.url)) outras.push({ fonte: v.fonte, url: v.url });
  };
  for (const v of candidatas) {
    const igual = [...copias, ...novas].find((x) => x.id === v.id || chave(x) === chave(v) || mesmaVaga(v, x));
    if (igual) {
      registrar(igual, v); // mesma vaga em outro site: não duplica, só lembra o link
      continue;
    }
    novas.push({ ...v, encontrada: agora, status: 'pendente' });
  }
  return { todas: [...novas, ...copias], novas };
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
