/**
 * Traduz uma ENTRADA da fila da Rhyno para o participante do Hunter.
 *
 * Entrada da Rhyno (documentada): { id, username, message?, amount, quantity, fieldValues:[{label,value,sensitive}], createdAt }
 * Os campos "jogo" e "Pix" são campos configurados pelo streamer no evento; então são
 * localizados pelo TEXTO DO RÓTULO. Se o Xand usar outro nome, é só acrescentar aqui.
 */
// Campos da fila do Xand (confirmados): "NICKNAME DA TWITCH", "SLOT", "CHAVE PIX:"
const FIELD_ALIASES = {
  // rótulos (sem acento, minúsculos) que contêm alguma dessas palavras
  pix:    { any: ['pix'] },
  game:   { any: ['jogo', 'slot', 'game'], not: ['nick'] },   // "Nick no jogo" NÃO é o jogo
  twitch: { any: ['twitch'] },
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function findField(fieldValues, rule) {
  for (const f of fieldValues || []) {
    const l = norm(f && f.label);
    if (rule.any.some((w) => l.includes(w)) && !(rule.not || []).some((w) => l.includes(w))) {
      const v = f.value == null ? '' : String(f.value).trim();
      if (v) return v;
    }
  }
  return null;
}

function mapEntry(entry) {
  const fv = entry.fieldValues || [];
  const twitch = findField(fv, FIELD_ALIASES.twitch);
  const game = findField(fv, FIELD_ALIASES.game);
  const msg = typeof entry.message === 'string' ? entry.message.trim() : '';
  const t = Date.parse(entry.createdAt);
  return {
    nick: twitch || String(entry.username || '').trim(),
    slot: game || msg || '(jogo não informado)',
    slotMissing: !game,
    pix: findField(fv, FIELD_ALIASES.pix),
    valor: entry.amount == null || entry.amount === '' ? null : Number(entry.amount),
    quantity: Number(entry.quantity) > 0 ? Number(entry.quantity) : 1,
    externalId: entry.id != null ? String(entry.id) : null,
    participatedAt: Number.isFinite(t) ? t : null,
  };
}

module.exports = { mapEntry, FIELD_ALIASES, findField };
