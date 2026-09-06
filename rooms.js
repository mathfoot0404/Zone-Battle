'use strict';
/* ============================================================================
   Salles privees.

   Un code court, lisible au telephone, sans caracteres ambigus : ni O ni 0,
   ni I ni 1. Format ZB-XXXX. Le serveur seul les genere et verifie leur
   existence — un client ne peut pas se declarer dans une salle qui n existe
   pas, ni forcer un code deja pris.
   ========================================================================== */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_JOUEURS = 2;               /* un duel se joue a deux             */
const VIE_MS = 2 * 60 * 60 * 1000;   /* une salle oubliee finit par mourir */

class Salles {
  constructor(log) {
    this.log = log;
    this.parCode = new Map();
  }

  codeLibre() {
    for (let essai = 0; essai < 200; essai++) {
      let c = '';
      for (let k = 0; k < 4; k++)
        c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      const code = 'ZB-' + c;
      if (!this.parCode.has(code)) return code;
    }
    return null;
  }

  cree(hote) {
    const code = this.codeLibre();
    if (!code) return null;
    const s = {
      code, hote: hote.id, joueurs: [hote],
      partie: null, nee: Date.now()
    };
    this.parCode.set(code, s);
    hote.salle = code;
    this.log('[SALLE] ' + code + ' creee par ' + hote.pseudo);
    return s;
  }

  rejoint(code, j) {
    const s = this.parCode.get(code);
    if (!s) return { erreur: 'SALLE_INTROUVABLE' };
    if (s.partie) return { erreur: 'PARTIE_DEJA_LANCEE' };
    if (s.joueurs.length >= MAX_JOUEURS) return { erreur: 'SALLE_PLEINE' };
    if (s.joueurs.some(x => x.id === j.id)) return { salle: s };
    s.joueurs.push(j);
    j.salle = code;
    this.log('[SALLE] ' + j.pseudo + ' rejoint ' + code);
    return { salle: s };
  }

  quitte(j) {
    if (!j || !j.salle) return null;
    const s = this.parCode.get(j.salle);
    j.salle = null;
    if (!s) return null;
    s.joueurs = s.joueurs.filter(x => x.id !== j.id);
    this.log('[SALLE] ' + j.pseudo + ' quitte ' + s.code);
    if (!s.joueurs.length) {
      this.parCode.delete(s.code);
      this.log('[SALLE] ' + s.code + ' fermee, plus personne');
      return null;
    }
    if (s.hote === j.id) {
      s.hote = s.joueurs[0].id;
      this.log('[SALLE] ' + s.joueurs[0].pseudo + ' devient hote de ' + s.code);
    }
    return s;
  }

  get(code) { return this.parCode.get(code) || null; }

  /* Menage : les salles abandonnees ne doivent pas s accumuler. */
  balaie() {
    const t = Date.now();
    for (const [code, s] of this.parCode) {
      const vivants = s.joueurs.filter(j => j.vivant).length;
      if ((!vivants && t - s.nee > 60000) || t - s.nee > VIE_MS) {
        this.parCode.delete(code);
        this.log('[SALLE] ' + code + ' balayee');
      }
    }
  }

  etat(s) {
    return {
      code: s.code, hote: s.hote, enJeu: !!s.partie,
      joueurs: s.joueurs.map(j => ({
        id: j.id, pseudo: j.pseudo, elo: j.elo, vivant: !!j.vivant
      }))
    };
  }
}

module.exports = { Salles, MAX_JOUEURS };
