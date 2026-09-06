'use strict';
/* ============================================================================
   ZONE BATTLE — serveur de duel.

   Il fait deux choses : servir le fichier de jeu, et arbitrer les duels. Le
   mode solo n en depend jamais : si ce serveur est eteint, le jeu s ouvre et
   fonctionne comme avant, seul le menu EN LIGNE reste inaccessible.
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const { C, S, ERR, lire } = require('./protocol');
const { Joueurs, PING_MS } = require('./players');
const { Salles, MAX_JOUEURS } = require('./rooms');
const { Partie } = require('./game');

const PORT = process.env.PORT || 3000;
/* Tous les fichiers sont a la racine : c est la disposition la plus simple a
   envoyer sur GitHub depuis un telephone, ou l on ne peut pas glisser de
   dossier. Le jeu est donc servi depuis le meme repertoire que le serveur. */
const CLIENT = __dirname;

const horo = () => new Date().toTimeString().slice(0, 8);
const log = m => console.log('[' + horo() + '] ' + m);

/* ---------------------------------------------------------------- fichiers */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.json': 'application/json', '.ico': 'image/x-icon' };

const serveur = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' ) url = '/graphique.html';
  /* On ne sort jamais du dossier client, quoi qu on demande. */
  const cible = path.normalize(path.join(CLIENT, url));
  if (!cible.startsWith(CLIENT)) { res.writeHead(403); return res.end('interdit'); }
  fs.readFile(cible, (err, data) => {
    if (err) { res.writeHead(404); return res.end('introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(cible)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ------------------------------------------------------------------ reseau */
const wss = new WebSocketServer({ server: serveur, maxPayload: 4096 });
const joueurs = new Joueurs(log);
const salles = new Salles(log);

function diffuseEnLigne() {
  const n = joueurs.enLigne;
  joueurs.tous(j => joueurs.envoie(j, { t: S.EN_LIGNE, n }));
}
function etatSalle(s) {
  if (!s) return;
  const e = { t: S.SALLE, ...salles.etat(s) };
  for (const j of s.joueurs) joueurs.envoie(j, e);
}
function erreur(j, code, message) {
  joueurs.envoie(j, { t: S.ERREUR, code, message: message || code });
}

wss.on('connection', (ws, req) => {
  ws.vivant = true;
  ws.compteur = 0;                 /* limite de debit, remise a zero au ping */
  ws.on('pong', () => { ws.vivant = true; });

  ws.on('message', brut => {
    /* Un client trop bavard est ignore plutot que de faire tomber le serveur. */
    if (++ws.compteur > 60) return;
    const m = lire(String(brut));
    if (!m) { if (ws.joueur) erreur(ws.joueur, ERR.MESSAGE); return; }
    const j = ws.joueur;

    if (m.t === C.BONJOUR) {
      const nouveau = joueurs.entre(ws, m.pseudo, m.elo, m.jeton);
      joueurs.envoie(nouveau, { t: S.BIENVENUE, id: nouveau.id,
        jeton: nouveau.jeton, enLigne: joueurs.enLigne });
      diffuseEnLigne();
      /* reprise d une partie en cours apres coupure */
      if (nouveau.salle) {
        const s = salles.get(nouveau.salle);
        if (s) etatSalle(s);
      }
      return;
    }
    if (!j) return;                /* tout le reste exige un BONJOUR d abord */

    switch (m.t) {
      case C.CREER: {
        if (j.salle) salles.quitte(j);
        const s = salles.cree(j);
        if (!s) return erreur(j, ERR.MESSAGE, 'plus de code disponible');
        etatSalle(s);
        break;
      }
      case C.REJOINDRE: {
        if (j.salle) { const a = salles.quitte(j); etatSalle(a); }
        const r = salles.rejoint(m.code, j);
        if (r.erreur) return erreur(j, r.erreur);
        etatSalle(r.salle);
        break;
      }
      case C.QUITTER: {
        const s = salles.get(j.salle);
        if (s && s.partie) s.partie.abandon(j);
        const reste = salles.quitte(j);
        etatSalle(reste);
        joueurs.envoie(j, { t: S.SALLE, code: null, joueurs: [] });
        break;
      }
      case C.LANCER: {
        const s = salles.get(j.salle);
        if (!s) return erreur(j, ERR.SALLE_ABSENTE);
        if (s.hote !== j.id) return erreur(j, ERR.PAS_HOTE);
        if (s.partie) return erreur(j, ERR.SALLE_EN_JEU);
        if (s.joueurs.length < MAX_JOUEURS) return erreur(j, ERR.PAS_ASSEZ);
        s.partie = new Partie(s, s.joueurs.slice(),
          (jj, o) => joueurs.envoie(jj, o), log);
        s.partie.demarre();
        break;
      }
      case C.ACTION: {
        const s = salles.get(j.salle);
        if (!s || !s.partie) return erreur(j, ERR.HORS_TOUR);
        const e = s.partie.action(j, m.manche, m.prend, m.ms);
        if (e) erreur(j, e);
        break;
      }
    }
  });

  ws.on('close', () => {
    const j = ws.joueur;
    if (!j) return;
    const s = salles.get(j.salle);
    joueurs.sort(j, perdu => {
      /* la session ne revient pas : on libere sa place */
      const s2 = salles.get(perdu.salle);
      if (s2 && s2.partie) s2.partie.abandon(perdu);
      etatSalle(salles.quitte(perdu));
      diffuseEnLigne();
    });
    if (s) etatSalle(s);
    diffuseEnLigne();
  });

  ws.on('error', () => {});
});

/* Sondage des connexions : une connexion muette est fermee. */
setInterval(() => {
  wss.clients.forEach(ws => {
    ws.compteur = 0;
    if (!ws.vivant) return ws.terminate();
    ws.vivant = false;
    try { ws.ping(); } catch (e) {}
  });
  salles.balaie();
}, PING_MS);

serveur.listen(PORT, () => {
  log('[SERVEUR] Demarrage sur le port ' + PORT);
  log('[SERVEUR] Jeu servi depuis ' + CLIENT);
  log('[SERVEUR] Ouvre http://localhost:' + PORT);
});
