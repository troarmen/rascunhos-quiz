# Quiz · Raio-X do Brasil

Quiz de cupons do curso **Raio-X do Brasil**, do canal [Rascunhos Econômicos](https://www.youtube.com/@RascunhosEconomicos).

O usuário responde 15 perguntas de economia e ganha um cupom de desconto conforme
os acertos. Quem declara já ser aluno tem nome + telefone gravados para a
masterclass futura.

## Stack

Front estático + função serverless Node.js (Vercel) + Supabase.

- `quiz.html` — front do quiz (sem segredos)
- `api/quiz.js` — função serverless: correção + Supabase (gabarito e regra de cupom ficam aqui)
- `supabase_schema.sql` — tabela do quiz (rodar uma vez no Supabase)
- `vercel.json` — serve o quiz na raiz do domínio
- `.env.example` — modelo das variáveis de ambiente
- `logo.svg` — logo oficial do Rascunhos Econômicos

## Fluxo

e-mail → "já comprou?" → 15 perguntas → resultado (cupom ou confirmação de vaga).

- Uma resposta por e-mail (constraint `unique` no Supabase).
- Gabarito e regra de cupom vivem **só em `api/quiz.js`** — o front nunca os vê.
- Faixas de cupom (editáveis em `api/quiz.js`, const `CUPONS`): 12–15 → `QUIZ80`, 9–11 → `QUIZ70`, 0–8 → `QUIZ60`.

## Deploy no Vercel

1. **Supabase:** crie um projeto, abra **SQL Editor › New query**, cole o
   conteúdo de `supabase_schema.sql` e rode. Em **Settings › API**, copie a
   **Project URL** e a **service_role key**.
2. **Vercel:** em [vercel.com](https://vercel.com) › **Add New › Project** ›
   importe o repositório `goodjenian/rascunhos-economicos-masterclass`.
3. Em **Settings › Environment Variables**, cadastre:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `BREVO_API_KEY` (opcional)
   - `BREVO_LIST_ID` (opcional)
4. **Deploy.** O Vercel serve `quiz.html` na raiz e expõe a função em `/api/quiz`.
   A cada `git push` na branch `main`, o deploy é refeito automaticamente.
5. **Hotmart:** configure os 3 cupons com **limite de usos** e **validade curta**
   (importante: o `QUIZ80`, dos que mais acertam, deve ter o **maior desconto**).

> Rodar local (opcional): `npm i -g vercel`, copie `.env.example` para `.env`,
> preencha e rode `vercel dev`.

## Exportar dados

- **Compradores (masterclass):** Supabase › Table Editor › `quiz_respostas` ›
  filtre `comprou = true` › Export CSV.
- A validação de quem realmente comprou é feita depois, cruzando esse CSV com o
  export de compradores da Hotmart — não durante o quiz.

## Identidade visual

Paleta e tipografia herdadas de [raioxdobrasil.com.br](https://raioxdobrasil.com.br):

- Dark: `#0a0e1a` · `#060912`
- Accent (dourado): `#c8a45c`
- Fontes: Fraunces (serif) + Inter (sans)
