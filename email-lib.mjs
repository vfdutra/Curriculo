// Funções puras do e-mail de candidatura. Só stdlib.
import { randomUUID } from 'node:crypto';
import { pickTag } from './lib.mjs';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PISTA = /curr[ií]cul|\bcv\b|resum[eé]|candidat|apply|application|envi[ea]|encaminh|send/i;
const LIXO = /^(no-?reply|nao-?responda|example|exemplo)$/i;

// Endereços que parecem canal de candidatura: o e-mail tem que estar perto de uma pista (currículo, candidatar, apply…).
export function emailsCandidatura(texto = '') {
  const achados = [];
  for (const m of texto.matchAll(EMAIL)) {
    const email = m[0].replace(/\.+$/, '').toLowerCase();
    const [local, dominio] = email.split('@');
    if (LIXO.test(local) || dominio === 'example.com') continue;
    const antes = texto.slice(Math.max(0, m.index - 250), m.index);
    const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 250);
    if (!PISTA.test(antes) && !PISTA.test(depois)) continue;
    if (!achados.includes(email)) achados.push(email);
  }
  return achados;
}

export function emailValido(s) {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s);
}

export function parseRascunho(texto) {
  const assunto = pickTag(texto, 'assunto');
  const corpo = pickTag(texto, 'corpo');
  if (!assunto || !corpo) throw new Error('rascunho vazio');
  return { assunto, corpo };
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const quebrar = (s) => (s.match(/.{1,76}/g) || []).join('\r\n');

// Mensagem RFC 5322 multipart/mixed com o PDF anexado. Todo o texto sai em CRLF.
export function montarMensagem({ de, nomeDe = '', para, assunto, corpo, anexo, data = new Date() }) {
  if (!emailValido(de)) throw new Error(`e-mail inválido: ${de}`);
  if (!emailValido(para)) throw new Error(`e-mail inválido: ${para}`);
  for (const v of [para, assunto, nomeDe, anexo.nome]) {
    if (/[\r\n]/.test(v)) throw new Error('cabeçalho com quebra de linha');
  }
  const boundary = `curriculo-${randomUUID()}`;
  const from = nomeDe ? `=?UTF-8?B?${b64(nomeDe)}?= <${de}>` : `<${de}>`;
  const linhas = [
    `From: ${from}`,
    `To: <${para}>`,
    `Subject: =?UTF-8?B?${b64(assunto)}?=`,
    `Date: ${data.toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    quebrar(b64(corpo.replace(/\r\n?|\n/g, '\n'))),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${anexo.nome}"`,
    `Content-Disposition: attachment; filename="${anexo.nome}"`,
    'Content-Transfer-Encoding: base64',
    '',
    quebrar(anexo.dados.toString('base64')),
    `--${boundary}--`,
    '',
  ];
  return linhas.join('\r\n');
}
