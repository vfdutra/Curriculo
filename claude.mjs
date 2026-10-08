// Chamada a CLIs de IA em modo headless (prompt no stdin, resposta no stdout). Assíncrona para não travar o servidor.
import { spawn } from 'node:child_process';

export function rodarCli(comando, args, prompt, { cwd, timeoutMs = 0, shell = process.platform === 'win32', nome = comando } = {}) {
  return new Promise((ok, falha) => {
    const p = spawn(comando, args, { cwd, shell }); // os CLIs do npm são .cmd no Windows
    let out = '';
    let err = '';
    let estourou = false;
    // no Windows o p.pid é o cmd.exe; /T derruba o CLI junto
    const matar = () => (process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill());
    const timer = timeoutMs ? setTimeout(() => { estourou = true; matar(); }, timeoutMs) : null;
    p.stdout.setEncoding('utf8').on('data', (c) => (out += c));
    p.stderr.setEncoding('utf8').on('data', (c) => (err += c));
    p.on('error', falha);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (estourou) falha(new Error(`${nome} passou de ${Math.round(timeoutMs / 1000)}s e foi encerrado`));
      else if (code === 0) ok(out);
      else falha(Object.assign(new Error(`${nome} falhou (código ${code}): ${err.trim() || out.trim()}`), { codigo: code }));
    });
    p.stdin.end(prompt, 'utf8');
  });
}

// Claude (assinatura, sem API key): só para gerar currículo e propor banco.
export function askClaude(prompt, { args = [], cwd } = {}) {
  return rodarCli('claude', ['-p', '--model', 'opus', ...args], prompt, { cwd });
}
