/**
 * Salva um participante (venha da Rhyno ou de qualquer outra origem) no Firebase.
 * Esta parte NÃO depende do formato da Rhyno e já está pronta.
 *
 * Onde cada dado fica:
 *   queue/{id}                → dados do participante (nick, jogo, valor, origem, datas). Alimenta Admin e Roleta.
 *   adminPrivate/pix/{id}     → CHAVE PIX. Área separada, somente admin. Nunca vai para queue/ nem rank/.
 *   adminPrivate/rhynoSeen/{externalId} → controle anti-duplicidade (replays do webhook não duplicam).
 */
const { ValidationError } = require('./errors');

const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
// Chaves do Realtime Database não aceitam . $ # [ ] /
const safeKey = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

function validate(p) {
  const nick = clean(p && p.nick, 40);
  const slot = clean(p && p.slot, 60);
  if (!nick) throw new ValidationError('nick (Twitch) é obrigatório');
  if (!slot) throw new ValidationError('jogo/slot é obrigatório');
  const pix = clean(p.pix, 140) || null; // ausente => o admin completa no painel
  let valor = null;
  if (p.valor !== null && p.valor !== undefined && p.valor !== '') {
    valor = Number(p.valor);
    if (!Number.isFinite(valor) || valor < 0) throw new ValidationError('valor inválido');
  }
  const externalId = p.externalId ? String(p.externalId).slice(0, 200) : null;
  const quantity = Number(p.quantity) > 1 ? Math.floor(Number(p.quantity)) : 1;
  const at = Number(p.participatedAt);
  const participatedAt = Number.isFinite(at) && at > 0 ? at : null;
  return { nick, slot, pix, valor, externalId, participatedAt, quantity };
}

/**
 * @param {import('firebase-admin').database.Database} db
 * @param {object} raw  participante já normalizado (ver rhyno.adapter.js)
 * @param {{source?: 'RHYNO'|'MANUAL', now?: number}} [opts]
 */
async function saveParticipant(db, raw, opts = {}) {
  const source = opts.source || 'RHYNO';
  const p = validate(raw);
  const now = opts.now || Date.now();

  let key;
  if (p.externalId) {
    key = 'rhyno_' + safeKey(p.externalId);
    // Reserva o id de forma atômica: só o 1º envio passa.
    const tx = await db.ref('adminPrivate/rhynoSeen/' + key).transaction((cur) => (cur ? undefined : true));
    if (!tx.committed) return { status: 'duplicate', key };
  } else {
    key = db.ref('queue').push().key; // sem id da Rhyno não há como deduplicar
  }

  const bonusSnap = await db.ref('rinha/bonus').once('value');
  const ts = p.participatedAt || now;
  const entry = {
    nick: p.nick,
    slot: p.slot,
    prov: '',
    source,                         // 'RHYNO' | 'MANUAL'
    externalId: p.externalId,       // null é omitido pelo Firebase
    valor: p.valor,
    quantity: p.quantity,
    bonus: p.valor != null ? p.valor : (bonusSnap.val() || 0), // compatível com ranking existente
    platform: source.toLowerCase(),
    participatedAt: ts,
    receivedAt: now,
    time: new Date(ts).toLocaleTimeString('pt-BR'),
    ts,
  };
  const updates = { ['queue/' + key]: entry };
  if (p.pix) updates['adminPrivate/pix/' + key] = p.pix;
  await db.ref().update(updates);
  return { status: 'created', key, pixMissing: !p.pix };
}

module.exports = { saveParticipant, validate, safeKey };
