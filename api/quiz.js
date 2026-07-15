// ============================================================
// Backend do quiz "Raio-X do Brasil" — Vercel Serverless Function (Node.js)
//
// O front (quiz.html) NUNCA recebe o gabarito nem a regra de cupom.
// Ele manda só as alternativas escolhidas; a correção acontece aqui.
//
// Endpoint: POST /api/quiz   (campo "action" no JSON)
//   - "check":  informa se o e-mail já concluiu o quiz (trava de 1 vez).
//   - "submit": corrige, calcula o cupom, grava no Supabase e devolve o resultado.
//
// Configuração via Environment Variables (painel do Vercel):
//   SUPABASE_URL           https://SEU_PROJETO.supabase.co
//   SUPABASE_SERVICE_KEY   service_role key (Settings > API)
//   BREVO_API_KEY          (opcional) para adicionar o e-mail à lista
//   BREVO_LIST_ID          (opcional) ID numérico da lista no Brevo
// ============================================================

// GABARITO — índice da alternativa correta (0=A, 1=B, 2=C, 3=D).
// A ordem bate com o array PERGUNTAS em quiz.html.
const GABARITO = [1, 3, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 3];
const TOTAL = GABARITO.length; // 15

// Cupons por faixa de acerto. Avaliado de cima para baixo:
// a primeira faixa cujo "min" o aluno alcançar, vence.
// A última (min: 0) garante que todo mundo receba um cupom.
const CUPONS = [
  { min: 12, cupom: 'QUIZ80' }, // >= 80% de acerto
  { min: 9,  cupom: 'QUIZ70' }, // 60% a 79%
  { min: 0,  cupom: 'QUIZ60' }, // piso: qualquer pontuação
];

// ---------- helpers Supabase (REST) ----------
function sbHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function sbFindByEmail(url, key, email) {
  const q = `${url}/rest/v1/quiz_respostas?email=eq.${encodeURIComponent(email)}&select=*&limit=1`;
  const r = await fetch(q, { headers: sbHeaders(key) });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// ---------- Brevo (best-effort: nunca derruba o quiz) ----------
async function brevoAddContact(email, nome) {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  if (!apiKey || !listId) return;
  const payload = { email, listIds: [listId], updateEnabled: true };
  if (nome) payload.attributes = { NOME: nome };
  try {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': apiKey },
      body: JSON.stringify(payload),
    });
  } catch (_) { /* silencioso de propósito */ }
}

// ---------- body reader ----------
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  // Normaliza a URL: tira espaços, barras e um /rest/v1 colado por engano.
  const SUPABASE_URL = (process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/+$/, '');
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    return;
  }

  let data;
  try { data = await readBody(req); } catch { data = {}; }

  const action = data.action || '';
  const email = (data.email || '').toString().trim().toLowerCase();

  if (!emailValido(email)) {
    res.status(400).json({ ok: false, error: 'invalid_email' });
    return;
  }

  try {
    // ---------- AÇÃO 1: check ----------
    if (action === 'check') {
      const row = await sbFindByEmail(SUPABASE_URL, SUPABASE_KEY, email);
      if (row) {
        res.status(200).json({
          ok: true, jaRespondeu: true,
          acertos: Number(row.acertos), total: TOTAL,
          cupom: row.cupom, comprou: Boolean(row.comprou),
        });
        return;
      }
      res.status(200).json({ ok: true, jaRespondeu: false });
      return;
    }

    // ---------- AÇÃO 2: submit ----------
    if (action === 'submit') {
      // trava de reincidência: já concluiu -> devolve o resultado antigo
      const existing = await sbFindByEmail(SUPABASE_URL, SUPABASE_KEY, email);
      if (existing) {
        res.status(200).json({
          ok: true, jaRespondeu: true,
          acertos: Number(existing.acertos), total: TOTAL,
          cupom: existing.cupom, comprou: Boolean(existing.comprou),
        });
        return;
      }

      const respostas = Array.isArray(data.respostas) ? data.respostas : null;
      if (!respostas || respostas.length !== TOTAL) {
        res.status(400).json({ ok: false, error: 'respostas_invalidas' });
        return;
      }

      const comprou = Boolean(data.comprou);
      const nome = comprou && data.nome ? String(data.nome).trim() : null;
      const telefone = comprou && data.telefone ? String(data.telefone).trim() : null;

      if (comprou && (!nome || !telefone)) {
        res.status(400).json({ ok: false, error: 'dados_comprador_faltando' });
        return;
      }

      // correção server-side
      let acertos = 0;
      const limpas = [];
      for (let i = 0; i < TOTAL; i++) {
        let escolha = parseInt(respostas[i], 10);
        if (!(escolha >= 0 && escolha <= 3)) escolha = -1;
        limpas.push(escolha);
        if (escolha === GABARITO[i]) acertos++;
      }

      // faixa de cupom
      let cupom = null;
      for (const faixa of CUPONS) {
        if (acertos >= faixa.min) { cupom = faixa.cupom; break; }
      }

      // grava (upsert por e-mail)
      const registro = {
        email, comprou, nome, telefone,
        acertos, cupom, respostas: limpas,
        status: 'concluido',
        concluido_em: new Date().toISOString(),
      };

      const insertUrl = `${SUPABASE_URL}/rest/v1/quiz_respostas?on_conflict=email`;
      const insert = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          ...sbHeaders(SUPABASE_KEY),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(registro),
      });

      if (!insert.ok) {
        const detail = await insert.text().catch(() => '');
        console.error('supabase insert failed', insert.status, insertUrl, detail);
        res.status(502).json({ ok: false, error: 'db_error', status: insert.status, detail: detail.slice(0, 400), url: insertUrl });
        return;
      }

      await brevoAddContact(email, nome); // best-effort

      res.status(200).json({ ok: true, acertos, total: TOTAL, cupom, comprou });
      return;
    }

    res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};
