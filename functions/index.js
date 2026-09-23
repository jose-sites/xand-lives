/**
 * RHYNO → HUNTER (a Rhyno não tem webhook para fila: o Hunter consulta a API dela).
 *
 *  • rhynoSyncScheduled  → roda a cada 1 minuto (Cloud Scheduler; exige plano Blaze).
 *  • rhynoSyncOnRequest  → roda quando o Admin grava adminPrivate/rhynoSyncRequest
 *                          (botão "Atualizar agora" e atualização automática com o painel aberto).
 *
 * Nenhum endpoint HTTP público é exposto. Credenciais: segredos do Firebase
 *   firebase functions:secrets:set RHYNO_CLIENT_ID
 *   firebase functions:secrets:set RHYNO_CLIENT_SECRET
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { createClient } = require('./src/rhyno.client');
const { syncRhyno } = require('./src/sync');

admin.initializeApp();

const runtime = functions.runWith({ secrets: ['RHYNO_CLIENT_ID', 'RHYNO_CLIENT_SECRET'], timeoutSeconds: 60 });
const client = createClient(); // guarda o token em memória entre execuções

const run = () => syncRhyno({ db: admin.database(), client });

exports.rhynoSyncScheduled = runtime.pubsub.schedule('every 1 minutes').onRun(async () => { await run(); return null; });
exports.rhynoSyncOnRequest = runtime.database.ref('/adminPrivate/rhynoSyncRequest').onWrite(async () => { await run(); return null; });
