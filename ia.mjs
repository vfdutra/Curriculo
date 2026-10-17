// Camada de provedores de IA: cada função (busca web / analista / gerador) escolhe, na aba Configuração,
// entre Anthropic, OpenAI, DeepSeek (via fetch) ou os CLIs locais (claude / Command Code). Só stdlib.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askClaude } from './claude.mjs';
import { askCommandCode, MODELO, MODELO_AVALIACAO } from './commandcode.mjs';

const root = dirname(fileURLToPath(import.meta.url));
// ponytail: CURRICULO_CONFIG existe para os testes apontarem para um arquivo temporário
const caminhoConfig = () => process.env.CURRICULO_CONFIG || join(root, 'dados', 'config.json');

export const FUNCOES = ['busca', 'analista', 'gerador'];

export const PROVEDORES = {
  anthropic: {
    nome: 'Anthropic (Claude)',
    web: true,
    pdf: true,
    modelos: { busca: 'claude-sonnet-5-5', analista: 'claude-haiku-5-5', gerador: 'claude-opus-5-5' },
  },
  openai: {
    nome: 'OpenAI',
    web: true,
    pdf: true,
    modelos: { busca: 'gpt-5', analista: 'gpt-5-mini', gerador: 'gpt-5' },
  },
  deepseek: {
    nome: 'DeepSeek',
    web: false,
    pdf: false,
    modelos: { busca: '', analista: 'deepseek-chat', gerador: 'deepseek-chat' },
  },
  cli: {
    nome: 'CLI local (claude / Command Code)',
    web: true,
    pdf: true,
    modelos: { busca: MODELO, analista: MODELO_AVALIACAO, gerador: 'opus' },
  },
};

