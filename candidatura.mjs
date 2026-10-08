// Candidatura por e-mail: o Claude escreve o rascunho (assunto + corpo) e o usuário manda pelo próprio Gmail (SMTP).
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askClaude } from './claude.mjs';
import { textoVaga } from './vagas-lib.mjs';
import { safeJoin } from './lib.mjs';
import { emailsCandidatura, emailValido, parseRascunho, montarMensagem } from './email-lib.mjs';
import { enviarEmail } from './smtp.mjs';

const root = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(join(root, '.env'));
} catch {} // sem .env, configEmail() só fica não configurado

export function configEmail() {
  const usuario = process.env.GMAIL_USUARIO || '';
  const senha = (process.env.GMAIL_SENHA_APP || '').replace(/\s+/g, ''); // a senha de app vem em blocos de 4
  const nome = process.env.GMAIL_NOME || 'Vinicius Dutra';
  return { usuario, senha, nome, configurado: !!(usuario && senha) };
}

const ler = (caminho) => readFile(caminho, 'utf8').catch(() => '');

export async function prepararEmail(vaga) {
  if (!vaga.pasta) throw new Error('vaga sem pasta');
  const [instrucoes, banco] = await Promise.all([
    readFile(join(root, 'prompt-email.md'), 'utf8'),
    readFile(join(root, 'base', 'banco.md'), 'utf8'),
  ]);
  const caminhoRel = safeJoin(root, 'saidas', vaga.pasta, 'relatorio.md');
  const relatorio = caminhoRel ? await ler(caminhoRel) : '';
  const emails = emailsCandidatura(vaga.descricao);
  const prompt = [
    instrucoes,
    `<banco>\n${banco}\n</banco>`,
    `<relatorio>\n${relatorio}\n</relatorio>`,
    `<vaga>\n${textoVaga(vaga)}\n</vaga>`,
    `<para>${emails.join(', ')}</para>`,
  ].join('\n\n');
  const resposta = await askClaude(prompt);
  return { para: emails[0] || '', ...parseRascunho(resposta) };
}

export async function enviarCandidatura(vaga, { para, assunto, corpo }) {
  const config = configEmail();
  if (!config.configurado) throw Object.assign(new Error('Configure GMAIL_USUARIO e GMAIL_SENHA_APP no arquivo .env (veja .env.exemplo).'), { status: 400 });
  if (!emailValido(para)) throw Object.assign(new Error('E-mail de destino inválido.'), { status: 400 });
  if (!assunto?.trim() || !corpo?.trim()) throw Object.assign(new Error('Assunto e corpo são obrigatórios.'), { status: 400 });
  const dados = await readFile(safeJoin(root, 'saidas', vaga.pasta, 'Vinicius_Dutra_Curriculo.pdf'));
  const mensagem = montarMensagem({
    de: config.usuario,
    nomeDe: config.nome,
    para,
    assunto,
    corpo,
    anexo: { nome: 'Vinicius_Dutra_Curriculo.pdf', dados },
  });
  // ponytail: sem persistir "enviando" no disco; a trava de duplicidade é por processo (uso local)
  await enviarEmail({ usuario: config.usuario, senha: config.senha, para, mensagem });
  return new Date().toISOString();
}
