// email.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { emailsCandidatura, emailValido, parseRascunho, montarMensagem } from './email-lib.mjs';
import { enviarEmail } from './smtp.mjs';

test('emailsCandidatura acha o endereço de candidatura perto de uma pista', () => {
  assert.deepEqual(
    emailsCandidatura('Interessados devem encaminhar currículo e link do GitHub/portfólio para contato@artemispericiamedica.com'),
    ['contato@artemispericiamedica.com'],
  );
  assert.deepEqual(
    emailsCandidatura('Para se candidatar, basta enviar o seu currículo atualizado para o e-mail: 📧 Kerolayne.FBarros@dimensa.com.br.'),
    ['kerolayne.fbarros@dimensa.com.br'],
  );
  assert.deepEqual(emailsCandidatura('Dúvidas sobre o produto? suporte@acme.com'), []);
  assert.deepEqual(emailsCandidatura('send your resume to no-reply@acme.com'), []);
});

test('emailsCandidatura não repete o mesmo endereço', () => {
  assert.deepEqual(
    emailsCandidatura('Envie o currículo para rh@acme.com ou, se preferir, candidatar para RH@acme.com.'),
    ['rh@acme.com'],
  );
});

test('emailValido recusa endereço sem @ ou com espaço', () => {
  assert.equal(emailValido('a@b.com'), true);
  assert.equal(emailValido('a b@c.com'), false);
  assert.equal(emailValido('sem-arroba'), false);
  assert.equal(emailValido('a@b'), false);
});

test('parseRascunho extrai assunto e corpo, e reclama de tag vazia', () => {
  assert.deepEqual(parseRascunho('<assunto>Oi</assunto>\n<corpo> Tudo bem? </corpo>'), { assunto: 'Oi', corpo: 'Tudo bem?' });
  assert.throws(() => parseRascunho('<assunto>Oi</assunto><corpo></corpo>'), /rascunho vazio/);
  assert.throws(() => parseRascunho('<corpo>Tudo bem?</corpo>'), /rascunho vazio|<assunto>/);
});

test('montarMensagem monta o multipart com anexo, assunto codificado e só CRLF', () => {
  const anexo = { nome: 'Fulano_Silva_Curriculo.pdf', dados: Buffer.from('%PDF-1.4 conteúdo binário') };
  const msg = montarMensagem({
    de: 'fulano@example.com',
    nomeDe: 'Fulano Silva',
    para: 'rh@acme.com',
    assunto: 'Candidatura – Desenvolvedor Júnior',
    corpo: 'Olá,\r\nsegue o currículo.',
    anexo,
    data: new Date('2026-10-08T12:00:00Z'),
  });
  assert.match(msg, /^From: =\?UTF-8\?B\?[^?]+\?= <fulano@example.com>\r\n/);
  assert.ok(msg.includes('To: <rh@acme.com>'));
  assert.ok(msg.includes('Date: Thu, 08 Oct 2026 12:00:00 GMT'));
  assert.ok(msg.includes('Content-Type: multipart/mixed; boundary="curriculo-'));

  const assuntoB64 = msg.match(/^Subject: =\?UTF-8\?B\?([^?]+)\?=$/m)[1];
  assert.equal(Buffer.from(assuntoB64, 'base64').toString('utf8'), 'Candidatura – Desenvolvedor Júnior');
  assert.match(msg, /^Subject: =\?UTF-8\?B\?/m, 'assunto vai codificado em base64');

  const marcador = 'filename="Fulano_Silva_Curriculo.pdf"';
  const resto = msg.slice(msg.indexOf(marcador) + marcador.length);
  const anexoB64 = resto.slice(resto.indexOf('\r\n\r\n') + 4).split('\r\n--')[0].replace(/\r\n/g, '');
  assert.deepEqual(Buffer.from(anexoB64, 'base64'), anexo.dados);

  const semCrlf = msg.replace(/\r\n/g, '');
  assert.ok(!semCrlf.includes('\n') && !semCrlf.includes('\r'), 'todo quebra-linha é CRLF');
});

test('montarMensagem recusa quebra de linha em cabeçalho e endereço inválido', () => {
  const anexo = { nome: 'x.pdf', dados: Buffer.from('x') };
  assert.throws(
    () => montarMensagem({ de: 'a@b.com', para: 'c@d.com', assunto: 'oi\nBcc: x@y.com', corpo: 'c', anexo }),
    /quebra de linha/,
  );
  assert.throws(
    () => montarMensagem({ de: 'a@b.com', para: 'invalido', assunto: 'oi', corpo: 'c', anexo }),
    /e-mail inválido/,
  );
});

// Servidor SMTP falso que responde o roteiro e guarda as linhas recebidas.
function servidorFake(responder) {
  const recebido = [];
  const srv = net.createServer((s) => {
    s.setEncoding('utf8');
    s.write('220 fake ESMTP\r\n');
    let buf = '';
    s.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const linha = buf.slice(0, i);
        buf = buf.slice(i + 2);
        recebido.push(linha);
        responder(linha, s);
      }
    });
  });
  return { srv, recebido };
}

const fechar = (srv) => new Promise((r) => srv.close(r));

test('enviarEmail fala SMTP com dot-stuffing e AUTH PLAIN', async () => {
  const { srv, recebido } = servidorFake((linha, s) => {
    if (linha.startsWith('EHLO')) s.write('250-fake\r\n250 OK\r\n');
    else if (linha.startsWith('AUTH')) s.write('235 2.7.0 Ok\r\n');
    else if (linha.startsWith('MAIL FROM')) s.write('250 OK\r\n');
    else if (linha.startsWith('RCPT TO')) s.write('250 OK\r\n');
    else if (linha === 'DATA') s.write('354 ok\r\n');
    else if (linha === '.') s.write('250 2.0.0 Queued\r\n');
    else if (linha === 'QUIT') s.write('221 Bye\r\n');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const porta = srv.address().port;

  const final = await enviarEmail({
    usuario: 'u@x.com',
    senha: 'p',
    para: 'r@y.com',
    mensagem: 'Subject: t\r\n\r\n.linha com ponto\r\nfim',
    conectar: () => net.connect(porta, '127.0.0.1'),
  });
  await fechar(srv);

  assert.match(final, /^250 /);
  assert.ok(recebido.includes('..linha com ponto'), 'linha começando com ponto foi duplicada');
  assert.ok(recebido.includes('RCPT TO:<r@y.com>'));
  assert.ok(recebido.includes(`AUTH PLAIN ${Buffer.from('\0u@x.com\0p', 'utf8').toString('base64')}`));
});

test('enviarEmail explica o 535 sem vazar a senha', async () => {
  const { srv } = servidorFake((linha, s) => {
    if (linha.startsWith('EHLO')) s.write('250 OK\r\n');
    else if (linha.startsWith('AUTH')) s.write('535 5.7.8 Username and Password not accepted\r\n');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const porta = srv.address().port;

  await assert.rejects(
    enviarEmail({
      usuario: 'u@x.com',
      senha: 'meu-segredo',
      para: 'r@y.com',
      mensagem: 'Subject: t\r\n\r\nfim',
      conectar: () => net.connect(porta, '127.0.0.1'),
    }),
    (e) => e.message.includes('recusou o login') && !e.message.includes('meu-segredo'),
  );
  await fechar(srv);
});
