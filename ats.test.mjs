// ats.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDoTex, parseAts, pontuarAts, pontuarPasta } from './ats.mjs';

test('textoDoTex limpa comandos e comentários do .tex', () => {
  const t = textoDoTex('\\resumeItem{Testes com PHPUnit e CI/CD, 100\\% cobertos} % comentário');
  assert.ok(t.includes('Testes com PHPUnit e CI/CD, 100% cobertos'));
  assert.ok(!t.includes('comentário'));
  assert.ok(!t.includes('resumeItem'));
});

test('textoDoTex usa só o corpo entre begin e end', () => {
  const t = textoDoTex('\\documentclass{article}\n\\begin{document}\nOlá mundo\n\\end{document}\nsobra');
  assert.equal(t, 'Olá mundo');
});

test('parseAts aceita JSON em cerca, normaliza peso, completa alternativas e descarta inválidos', () => {
  const r = parseAts(
    '<ats>```json\n{"palavras": [{"termo": "Laravel", "alternativas": [], "peso": "obrigatório"}, {"termo": "Pest", "peso": "desejável"}, {"termo": "", "peso": "obrigatorio"}]}\n```</ats>',
  );
  assert.deepEqual(r.palavras, [
    { termo: 'Laravel', alternativas: ['Laravel'], peso: 'obrigatorio' },
    { termo: 'Pest', alternativas: ['Pest'], peso: 'desejavel' },
  ]);
});

test('parseAts reclama quando não sobra nenhuma palavra', () => {
  assert.throws(() => parseAts('<ats>{"palavras": [{"termo": ""}]}</ats>'), /ATS sem palavras-chave/);
});

test('pontuarAts conta presenças e pesos', () => {
  const palavras = [
    { termo: 'Laravel', alternativas: ['Laravel'], peso: 'obrigatorio' },
    { termo: 'Pest', alternativas: ['Pest'], peso: 'desejavel' },
    { termo: 'filas', alternativas: ['filas', 'queue*'], peso: 'obrigatorio' },
  ];
  const r = pontuarAts('Desenvolvimento com Laravel e processamento com queues', palavras);
  assert.equal(r.nota, 80);
  assert.deepEqual(r.fortes, ['Laravel', 'filas']);
  assert.deepEqual(r.fracos, [{ termo: 'Pest', peso: 'desejavel' }]);
  assert.equal(r.total, 3);
});

test('pontuarAts ignora acento e caixa', () => {
  const r = pontuarAts('OTIMIZACAO de consultas', [{ termo: 'otimização', alternativas: ['otimização'], peso: 'obrigatorio' }]);
  assert.equal(r.nota, 100);
});

test('pontuarPasta devolve null quando não há ats.json', async () => {
  assert.equal(await pontuarPasta('pasta-que-nao-existe'), null);
});
