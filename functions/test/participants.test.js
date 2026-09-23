// Testes locais (sem Firebase/Rhyno reais). Rode: node test/participants.test.js
const assert = require('assert');
const { saveParticipant } = require('../src/participants');
const { mapEntry } = require('../src/rhyno.mapping');
const { syncRhyno } = require('../src/sync');
const { createClient } = require('../src/rhyno.client');

function fakeDb() {
  const data = {}; let n = 0;
  const get = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), data);
  const set = (p, v) => { const ks = p.split('/'); let o = data; ks.slice(0, -1).forEach((k) => (o = o[k] = o[k] || {})); o[ks[ks.length - 1]] = v; };
  return { data, ref: (p = '') => ({
    push: () => ({ key: 'push' + (++n) }),
    once: async () => ({ val: () => get(p) }),
    set: async (v) => set(p, v),
    transaction: async (fn) => { const r = fn(get(p)); if (r === undefined) return { committed: false }; set(p, r); return { committed: true }; },
    update: async (u) => Object.entries(u).forEach(([k, v]) => set(k, v)),
  }) };
}
const entry = (id, over = {}) => ({ id, username: 'ze_rhyno', amount: 15, quantity: 1, createdAt: '2026-01-01T12:00:00Z',
  fieldValues: [
    { label: 'NICKNAME DA TWITCH', value: 'ZeTwitch', sensitive: false },
    { label: 'SLOT', value: 'Sweet Bonanza', sensitive: false },
    { label: 'CHAVE PIX:', value: 'ze@pix.com', sensitive: true } ], ...over });

(async () => {
  // mapeamento com os rótulos reais do Xand
  const m = mapEntry(entry('e1'));
  assert.deepStrictEqual([m.nick, m.slot, m.pix, m.valor], ['ZeTwitch', 'Sweet Bonanza', 'ze@pix.com', 15]);
  const m2 = mapEntry(entry('e2', { fieldValues: [] }));
  assert.strictEqual(m2.nick, 'ze_rhyno'); assert.strictEqual(m2.slotMissing, true);

  // sync completo com API falsa
  const db = fakeDb(); db.data.rinha = { bonus: 20 };
  let calls = 0;
  const client = { listEvents: async () => [{ id: 'ev-1', name: 'Fila do Xand', occupied: 2 }],
    getEvent: async () => { calls++; return { name: 'Fila do Xand', entries: [entry('e1'), entry('e3', { fieldValues: [{ label: 'SLOT', value: 'Mines' }] })] }; } };
  let r = await syncRhyno({ db, client, now: 1000000 });
  assert.strictEqual(r.status, 'no_event_selected');
  db.data.adminPrivate.config = { rhynoEventId: 'ev-1' };
  r = await syncRhyno({ db, client, now: 2000000 });
  assert.strictEqual(r.created, 2);
  const q = Object.values(db.data.queue);
  assert.ok(q.every((x) => x.source === 'RHYNO'));
  assert.ok(!JSON.stringify(db.data.queue).includes('ze@pix.com'), 'Pix não pode vazar para queue/');
  assert.strictEqual(db.data.adminPrivate.pix['rhyno_e1'], 'ze@pix.com');
  assert.strictEqual(db.data.adminPrivate.rhynoStatus.pixMissing, 1);
  r = await syncRhyno({ db, client, now: 3000000 });
  assert.strictEqual(r.duplicate, 2); assert.strictEqual(Object.keys(db.data.queue).length, 2);
  r = await syncRhyno({ db, client, now: 3000001 }); assert.strictEqual(r.status, 'skipped');
  await assert.rejects(() => saveParticipant(db, { nick: '', slot: 'x' }), /nick/);

  // erro da Rhyno vira status legível, sem credenciais
  const bad = { listEvents: async () => { throw new Error('Rhyno recusou as credenciais (HTTP 401)'); } };
  r = await syncRhyno({ db, client: bad, now: 9000000 });
  assert.strictEqual(r.status, 'error'); assert.strictEqual(db.data.adminPrivate.rhynoStatus.ok, false);

  // cliente HTTP: token em cache e chamadas com Bearer
  const seen = [];
  const f = async (url, o = {}) => { seen.push([url, o.method || 'GET', (o.headers || {}).Authorization]);
    if (url.endsWith('/v1/auth/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'TKN', expires_in: 3600 }) };
    return { ok: true, status: 200, json: async () => ([{ id: 'a', name: 'A' }]) }; };
  const c = createClient({ env: { RHYNO_CLIENT_ID: 'id', RHYNO_CLIENT_SECRET: 's' }, fetchImpl: f });
  await c.listEvents(); await c.listEvents();
  assert.strictEqual(seen.filter((x) => x[0].endsWith('/auth/token')).length, 1);
  assert.strictEqual(seen[1][2], 'Bearer TKN');
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
