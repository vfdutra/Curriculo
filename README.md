# Currículo

Currículo em LaTeX (ATS-friendly) + adaptador por vaga.

## Para usar com os seus dados
1. Instale o Node 24+ e uma distribuição LaTeX com `pdflatex` (MiKTeX no Windows; TeX Live ou MacTeX nos outros sistemas).
2. Clone o repositório.
3. Rode `node servidor.mjs`.
4. Abra http://localhost:3000 e siga a lista **Primeiros passos** da aba Vagas:
   1. **Configuração**: escolha provedor, modelo e API key para cada função (busca web, analista de vagas e gerador de currículo). A Anthropic e a OpenAI fazem busca web; o DeepSeek não busca na web nem lê PDF; o "CLI local" usa o `claude` e o Command Code já instalados nesta máquina, sem API key.
   2. **Atualizar banco**: importe o PDF do seu currículo atual, revise e salve.
   3. **Preferências**: termos de busca, modalidade e cidade, na lateral da aba Vagas.
5. (Opcional) Para candidaturas por e-mail, conecte o Gmail em `.env` (veja `.env.exemplo`).

Os seus dados ficam em `dados/` (banco, preferências, config com as chaves e vagas) e em `saidas/` (os currículos gerados); as duas pastas são ignoradas pelo git. Os modelos para começar são `base/banco.exemplo.md` e `base/preferencias.exemplo.json`.

## Uso (linha de comando)
1. Salve a descrição da vaga em um `.txt`.
2. `node adaptar.mjs caminho/da/vaga.txt`
3. Abra `saidas/<data>-<vaga>/`:
   - `curriculo.pdf`: envie este
   - `gupy.md`: cole as Habilidades (até 30) e as descrições de Experiência no seu perfil da Gupy; a ordenação da Gupy lê esses campos
   - `relatorio.md`: aderência, lacunas e avisos (leia os avisos antes de enviar)

## Pontuação ATS
Cada geração também salva `ats.json` com as palavras-chave que a vaga pede (a função **analista de vagas** extrai uma vez, no modelo que você configurou). A nota 0–100 é calculada no **código**, lendo o `.tex` atual: cada palavra-chave presente soma pontos (obrigatória vale 2, desejável 1) e a nota é a fração da soma total — então editar o `.tex` à mão e reabrir o resultado reflete na nota. A tela do resultado mostra a nota, os pontos fortes (presentes) e os fracos (faltando). Currículos gerados antes disso aparecem com o botão **Calcular pontuação**.

## Interface web
`node servidor.mjs` e abra http://localhost:3000 (só acessível nesta máquina).
- **Configuração**: provedor, modelo e API key de cada função de IA (busca web, analista de vagas e gerador de currículo).
- **Nova vaga**: cole a vaga → PDF, nota de aderência, avisos e blocos prontos pra Gupy com "Copiar".
- **Atualizar banco**: envie um currículo em PDF ou descreva o que fez; o provedor do **gerador** propõe o banco atualizado e você revisa/edita antes de salvar.
- **Lateral**: histórico das vagas geradas (pastas de `saidas/`).

## Manter atualizado
- Fato novo (projeto, métrica, tecnologia) → `dados/perfil/banco.md`. O adaptador só usa o que está lá; edite pelo **Banco de fatos** ou por **Atualizar banco**.
- Mudança de visual → preâmbulo de `base/modelo.tex` (vale pra todas as gerações).
- Currículo base: `mkdir -p saidas/base && pdflatex -interaction=nonstopmode -output-directory saidas/base base/modelo.tex`
- Testes: `node --test`

## Buscador de vagas

O servidor (`node servidor.mjs`) busca vagas ao subir e depois a cada 1 h. Elas aparecem na aba **Vagas**, mais novas primeiro, com contador de novas.

- **Preferências** (painel "Preferências da busca" na aba Vagas, salvas em `dados/perfil/preferencias.json`):
  - modalidades e cidades;
  - de onde uma vaga remota precisa aceitar;
  - termos de busca;
  - palavras de área;
  - níveis excluídos e exceções;
  - prazo máximo desde a publicação (padrão 5 dias; vagas mais antigas não entram, não são avaliadas e não aparecem na lista);
  - perfil e observações para o avaliador.

  Ao salvar, a lista é refiltrada na hora e a próxima busca já usa as novas preferências.
- **Fontes:**
  - Gupy (portal público).
  - Himalayas (remotas).
  - Issues de `backend-br/vagas`, `frontendbr/vagas` e `react-brasil/vagas`.
  - Busca web (LinkedIn, Indeed, Catho e InfoJobs) pela função **busca**, com um provedor que faça busca web, sem scraping e preferindo o link oficial. Sem busca configurada, ficam só Gupy, Himalayas e GitHub.
- **Avaliação** (função **analista**, lotes de 12 até a fila esvaziar, no máximo 120 vagas por ciclo; o modelo só lê o texto):
  - Avalia a partir de um perfil compacto (formação, títulos de experiência, habilidades, idiomas e lacunas), não do `dados/perfil/banco.md` inteiro.
  - Lista os requisitos, marca o que não está claro e dá nota de aderência ao `dados/perfil/banco.md`.
  - Inscrição aberta e aceita-Brasil são decididos no código: Gupy, Himalayas e GitHub já listam só vagas abertas; prazos vencidos e restrições de país são checados. Resultados da busca web vêm confirmados pela própria busca.
  - Vagas que claramente não servem são descartadas com o motivo.
- **Já me candidatei**: marque no card (o envio por e-mail marca sozinho); a vaga vai para o filtro **Aplicadas** e sai da fila de avaliação.
- A mesma vaga encontrada em vários sites aparece uma vez só, com os outros links em **Também em**.
- **Gerar currículo** numa vaga roda a função **gerador** com a descrição dela e lembra a pasta gerada.
- O estado fica em `dados/vagas.json`, fora do git.
- `node buscador.mjs` roda um ciclo avulso. Com `BUSCADOR=0`, o servidor sobe sem o agendador.
- A busca web precisa de um provedor com busca web; o "CLI local" exige o `claude` e o Command Code instalados e logados.

## Candidatura por e-mail

Algumas vagas pedem para enviar o currículo por e-mail. O buscador marca essas vagas e, no card, **Candidatar por e-mail** gera o currículo se ainda não existir, a função **gerador** escreve o rascunho (assunto + corpo) a partir do `dados/perfil/banco.md` e do relatório da vaga, e você revisa/edita antes de enviar.

- **Senha de app do Gmail** (uma vez):
  1. Ative a verificação em 2 etapas na sua Conta Google.
  2. Em https://myaccount.google.com/apppasswords, crie uma senha de app ("Outro" → "Currículo").
  3. Copie `.env.exemplo` para `.env` e preencha:
     ```
     GMAIL_USUARIO=seu.email@gmail.com
     GMAIL_SENHA_APP=xxxx xxxx xxxx xxxx
     GMAIL_NOME=Seu nome
     ```
  O `.env` fica fora do git. A aba Vagas mostra se o envio está configurado (`GET /api/email/status`).
- Ao enviar, o e-mail sai da sua conta do Gmail (aparece em **Enviados**) com o `curriculo.pdf` anexado. O servidor usa SMTP (`smtp.gmail.com:465`) com a senha de app; a senha nunca é devolvida nem registrada em log.
- Só é enviado quando você clica em enviar — nada é disparado automaticamente.
- Uma vaga só pode ser candidatada uma vez: depois do envio, o card mostra a data e o envio é bloqueado.
