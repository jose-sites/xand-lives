/**
 * Cliente da API pública da Rhyno (open-api).
 * Baseado no que foi lido da documentação:
 *   POST /v1/auth/token            { grant_type:'client_credentials', client_id, client_secret } -> { access_token, token_type, expires_in, scopes }
 *   GET  /v1/queue-tickets         lista os eventos de fila ativos do streamer autenticado
 *   GET  /v1/queue-tickets/{id}    evento + entradas ativas (fields[], entries[])
 *
 * Credenciais: SOMENTE por variáveis de ambiente/segredos do Firebase
 * (RHYNO_CLIENT_ID, RHYNO_CLIENT_SECRET). Nunca no código nem no frontend.
 */
class RhynoApiError extends Error {
  constructor(msg, status) { super(msg); this.name = 'RhynoApiError'; this.status = status || null; }
}

const DEFAULT_BASE = 'https://open-api.thecoolrhyno.com'; // ⚠️ confirmar (é o domínio da documentação)

function pickArray(body, keys) {
  if (Array.isArray(body)) return body;
  for (const k of keys) if (body && Array.isArray(body[k])) return body[k];
  return null;
}

function createClient({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const base = (env.RHYNO_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  let cached = null; // { token, exp }

  async function getToken(force = false) {
    if (!force && cached && cached.exp > now() + 60000) return cached.token;
    const client_id = env.RHYNO_CLIENT_ID, client_secret = env.RHYNO_CLIENT_SECRET;
    if (!client_id || !client_secret) throw new RhynoApiError('Credenciais da Rhyno não configuradas no servidor');
    const res = await fetchImpl(base + '/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id, client_secret }),
    });
    if (!res.ok) throw new RhynoApiError('Rhyno recusou as credenciais (HTTP ' + res.status + ')', res.status);
    const j = await res.json();
    if (!j.access_token) throw new RhynoApiError('Resposta de token inesperada');
    cached = { token: j.access_token, exp: now() + (Number(j.expires_in) || 3600) * 1000 };
    return cached.token;
  }

  async function get(path, retry = true) {
    const token = await getToken();
    const res = await fetchImpl(base + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    if (res.status === 401 && retry) { cached = null; return get(path, false); }
    if (res.status === 403) throw new RhynoApiError('Sem permissão para ler filas (o acesso precisa incluir a fila/queue)', 403);
    if (!res.ok) throw new RhynoApiError('Rhyno respondeu HTTP ' + res.status + ' em ' + path.split('?')[0], res.status);
    return res.json();
  }

  return {
    async listEvents() {
      const body = await get('/v1/queue-tickets');
      const arr = pickArray(body, ['events', 'data', 'items', 'results']);
      if (!arr) throw new RhynoApiError('Formato inesperado em /v1/queue-tickets');
      return arr.filter((e) => e && e.id).map((e) => ({
        id: String(e.id), name: String(e.name || e.id),
        occupied: Number.isFinite(Number(e.occupiedEntries)) ? Number(e.occupiedEntries) : null,
      }));
    },
    async getEvent(id) {
      const body = await get('/v1/queue-tickets/' + encodeURIComponent(id));
      const ev = body && body.entries ? body : (body && (body.event || body.data)) || null;
      if (!ev || !Array.isArray(ev.entries)) throw new RhynoApiError('Formato inesperado no detalhe do evento');
      return ev;
    },
  };
}

module.exports = { createClient, RhynoApiError };