export function lerConfig() {
  try {
    return JSON.parse(readFileSync(caminhoConfig(), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

export function configurado(funcao) {
  const c = lerConfig()[funcao];
  return !!c?.provedor && (c.provedor === 'cli' || !!c.chave);
}

// Configuração sem segredos, para a UI: a chave vira temChave/final.
export function configPublica() {
  const c = lerConfig();
  const out = {};
  for (const funcao of FUNCOES) {
    const cfg = c[funcao];
    out[funcao] = {
      provedor: cfg?.provedor || '',
      modelo: cfg?.modelo || '',
      temChave: !!cfg?.chave,
      final: cfg?.chave ? cfg.chave.slice(-4) : '',
      configurado: configurado(funcao),
    };
  }
  out.provedores = PROVEDORES;
  return out;
}

// Grava a configuração validando cada função presente em `novo`. Chave vazia reaproveita a anterior
// quando o provedor é o mesmo (a UI nunca precisa reenviar a chave). Grava atômico e devolve configPublica().
export function salvarConfig(novo) {
  const atual = lerConfig();
  const saida = {};
  for (const funcao of FUNCOES) {
    const entrada = novo?.[funcao];
    if (entrada === undefined) {
      if (atual[funcao]) saida[funcao] = atual[funcao];
      continue;
    }
    const provedor = String(entrada.provedor ?? '');
    if (provedor === '') continue; // limpa a função
    if (!PROVEDORES[provedor]) throw new Error(`Provedor inválido em "${funcao}".`);
    if (funcao === 'busca' && !PROVEDORES[provedor].web) {
      throw new Error(`O provedor "${PROVEDORES[provedor].nome}" não faz busca web, escolha outro para a busca.`);
    }
    if (entrada.modelo !== undefined && typeof entrada.modelo !== 'string') throw new Error(`Modelo inválido em "${funcao}".`);
    const modelo = String(entrada.modelo ?? '').trim() || PROVEDORES[provedor].modelos[funcao] || '';
    const chave =
      String(entrada.chave ?? '').trim() || (atual[funcao]?.provedor === provedor ? atual[funcao].chave || '' : '');
    saida[funcao] = { provedor, modelo, chave };
  }

  const destino = caminhoConfig();
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(`${destino}.tmp`, `${JSON.stringify(saida, null, 2)}\n`);
  renameSync(`${destino}.tmp`, destino); // troca atômica: nunca deixa o config pela metade
  return configPublica();
}

const erroConfig = (msg) => Object.assign(new Error(msg), { status: 400 });

const PREFIXOS_HTTP = (status) =>
  status === 401 || status === 403
    ? 'chave inválida ou sem permissão'
    : status === 429
      ? 'limite de uso atingido'
      : status >= 500
        ? 'provedor indisponível, tente de novo'
        : '';

// Mensagem de erro de uma resposta HTTP ruim; nunca inclui a chave.
async function erroHttp(resposta, label) {
  let detalhe = '';
  try {
    const j = await resposta.json();
    detalhe = j?.error?.message || j?.message || '';
  } catch {}
  const prefixo = PREFIXOS_HTTP(resposta.status);
  return new Error(`${label}: ${[prefixo, detalhe || `HTTP ${resposta.status}`].filter(Boolean).join(' — ')}`);
}

export async function chamarAnthropic({ modelo, chave, prompt, web = false, pdf = null, timeoutMs = 10 * 60_000 }, fetchFn = fetch) {
  const content = [];
  if (pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.dados.toString('base64') } });
  content.push({ type: 'text', text: prompt });
  const messages = [{ role: 'user', content }];
  const tools = web
    ? [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 15 },
        { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 15 },
      ]
    : null;
  const headers = { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  if (web) headers['anthropic-beta'] = 'web-fetch-2025-09-10';

  let resp;
  for (let rodada = 0; rodada < 5; rodada++) {
    const r = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: modelo, max_tokens: 16000, messages, ...(tools ? { tools } : {}) }),
    });
    if (!r.ok) throw await erroHttp(r, 'Anthropic');
    resp = await r.json();
    if (resp.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: resp.content }); // continua a rodada pausada
  }
  return (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

export async function chamarOpenAI({ modelo, chave, prompt, web = false, pdf = null, timeoutMs = 10 * 60_000 }, fetchFn = fetch) {
  const content = [];
  if (pdf) content.push({ type: 'input_file', filename: pdf.nome, file_data: `data:application/pdf;base64,${pdf.dados.toString('base64')}` });
  content.push({ type: 'input_text', text: prompt });
  const corpo = { model: modelo, input: [{ role: 'user', content }] };
  if (web) corpo.tools = [{ type: 'web_search' }];

  const r = await fetchFn('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw await erroHttp(r, 'OpenAI');
  const resp = await r.json();
  return (resp.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
}

export async function chamarDeepSeek({ modelo, chave, prompt, timeoutMs = 10 * 60_000 }, fetchFn = fetch) {
  const r = await fetchFn('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw await erroHttp(r, 'DeepSeek');
  const resp = await r.json();
  return resp.choices?.[0]?.message?.content ?? '';
}

const ADAPTADORES = { anthropic: chamarAnthropic, openai: chamarOpenAI, deepseek: chamarDeepSeek };

// No CLI, o gerador recebe o PDF como caminho (o claude lê com a ferramenta Read).
const comCaminhoDoPdf = (prompt, arquivo) =>
  prompt.replace('O currículo em PDF está anexado.', `Leia o currículo em PDF no arquivo: ${arquivo}`);

// Ponto único de chamada de IA. pdf = { nome, dados: Buffer } quando houver arquivo.
export async function perguntar(funcao, prompt, { web = false, pdf = null, timeoutMs = 10 * 60_000 } = {}) {
  const cfg = lerConfig()[funcao];
  if (!configurado(funcao)) throw erroConfig(`Configure o provedor de "${funcao}" na aba Configuração.`);
  const p = PROVEDORES[cfg.provedor];
  if (web && !p.web) throw erroConfig(`${p.nome} não faz busca web: use outro provedor na busca ou desligue a busca web.`);
  if (pdf && !p.pdf) {
    throw erroConfig(
      cfg.provedor === 'deepseek'
        ? 'DeepSeek não lê PDF: cole o texto do currículo ou use outro provedor no gerador.'
        : `${p.nome} não lê PDF: cole o texto do currículo ou use outro provedor no gerador.`,
    );
  }

  if (cfg.provedor === 'cli') {
    if (funcao === 'gerador') {
      if (!pdf) return askClaude(prompt);
      const pasta = join(root, 'saidas', '_uploads');
      mkdirSync(pasta, { recursive: true });
      const arquivo = join(pasta, `${Date.now()}.pdf`);
      writeFileSync(arquivo, pdf.dados);
      return askClaude(comCaminhoDoPdf(prompt, arquivo), { cwd: root, args: ['--allowedTools', 'Read'] });
    }
    return askCommandCode(prompt, { modelo: cfg.modelo, web, maxTurns: web ? 40 : 3, timeoutMs });
  }

  return ADAPTADORES[cfg.provedor]({ modelo: cfg.modelo, chave: cfg.chave, prompt, web, pdf, timeoutMs });
}
