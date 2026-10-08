// Cliente SMTP mínimo pro Gmail (TLS direto na 465). Só stdlib. Nunca loga a senha nem a linha AUTH.
import { connect as tlsConnect } from 'node:tls';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

export function enviarEmail({ usuario, senha, de = usuario, para, mensagem, host = 'smtp.gmail.com', porta = 465, conectar, timeoutMs = 30_000 } = {}) {
  return new Promise((ok, falha) => {
    const socket = conectar ? conectar() : tlsConnect({ host, port: porta, servername: host });
    socket.setEncoding('utf8');
    let buffer = '';
    let pendente = null;
    let morto = false;

    const encerrar = () => {
      if (morto) return;
      morto = true;
      try { socket.destroy(); } catch {}
    };

    const timer = setTimeout(() => {
      encerrar();
      falha(new Error(`SMTP não respondeu em ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);

    // Junta o que chega e resolve a próxima resposta completa: termina numa linha "NNN " (as parciais usam "NNN-").
    const processar = () => {
      if (!pendente) return;
      const linhas = buffer.split('\r\n');
      const fim = linhas.findIndex((l) => /^\d{3} /.test(l));
      if (fim < 0) return;
      const reply = linhas.slice(0, fim + 1).join('\r\n');
      buffer = linhas.slice(fim + 1).join('\r\n');
      const resolver = pendente;
      pendente = null;
      resolver(reply);
    };

    socket.on('data', (c) => { buffer += c; processar(); });
    socket.on('error', (e) => { clearTimeout(timer); encerrar(); falha(e); });

    const esperar = (codigos) =>
      new Promise((resolve) => { pendente = resolve; processar(); }).then((reply) => {
        const codigo = Number(reply.slice(0, 3));
        if (codigos.includes(codigo)) return reply;
        throw Object.assign(new Error(`SMTP respondeu: ${reply}`), { codigo });
      });

    const enviar = (linha) => socket.write(`${linha}\r\n`);

    (async () => {
      try {
        await esperar([220]);
        enviar('EHLO curriculo.local');
        await esperar([250]);
        enviar(`AUTH PLAIN ${b64(`\0${usuario}\0${senha}`)}`); // nunca logar/enviar essa linha em erro
        await esperar([235]);
        enviar(`MAIL FROM:<${de}>`);
        await esperar([250]);
        enviar(`RCPT TO:<${para}>`);
        await esperar([250, 251]);
        enviar('DATA');
        await esperar([354]);
        // normaliza pra CRLF e duplica o ponto inicial das linhas (dot-stuffing)
        const corpo = mensagem.replace(/\r\n?|\n/g, '\r\n').replace(/^\./gm, '..');
        socket.write(`${corpo}\r\n.\r\n`);
        const final = await esperar([250]);
        enviar('QUIT');
        await esperar([221]).catch(() => {}); // erro depois do 250 não interessa mais
        clearTimeout(timer);
        socket.end();
        ok(final);
      } catch (e) {
        clearTimeout(timer);
        encerrar();
        if (e.codigo === 535) falha(new Error('O Gmail recusou o login: confira GMAIL_USUARIO e a senha de app no .env.'));
        else falha(e);
      }
    })();
  });
}
