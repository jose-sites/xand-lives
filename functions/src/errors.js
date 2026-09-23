// Erros tipados usados pelo webhook para responder com o status HTTP certo.

/** A integração com a Rhyno ainda não foi configurada (falta documentação oficial). */
class RhynoNotConfiguredError extends Error {
  constructor(where) {
    super(`Integração Rhyno não configurada: complete "${where}" em functions/src/rhyno.adapter.js`);
    this.name = 'RhynoNotConfiguredError';
  }
}
/** A requisição não veio (comprovadamente) da Rhyno. */
class RhynoAuthError extends Error {
  constructor(msg = 'Requisição não autenticada') { super(msg); this.name = 'RhynoAuthError'; }
}
/** O payload não tem os campos mínimos (nick e jogo). */
class ValidationError extends Error {
  constructor(msg) { super(msg); this.name = 'ValidationError'; }
}
module.exports = { RhynoNotConfiguredError, RhynoAuthError, ValidationError };
