// vagas.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoDeHtml, parseGupy, parseHimalayas, parseGithub, parseBuscaWeb, casaTermo, passaFiltro, validarPreferencias, mesclar, textoVaga, parseAvaliacoes, aplicarAvaliacoes } from './vagas-lib.mjs';

const gupyHtml = (jobs) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialJobList: { data: jobs } } } })}</script></html>`;

test('textoDeHtml tira tags, decodifica entidades e quebra blocos em linhas', () => {
  assert.equal(textoDeHtml('<p>PHP &amp; Laravel</p><ul><li>Node</li><li>SQL</li></ul>'), 'PHP & Laravel\nNode\nSQL');
});

test('parseGupy normaliza as vagas do __NEXT_DATA__', () => {
  const [v] = parseGupy(gupyHtml([{
    id: 1, name: 'Dev PHP', careerPageName: 'Acme', jobUrl: 'https://acme.gupy.io/job/x?jobBoardSource=gupy_portal',
    workplaceType: 'hybrid', city: 'Santa Maria', state: 'Rio Grande do Sul',
    publishedDate: '2026-10-08T00:00:00.000Z', applicationDeadline: null, description: ' Requisitos: PHP ',
  }]));
  assert.deepEqual(v, {
    id: 'gupy:1', fonte: 'Gupy', url: 'https://acme.gupy.io/job/x?jobBoardSource=gupy_portal', titulo: 'Dev PHP',
    empresa: 'Acme', local: 'Santa Maria, Rio Grande do Sul', modalidade: 'hibrido',
    publicada: '2026-10-08T00:00:00.000Z', prazo: null, restricoes: ['Brazil'], descricao: 'Requisitos: PHP',
  });
});

test('parseGupy acusa mudança de layout', () => {
  assert.throws(() => parseGupy('<html></html>'), /layout mudou/);
});

test('parseHimalayas normaliza e resume listas longas de países', () => {
  const paises = ['Argentina', 'Brazil', 'Chile', 'Mexico'];
  const [v] = parseHimalayas({ jobs: [{
    guid: 'https://himalayas.app/companies/x/jobs/dev-1', applicationLink: 'https://himalayas.app/companies/x/jobs/dev-1',
    title: 'Developer', companyName: 'X', pubDate: 1790000000, expiryDate: null,
    locationRestrictions: paises, description: '<p>Build APIs</p>',
  }] });
  assert.equal(v.id, 'himalayas:https://himalayas.app/companies/x/jobs/dev-1');
  assert.equal(v.modalidade, 'remoto');
  assert.equal(v.local, '4 países, inclui Brasil');
  assert.deepEqual(v.restricoes, paises);
  assert.equal(v.publicada, new Date(1790000000 * 1000).toISOString());
  assert.equal(v.prazo, null);
  assert.equal(v.descricao, 'Build APIs');
  assert.equal(parseHimalayas({ jobs: [{ guid: 'g', title: 't', companyName: 'c', pubDate: 1, locationRestrictions: [] }] })[0].local, 'Qualquer lugar');
});

test('parseGithub tira modalidade e empresa do título e ignora PRs', () => {
  const issues = [
    { number: 1, title: '[Remoto] Full-stack Engineer React.js • Node.js (Strider))', labels: [], html_url: 'https://github.com/backend-br/vagas/issues/1', created_at: '2026-10-07T00:00:00Z', body: 'Requisitos' },
    { number: 2, title: '[Híbrido - Santa Maria/RS] Dev PHP na Acme Tech', labels: [{ name: 'Pleno' }], html_url: 'u2', created_at: 'd', body: null },
    { number: 3, title: 'PR qualquer', labels: [], pull_request: {}, html_url: 'u3', created_at: 'd', body: '' },
  ];
  const [a, b, ...resto] = parseGithub(issues, 'backend-br/vagas');
  assert.equal(resto.length, 0);
  assert.equal(a.id, 'github:backend-br/vagas#1');
  assert.equal(a.fonte, 'GitHub backend-br/vagas');
  assert.equal(a.modalidade, 'remoto');
  assert.equal(a.empresa, 'Strider');
  assert.equal(b.modalidade, 'hibrido');
  assert.equal(b.empresa, 'Acme Tech');
  assert.equal(b.local, 'Híbrido - Santa Maria/RS');
  assert.equal(b.descricao, '');
});

test('parseBuscaWeb lê o JSON da tag, aceita cerca de código e descarta URL inválida', () => {
  const texto = 'blá <vagas>\n```json\n[{"url":"https://lever.co/x/1?src=li","fonte":"LinkedIn","titulo":"Dev","empresa":"X","local":"Remote","modalidade":"remoto","publicada":"2026-10-07","restricoes":["LATAM"],"descricao":"Node"},{"url":"javascript:alert(1)","titulo":"ruim"}]\n```\n</vagas>';
  const vagas = parseBuscaWeb(texto);
  assert.equal(vagas.length, 1);
  assert.deepEqual(vagas[0], {
    id: 'web:https://lever.co/x/1', fonte: 'LinkedIn', url: 'https://lever.co/x/1?src=li', titulo: 'Dev', empresa: 'X',
    local: 'Remote', modalidade: 'remoto', publicada: '2026-10-07', prazo: null, restricoes: ['LATAM'], descricao: 'Node',
  });
  assert.equal(parseBuscaWeb('<vagas>[{"url":"https://a.com/1","modalidade":"talvez"}]</vagas>')[0].modalidade, 'indefinida');
});

const PREFS = {
  perfil: 'x', observacoes: '',
  modalidades: { remoto: true, hibrido: true, presencial: false },
  termos: ['desenvolvedor'],
  area: ['desenvolv*', 'programad*', 'developer', 'engineer', 'software', 'full stack', 'ai', 'ia'],
  excluir: ['senior', 'sr', 'lead', 'estagio', 'intern', 'arquitet*'],
  aceitarNivel: ['junior', 'pleno'],
  paisesRemoto: ['brazil', 'brasil', 'latam', 'worldwide'],
  cidades: ['Santa Maria'],
};
const base = { titulo: 'Desenvolvedor PHP', empresa: 'Acme', local: 'Brasil', modalidade: 'remoto', restricoes: ['Brazil'] };

test('casaTermo compara palavra inteira sem acento e aceita prefixo com *', () => {
  assert.equal(casaTermo('Desenvolvedor PHP', ['desenvolv*']), true);
  assert.equal(casaTermo('SRE Engineer', ['sr']), false);
  assert.equal(casaTermo('Full-Stack Dev', ['full stack']), true);
  assert.equal(casaTermo('Internal Tools Developer', ['intern']), false);
  assert.equal(casaTermo('Engenheiro de IA', ['ia']), true);
  assert.equal(casaTermo('Estágio Dev', ['estagio']), true);
  assert.equal(casaTermo('Analista', ['*', '']), false);
});

test('passaFiltro aplica área, nível e modalidade das preferências', () => {
  const casos = [
    [{}, true],
    [{ titulo: 'Desenvolvedor Sênior' }, false],
    [{ titulo: 'Desenvolvedor Pleno/Sênior' }, true],
    [{ titulo: 'Estágio em Desenvolvimento' }, false],
    [{ titulo: 'Analista Financeiro' }, false],
    [{ titulo: 'SRE Engineer', restricoes: [] }, true],
    [{ titulo: 'Software Engineer', restricoes: ['United States'] }, false],
    [{ titulo: 'AI Engineer', restricoes: ['LATAM'] }, true],
    [{ titulo: 'Dev Full Stack', modalidade: 'hibrido', local: 'Santa Maria, Rio Grande do Sul' }, true],
    [{ titulo: 'Dev Full Stack', modalidade: 'hibrido', local: 'São Paulo, SP' }, false],
    [{ titulo: 'Dev Full Stack', modalidade: 'presencial', local: 'Santa Maria' }, false],
    [{ titulo: 'Dev Full Stack', modalidade: 'indefinida', local: '?' }, true],
  ];
  for (const [mudanca, esperado] of casos) assert.equal(passaFiltro({ ...base, ...mudanca }, PREFS), esperado, JSON.stringify(mudanca));
  const comPresencial = { ...PREFS, modalidades: { ...PREFS.modalidades, presencial: true } };
  assert.equal(passaFiltro({ ...base, titulo: 'Dev Full Stack', modalidade: 'presencial', local: 'Santa Maria' }, comPresencial), true);
  const semRemoto = { ...PREFS, modalidades: { ...PREFS.modalidades, remoto: false } };
  assert.equal(passaFiltro(base, semRemoto), false);
});

test('validarPreferencias limpa listas e recusa preferências impossíveis', () => {
  assert.deepEqual(validarPreferencias({ ...PREFS, termos: [' a ', 'a', ''] }).termos, ['a']);
  assert.throws(() => validarPreferencias({ ...PREFS, area: 'dev' }), /"area" precisa ser uma lista/);
  assert.throws(() => validarPreferencias({ ...PREFS, termos: [] }), /termo de busca/);
  assert.throws(() => validarPreferencias({ ...PREFS, modalidades: {} }), /modalidade/);
  assert.throws(() => validarPreferencias({ ...PREFS, cidades: [] }), /cidade/);
  assert.equal(validarPreferencias({ ...PREFS, modalidades: { remoto: true }, cidades: [] }).modalidades.hibrido, false);
});

test('base/preferencias.json padrão é válido', () => {
  const p = JSON.parse(readFileSync(new URL('./base/preferencias.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validarPreferencias(p));
});

test('mesclar põe as novas na frente e não duplica por id nem por empresa+título', () => {
  const velha = { ...base, id: 'gupy:1', encontrada: '2026-10-01T00:00:00.000Z', status: 'avaliada' };
  const { todas, novas } = mesclar([velha], [
    { ...base, id: 'gupy:1' },
    { ...base, id: 'web:https://x', titulo: 'Desenvolvedor  PHP!' },
    { ...base, id: 'gupy:2', titulo: 'Dev Node' },
    { ...base, id: 'gupy:2', titulo: 'Dev Node' },
  ], '2026-10-08T00:00:00.000Z');
  assert.deepEqual(novas.map((v) => v.id), ['gupy:2']);
  assert.deepEqual(todas.map((v) => v.id), ['gupy:2', 'gupy:1']);
  assert.equal(novas[0].status, 'pendente');
  assert.equal(novas[0].encontrada, '2026-10-08T00:00:00.000Z');
});

test('textoVaga começa pelo título (vira o título no histórico)', () => {
  const t = textoVaga({ ...base, url: 'https://a', descricao: 'Requisitos: PHP' });
  assert.equal(t.split('\n')[0], 'Desenvolvedor PHP — Acme');
  assert.match(t, /Requisitos: PHP$/);
});

test('parseAvaliacoes + aplicarAvaliacoes saneiam a saída do modelo', () => {
  const avals = parseAvaliacoes(`<avaliacoes>[
    {"id":"a","empresa":"Nova","modalidade":"remoto","aberta":"sim","aceitaBrasil":"talvez","urlOficial":"javascript:x","requisitos":["PHP"],"incertezas":["Contrato?"],"aderencia":7.6,"resumo":"ok","descartar":null},
    {"id":"b","aberta":"não","descartar":"Inscrições encerradas"},
    {"semId":true}
  ]</avaliacoes>`);
  assert.equal(avals.length, 2);
  const vagas = [
    { ...base, id: 'a', empresa: '?', status: 'pendente' },
    { ...base, id: 'b', status: 'pendente' },
    { ...base, id: 'c', status: 'pendente' },
  ];
  const [a, b, c] = aplicarAvaliacoes(vagas, avals);
  assert.equal(a.status, 'avaliada');
  assert.equal(a.empresa, 'Nova');
  assert.deepEqual(a.avaliacao, { aberta: 'sim', aceitaBrasil: 'incerto', urlOficial: null, requisitos: ['PHP'], incertezas: ['Contrato?'], aderencia: 8, resumo: 'ok' });
  assert.equal(b.status, 'descartada');
  assert.equal(b.motivo, 'Inscrições encerradas');
  assert.equal(c.status, 'pendente');
});
