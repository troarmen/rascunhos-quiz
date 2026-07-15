-- ============================================================
-- Quiz "Raio-X do Brasil" — tabela de respostas
-- Rode este script UMA vez no Supabase: Dashboard > SQL Editor > New query.
-- ============================================================

create table if not exists public.quiz_respostas (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,          -- trava "uma vez por e-mail"
  comprou      boolean not null default false,-- declarou já ter comprado o curso?
  nome         text,                          -- preenchido só por quem declarou compra
  telefone     text,                          -- idem
  acertos      int  not null default 0,       -- 0 a 15
  cupom        text,                          -- QUIZ60 / QUIZ70 / QUIZ80
  respostas    jsonb,                         -- array com as alternativas escolhidas (auditoria)
  status       text not null default 'concluido',
  criado_em    timestamptz not null default now(),
  concluido_em timestamptz
);

-- Consulta rápida por e-mail (o unique já cria índice, mas deixamos explícito o padrão de acesso).
create index if not exists quiz_respostas_comprou_idx on public.quiz_respostas (comprou);

-- ------------------------------------------------------------
-- Segurança: mantemos RLS LIGADO e NÃO criamos nenhuma policy.
-- Assim o acesso público (anon key) fica 100% bloqueado.
-- O quiz.php acessa a tabela com a SERVICE ROLE key, que ignora
-- o RLS por definição — então só o servidor lê/grava aqui.
-- ------------------------------------------------------------
alter table public.quiz_respostas enable row level security;

-- ============================================================
-- COMO EXPORTAR OS COMPRADORES (para a masterclass futura):
--   Table Editor > quiz_respostas > filtre comprou = true > Export > CSV
-- ou rode:  select nome, email, telefone from public.quiz_respostas where comprou = true;
-- ============================================================
