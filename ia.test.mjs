// ia.test.mjs — camada de IA e perfil, sem rede (fetch falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FUNCOES,
  PROVEDORES,
  chamarAnthropic,
  chamarOpenAI,
  chamarDeepSeek,
  lerConfig,
  salvarConfig,
  configPublica,
  configurado,
} from './ia.mjs';
import { nomeCandidato, arquivoCurriculo } from './perfil.mjs';

// fetch falso: guarda (url, init) e devolve a resposta na ordem.
function fetchFalso(respostas) {
  const chamadas = [];
  const fn = async (url, init) => {
    chamadas.push({ url, init });
    return respostas[chamadas.length - 1];
  };
  fn.chamadas = chamadas;
  return fn;
}

test('chamarAnthropic manda x-api-key, a ferramenta de web e trata pause_turn', async () => {
  const fake = fetchFalso([
    { ok: true, json: async () => ({ stop_reason: 'pause_turn', content: [{ type: 'text', text: 'parcial' }] }) },
    {
      ok: true,
      json: async () => ({
        stop_reason: 'end_turn',
        content: [
          { type: 'text', text: 'Olá' },
          { type: 'tool_use', name: 'web_search' },
          { type: 'text', text: ' mundo' },
        ],
      }),
    },
  ]);

  const texto = await chamarAnthropic({ modelo: 'claude-opus-5-5', chave: 'sk-ant-secreta', prompt: 'busque', web: true }, fake);

  assert.equal(texto, 'Olá mundo');
  assert.equal(fake.chamadas.length, 2, 'fez uma rodada extra por causa do pause_turn');
  assert.equal(fake.chamadas[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(fake.chamadas[0].init.headers['x-api-key'], 'sk-ant-secreta');
  assert.equal(fake.chamadas[0].init.headers['anthropic-beta'], 'web-fetch-2025-09-10');
  assert.equal(fake.chamadas[0].init.headers['anthropic-version'], '2023-06-01');

  const corpo = JSON.parse(fake.chamadas[0].init.body);
  assert.equal(corpo.model, 'claude-opus-5-5');
  assert.ok(corpo.tools.some((t) => t.name === 'web_search'));
  assert.ok(corpo.tools.some((t) => t.name === 'web_fetch'));

  const corpo2 = JSON.parse(fake.chamadas[1].init.body);
  assert.equal(corpo2.messages.at(-1).role, 'assistant');
});

test('chamarAnthropic anexa o PDF como bloco document', async () => {
  const fake = fetchFalso([{ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }]);
  await chamarAnthropic({ modelo: 'm', chave: 'k', prompt: 'p', pdf: { nome: 'cv.pdf', dados: Buffer.from('%PDF-1.4') } }, fake);
  const content = JSON.parse(fake.chamadas[0].init.body).messages[0].content;
  assert.equal(content[0].type, 'document');
  assert.equal(content[0].source.media_type, 'application/pdf');
  assert.equal(content[0].source.data, Buffer.from('%PDF-1.4').toString('base64'));
});

test('chamarOpenAI lê output[] message/output_text e inclui input_file com PDF', async () => {
  const fake = fetchFalso([
    {
      ok: true,
      json: async () => ({
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: 'A' }, { type: 'output_text', text: 'B' }] },
        ],
      }),
    },
  ]);

  const pdf = { nome: 'curriculo.pdf', dados: Buffer.from('%PDF-1.4 x') };
  const texto = await chamarOpenAI({ modelo: 'gpt-5', chave: 'sk-openai-secreta', prompt: 'p', pdf }, fake);

  assert.equal(texto, 'AB');
  assert.equal(fake.chamadas[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(fake.chamadas[0].init.headers.Authorization, 'Bearer sk-openai-secreta');
  const content = JSON.parse(fake.chamadas[0].init.body).input[0].content;
  assert.equal(content[0].type, 'input_file');
  assert.equal(content[0].filename, 'curriculo.pdf');
  assert.ok(content[0].file_data.startsWith('data:application/pdf;base64,'));
  assert.equal(content.at(-1).type, 'input_text');
});

