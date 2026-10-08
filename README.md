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

## Buscador de vagas

O servidor (`node servidor.mjs`) busca vagas ao subir e depois a cada 1 h. Elas aparecem na aba **Vagas**, mais novas primeiro, com contador de novas.

- **Preferências** (painel "Preferências da busca" na aba Vagas, salvas em `base/preferencias.json`):
  - modalidades e cidades;
  - de onde uma vaga remota precisa aceitar;
  - termos de busca;
  - palavras de área;
  - níveis excluídos e exceções;
  - perfil e observações para o avaliador.

  Ao salvar, a lista é refiltrada na hora e a próxima busca já usa as novas preferências.
- **Fontes:**
  - Gupy (portal público).
  - Himalayas (remotas).
  - Issues de `backend-br/vagas`, `frontendbr/vagas` e `react-brasil/vagas`.
  - Busca web no Command Code: LinkedIn, Indeed, Catho e InfoJobs, sem scraping e preferindo o link oficial.
- **Avaliação** (Command Code com `deepseek/deepseek-v4.1-flash-fast`, reserva `gpt-6-luna`, lotes de 12 até a fila esvaziar, no máximo 120 vagas por ciclo, sem ferramentas — o modelo só lê o texto, sem `--yolo`):
  - Avalia a partir de um perfil compacto (formação, títulos de experiência, habilidades, idiomas e lacunas), não do `banco.md` inteiro.
  - Lista os requisitos, marca o que não está claro e dá nota de aderência ao `base/banco.md`.
  - Inscrição aberta e aceita-Brasil são decididos no código: Gupy, Himalayas e GitHub já listam só vagas abertas; prazos vencidos e restrições de país são checados. Resultados da busca web vêm confirmados pela própria busca.
  - Vagas que claramente não servem são descartadas com o motivo.
- **Gerar currículo** numa vaga roda o adaptador (Claude) com a descrição dela e lembra a pasta gerada.
- O estado fica em `dados/vagas.json`, fora do git.
- `node buscador.mjs` roda um ciclo avulso. Com `BUSCADOR=0`, o servidor sobe sem o agendador.
- Requer o `cmdc` (Command Code) instalado e logado.
