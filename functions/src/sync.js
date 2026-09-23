/**
 * Sincroniza a fila da Rhyno para o Hunter (direção única: RHYNO → HUNTER).
 *
 *  1) lista os eventos de fila e grava em adminPrivate/rhynoEvents (o Admin escolhe qual usar);
 *  2) lê o evento escolhido (adminPrivate/config/rhynoEventId) com as entradas ativas;
 *  3) cada entrada vira participante via saveParticipant (idempotente pelo id da entrada);
 *  4) grava o resultado em adminPrivate/rhynoStatus para o Admin mostrar.
 *
 * Não apaga nada do Hunter quando alguém sai da fila da Rhyno.
 */
const { saveParticipant } = require('./participants');
const { mapEntry } = require('./rhyno.mapping');

const MIN_GAP_MS = 5000; // evita rodadas encavaladas

async function syncRhyno({ db, client, now = Date.now() }) {
  const statusRef = db.ref('adminPrivate/rhynoStatus');
  const prev = (await statusRef.once('value')).val();
  if (prev && prev.at && now - prev.at < MIN_GAP_MS) return { status: 'skipped' };

  try {
    const events = await client.listEvents();
    const evMap = {};
    events.forEach((e) => { evMap[e.id.replace(/[^A-Za-z0-9_-]/g, '_')] = { id: e.id, name: e.name, occupied: e.occupied }; });
    await db.ref('adminPrivate/rhynoEvents').set(evMap);

    const eventId = (await db.ref('adminPrivate/config/rhynoEventId').once('value')).val();
    if (!eventId) {
      await statusRef.set({ ok: true, at: now, message: 'Escolha o evento da Rhyno no painel' });
      return { status: 'no_event_selected' };
    }
    const detail = await client.getEvent(eventId);
    let created = 0, duplicate = 0, skipped = 0, slotMissing = 0, pixMissing = 0;
    for (const entry of detail.entries) {
      const p = mapEntry(entry);
      try {
        const r = await saveParticipant(db, p, { source: 'RHYNO', now });
        if (r.status === 'created') { created++; if (p.slotMissing) slotMissing++; if (r.pixMissing) pixMissing++; }
        else duplicate++;
      } catch (e) {
        if (e.name === 'ValidationError') skipped++; else throw e;
      }
    }
    await statusRef.set({ ok: true, at: now, eventName: detail.name || String(eventId), entries: detail.entries.length, created, duplicate, skipped, slotMissing, pixMissing });
    return { status: 'ok', created, duplicate, skipped };
  } catch (e) {
    // mensagem segura (nunca contém credenciais)
    await statusRef.set({ ok: false, at: now, message: String(e.message || 'Erro ao consultar a Rhyno').slice(0, 200) });
    return { status: 'error', message: e.message };
  }
}

module.exports = { syncRhyno };
