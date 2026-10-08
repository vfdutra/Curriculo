// Command Code headless com DeepSeek: mais barato que o Claude para o trabalho repetitivo do buscador (busca web e avaliação).
// O modelo lê páginas de terceiros (prompt injection), então roda numa pasta isolada fora do repo, em modo dont-ask, com
// permissões que só liberam web_search/web_fetch. A avaliação não abre ferramenta nenhuma: roda no sandbox 'curriculo-avaliador',
// com WebFetch/WebSearch negados, para o modelo responder só com texto. Sem --yolo NÃO basta: a ferramenta powershell roda mesmo
// sem ele (verificado em 2026-10-08), e read_file + web_fetch permitiria vazar arquivos. NUNCA usar --yolo.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { rodarCli } from './claude.mjs';

export const MODELO = 'deepseek/deepseek-v4.1-flash';
export const MODELO_AVALIACAO = 'deepseek/deepseek-v4.1-flash-fast';
export const MODELO_RESERVA = 'gpt-6-luna';
const ERROS = { 5: 'limite de uso do Command Code atingido', 8: 'o modelo estourou o limite de turnos', 10: 'sem créditos no Command Code' };
// Roda o index.mjs do pacote global direto no node: o shim cmdc.cmd some enquanto o Command Code se autoatualiza.
const entrada = join(dirname(process.execPath), 'node_modules', 'command-code', 'dist', 'index.mjs');
const SANDBOXES = { busca: join(tmpdir(), 'curriculo-buscador'), avaliacao: join(tmpdir(), 'curriculo-avaliador') }; // fora do repo: as regras daqui não afetam o cc-executor
const NEGADAS = ['Shell', 'powershell', 'Read', 'Edit', 'Write', 'mcp__*', 'enter_worktree', 'exit_worktree'];
const PERMISSOES = { permissions: { defaultMode: 'dont-ask', disableBypass: true, allow: ['WebFetch', 'WebSearch'], deny: NEGADAS } };
const PERMISSOES_AVALIADOR = { permissions: { defaultMode: 'dont-ask', disableBypass: true, deny: [...NEGADAS, 'WebFetch', 'WebSearch'] } };

export async function askCommandCode(prompt, { timeoutMs = 15 * 60_000, maxTurns = 40, modelo = MODELO, web = true } = {}) {
  const sandbox = web ? SANDBOXES.busca : SANDBOXES.avaliacao;
  // reescreve a cada chamada: a pasta temporária pode ter sido limpa ou adulterada
  mkdirSync(join(sandbox, '.commandcode'), { recursive: true });
  writeFileSync(join(sandbox, '.commandcode', 'settings.json'), JSON.stringify(web ? PERMISSOES : PERMISSOES_AVALIADOR, null, 2));
  const args = ['-p', '-m', modelo, '-t', '--skip-onboarding', '--no-session', '--no-skills', '--no-auto-update',
    '--permission-mode', 'dont-ask', '--max-turns', String(maxTurns)];
  try {
    return existsSync(entrada)
      ? await rodarCli(process.execPath, [entrada, ...args], prompt, { cwd: sandbox, timeoutMs, shell: false, nome: 'cmdc' })
      : await rodarCli('cmdc', args, prompt, { cwd: sandbox, timeoutMs });
  } catch (e) {
    if (ERROS[e.codigo]) e.message = `${ERROS[e.codigo]} — ${e.message}`;
    throw e;
  }
}
