// Chamada ao Claude Code em modo headless (usa a assinatura, sem API key). Assíncrona para não travar o servidor.
import { spawn } from 'node:child_process';

export function askClaude(prompt, { args = [], cwd } = {}) {
  return new Promise((ok, falha) => {
    const p = spawn('claude', ['-p', '--model', 'opus', ...args], {
      cwd,
      shell: process.platform === 'win32', // o claude do npm é um .cmd no Windows
    });
    let out = '';
    let err = '';
    p.stdout.setEncoding('utf8').on('data', (c) => (out += c));
    p.stderr.setEncoding('utf8').on('data', (c) => (err += c));
    p.on('error', falha);
    p.on('close', (code) => {
      if (code === 0) ok(out);
      else falha(new Error(`claude -p falhou (código ${code}): ${err.trim() || out.trim()}`));
    });
    p.stdin.end(prompt, 'utf8');
  });
}
