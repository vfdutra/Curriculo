// Funções puras do adaptador de currículo. Só stdlib.

const BEGIN = '\\begin{document}';
const END = '\\end{document}';

export function splitTemplate(tex) {
  const begin = tex.indexOf(BEGIN);
  const end = tex.lastIndexOf(END);
  if (begin < 0 || end < 0) throw new Error('template sem \\begin{document} ou \\end{document}');
  const start = begin + BEGIN.length;
  return { preamble: tex.slice(0, start), body: tex.slice(start, end) };
}

export function assemble(preamble, body) {
  const clean = body
    .replace(/^[\s\S]*\\begin\{document\}/, '')
    .replace(/\\end\{document\}[\s\S]*$/, '')
    .trim();
  return `${preamble}\n\n${clean}\n\n${END}\n`;
}

export function pickTag(text, tag) {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) throw new Error(`resposta sem <${tag}>`);
  return m[1].trim();
}

export function parseResponse(text) {
  return { body: pickTag(text, 'corpo'), gupy: pickTag(text, 'gupy'), relatorio: pickTag(text, 'relatorio') };
}

export function pageCount(stdout) {
  // pdflatex quebra linhas do log em 79 colunas, então junta antes de casar
  const m = stdout.replace(/\r?\n/g, '').match(/Output written on .*?\((\d+) pages?/);
  return m ? Number(m[1]) : null;
}

export function skillsFromTex(body) {
  const sec = body.split('\\section{').find((s) => /^(Habilidades|Skills)/i.test(s));
  if (!sec) return [];
  return [...sec.matchAll(/\\textbf\{[^}]*\}([^\n]*)/g)]
    .flatMap((m) => m[1].replace(/\\\\\s*$/, '').split(/[,()]/))
    .map((s) => s.replace(/\\[a-zA-Z]+/g, '').replace(/\\(.)/g, '$1').trim())
    .filter(Boolean);
}

export function skillsFromGupy(gupy) {
  const sec = gupy.split(/^## /m).find((s) => /^Habilidades/i.test(s));
  if (!sec) return [];
  return [...sec.matchAll(/^\s*(?:[-*]|\d+\.)\s+(.+)$/gm)].map((m) => m[1].trim());
}

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function unknownSkills(skills, banco) {
  // ponytail: substring no banco inteiro; falso negativo raro ("Java" casa com "JavaScript"), aceitável para um aviso
  const b = norm(banco);
  return skills.filter((s) => !b.includes(norm(s)));
}

export function slugify(vaga) {
  const first = vaga.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const slug = norm(first).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return slug || 'vaga';
}