test('chamarDeepSeek devolve choices[0].message.content', async () => {
  const fake = fetchFalso([{ ok: true, json: async () => ({ choices: [{ message: { content: 'resposta' } }] }) }]);
  const texto = await chamarDeepSeek({ modelo: 'deepseek-chat', chave: 'k', prompt: 'p' }, fake);
  assert.equal(texto, 'resposta');
  assert.equal(fake.chamadas[0].url, 'https://api.deepseek.com/chat/completions');
});

test('chamarDeepSeek explica o 401 sem vazar a chave', async () => {
  const fake = fetchFalso([{ ok: false, status: 401, json: async () => ({ error: { message: 'Authentication Fails' } }) }]);
  await assert.rejects(
    chamarDeepSeek({ modelo: 'deepseek-chat', chave: 'sk-chave-secretissima', prompt: 'p' }, fake),
    (e) => e.message.includes('chave inválida') && !e.message.includes('sk-chave-secretissima'),
  );
});

test('FUNCOES e PROVEDORES têm a forma esperada', () => {
  assert.deepEqual(FUNCOES, ['busca', 'analista', 'gerador']);
  assert.deepEqual(Object.keys(PROVEDORES), ['anthropic', 'openai', 'deepseek', 'cli']);
  assert.equal(PROVEDORES.deepseek.web, false);
  assert.equal(PROVEDORES.cli.modelos.gerador, 'opus');
});

test('salvarConfig guarda a chave, reaproveita e configPublica nunca a expõe', () => {
  process.env.CURRICULO_CONFIG = join(mkdtempSync(join(tmpdir(), 'cfg-')), 'config.json');

  salvarConfig({ gerador: { provedor: 'openai', modelo: '', chave: 'sk-segredo-1234' } });
  assert.equal(configurado('gerador'), true);
  assert.equal(lerConfig().gerador.modelo, 'gpt-5'); // modelo vazio vira o padrão do provedor

  const pub = configPublica();
  assert.ok(!JSON.stringify(pub).includes('sk-segredo-1234'), 'a configuração pública não tem a chave');
  assert.equal(pub.gerador.temChave, true);
  assert.equal(pub.gerador.final, '1234');
  assert.equal(pub.gerador.configurado, true);
  assert.ok(pub.provedores.anthropic);

  // mesma função e mesmo provedor com chave vazia: mantém a chave anterior
  salvarConfig({ gerador: { provedor: 'openai', chave: '' } });
  assert.equal(lerConfig().gerador.chave, 'sk-segredo-1234');

  // trocar de função não mexe na anterior
  salvarConfig({ analista: { provedor: 'deepseek', chave: 'd' } });
  assert.equal(lerConfig().gerador.chave, 'sk-segredo-1234');
  assert.equal(lerConfig().analista.provedor, 'deepseek');

  assert.throws(() => salvarConfig({ busca: { provedor: 'deepseek', chave: 'd' } }), /busca web/);
  assert.throws(() => salvarConfig({ busca: { provedor: 'inexistente' } }), /Provedor inválido/);
});

test('nomeCandidato lê o primeiro bullet do Contato e ignora o modelo em branco', () => {
  assert.equal(nomeCandidato('## Contato\n- Vinícius Dutra — Santa Maria, RS'), 'Vinícius Dutra');
  assert.equal(nomeCandidato('## Contato\n- Seu nome — Cidade'), '');
  assert.equal(nomeCandidato('sem contato'), '');
});

test('arquivoCurriculo tira acentos, troca símbolos por _ e cai num nome padrão', () => {
  assert.equal(arquivoCurriculo('Vinícius Dutra'), 'Vinicius_Dutra_Curriculo');
  assert.equal(arquivoCurriculo(''), 'Curriculo');
  assert.equal(arquivoCurriculo('  Ana-Maria  Silva '), 'Ana_Maria_Silva_Curriculo');
});
