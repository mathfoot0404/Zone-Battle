'use strict';
/* ============================================================================
   Joueurs connectes.

   Chaque connexion recoit un identifiant de session propre au serveur. Le
   client peut presenter un jeton pour reprendre une session interrompue : ce
   jeton est genere par le serveur, jamais par le navigateur — sinon deux
   joueurs pourraient revendiquer la meme identite.
   ========================================================================== */
const crypto = require('crypto');

const PING_MS = 25000;          /* on sonde les connexions muettes          */
const GRACE_MS = 45000;         /* delai pour se reconnecter                */

class Joueurs {
  constructor(log) {
    this.log = log;
    this.parId = new Map();       /* id -> joueur           */
    this.parJeton = new Map();    /* jeton -> joueur        */
    this.suivant = 1;
  }

  /* Cree ou reprend une session. */
  entre(ws, pseudo, elo, jeton) {
    let j = jeton ? this.parJeton.get(jeton) : null;
    if (j && j.partie === null && !j.vivant) {
      /* reprise : on rebranche la meme identite sur la nouvelle connexion */
      clearTimeout(j.grace);
      j.grace = null;
    } else if (j && j.vivant) {
      /* le jeton est deja utilise par une connexion active : on refuse la
         reprise et on ouvre une session neuve, pour ne pas se retrouver avec
         deux navigateurs qui parlent au nom du meme joueur */
      j = null;
    }
    if (!j) {
      j = {
        id: 'J' + (this.suivant++),
        jeton: crypto.randomBytes(16).toString('hex'),
        salle: null, partie: null
      };
      this.parJeton.set(j.jeton, j);
      this.parId.set(j.id, j);
    }
    j.ws = ws;
    j.pseudo = pseudo;
    j.elo = elo;
    j.vivant = true;
    j.dernier = Date.now();
    ws.joueur = j;
    this.log('[JOUEUR] ' + j.pseudo + ' (' + j.id + ') connecte');
    return j;
  }

  /* Deconnexion : on garde la session en reserve le temps d une reconnexion. */
  sort(j, quandPerdu) {
    if (!j) return;
    j.vivant = false;
    j.ws = null;
    this.log('[JOUEUR] ' + j.pseudo + ' (' + j.id + ') deconnecte');
    j.grace = setTimeout(() => {
      this.parJeton.delete(j.jeton);
      this.parId.delete(j.id);
      this.log('[JOUEUR] ' + j.pseudo + ' abandonne definitivement');
      if (quandPerdu) quandPerdu(j);
    }, GRACE_MS);
  }

  envoie(j, obj) {
    if (!j || !j.ws || j.ws.readyState !== 1) return false;
    try { j.ws.send(JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  get enLigne() {
    let n = 0;
    for (const j of this.parId.values()) if (j.vivant) n++;
    return n;
  }

  tous(fn) { for (const j of this.parId.values()) if (j.vivant) fn(j); }
}

module.exports = { Joueurs, PING_MS, GRACE_MS };
