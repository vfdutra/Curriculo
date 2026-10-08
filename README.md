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

## Manter atualizado
- Fato novo (projeto, métrica, tecnologia) → `base/banco.md`. O adaptador só usa o que está lá.
- Mudança de visual → preâmbulo de `base/curriculo.tex` (vale pra todas as gerações).
- Currículo base: `mkdir -p saidas/base && pdflatex -interaction=nonstopmode -output-directory saidas/base base/curriculo.tex`
- Testes: `node --test`
