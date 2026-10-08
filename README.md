# Currículo

Currículo em LaTeX (ATS-friendly) + adaptador por vaga.

## Pré-requisitos
MiKTeX (`pdflatex`), Node 20+, Claude Code CLI logado (`claude`).

## Uso
1. Salve a descrição da vaga em um `.txt`.
2. `node adaptar.mjs caminho/da/vaga.txt`
3. Abra `saidas/<data>-<vaga>/`:
   - `Vinicius_Dutra_Curriculo.pdf`: envie este
   - `gupy.md`: cole as Habilidades (até 30) e as descrições de Experiência no seu perfil da Gupy; a ordenação da Gupy lê esses campos
   - `relatorio.md`: aderência, lacunas e avisos (leia os avisos antes de enviar)

## Interface web
`node servidor.mjs` e abra http://localhost:3000 (só acessível nesta máquina).
- **Nova vaga**: cole a vaga → PDF, nota de aderência, avisos e blocos prontos pra Gupy com "Copiar".
- **Atualizar banco**: envie um currículo em PDF ou descreva o que fez; o Claude propõe o banco atualizado e você revisa/edita antes de salvar.
- **Lateral**: histórico das vagas geradas (pastas de `saidas/`).

## Manter atualizado
- Fato novo (projeto, métrica, tecnologia) → `base/banco.md`. O adaptador só usa o que está lá.
- Mudança de visual → preâmbulo de `base/curriculo.tex` (vale pra todas as gerações).
- Currículo base: `mkdir -p saidas/base && pdflatex -interaction=nonstopmode -output-directory saidas/base base/curriculo.tex`
- Testes: `node --test`
