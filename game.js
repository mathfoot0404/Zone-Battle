'use strict';
/* ============================================================================
   Duel — la partie se joue ici, pas dans le navigateur.

   Regle : les deux joueurs recoivent les MEMES setups, dans le meme ordre.
   Chacun annonce sa lecture, TP ou SL. Le serveur detient le verdict reel
   (precalcule dans les donnees) et compte les points lui-meme. Un navigateur
   modifie ne peut donc pas s attribuer une bonne reponse : il ne fait
   qu envoyer son choix, jamais son score.

   La cible est fixee a 2R et la marge de stop a zero pour toute la partie.
   C est ce qui rend le verdict precalcule applicable, donc l arbitrage
   possible. Le solo garde ses reglages libres.
   ========================================================================== */
const setups = require('./setups');
const { S } = require('./protocol');

const MANCHES = 12;
const CIBLE = 2;
const CHRONO_MS = 15000;
const MARGE_MS = 3000;          /* tolerance reseau avant de trancher      */

/* Elo : meme formule que le client, pour que les deux affichent la meme
   chose. Le serveur reste seul juge du resultat. */
const K = 44, PLACEMENT = 5;
function attendu(mien, adv) { return 1 / (1 + Math.pow(10, (adv - mien) / 1200)); }
function mouvement(mien, adv, res, parties) {
  const k = K * (parties < PLACEMENT ? 2 : 1);
  return Math.round(k * (res - attendu(mien, adv)));
}

class Partie {
  constructor(salle, joueurs, envoi, log) {
    this.salle = salle;
    this.joueurs = joueurs;
    this.envoi = envoi;
    this.log = log;
    this.graine = (Math.random() * 4294967295) >>> 0;
    this.setups = setups.tirage(MANCHES, this.graine);
    this.manche = -1;
    this.scores = {};
    this.temps = {};
    this.reponses = null;
    this.minuteur = null;
    this.finie = false;
    for (const j of joueurs) { this.scores[j.id] = 0; this.temps[j.id] = 0; }
  }

  demarre() {
    this.log('[PARTIE] ' + this.salle.code + ' demarre — ' +
      this.joueurs.map(j => j.pseudo).join(' contre '));
    this.diffuse({ t: S.DEPART, manches: MANCHES, cible: CIBLE, chrono: CHRONO_MS,
      joueurs: this.joueurs.map(j => ({ id: j.id, pseudo: j.pseudo, elo: j.elo })) });
    this.mancheSuivante();
  }

  diffuse(obj) { for (const j of this.joueurs) this.envoi(j, obj); }

  mancheSuivante() {
    if (this.finie) return;
    this.manche++;
    if (this.manche >= MANCHES) return this.termine();
    this.reponses = {};
    const s = this.setups[this.manche];
    this.log('[PARTIE] ' + this.salle.code + ' manche ' + (this.manche + 1) +
      '/' + MANCHES + ' — setup ' + s.i);
    this.diffuse({ t: S.MANCHE, manche: this.manche, total: MANCHES, setup: s });
    clearTimeout(this.minuteur);
    this.minuteur = setTimeout(() => this.tranche(), CHRONO_MS + MARGE_MS);
  }

  /* Une reponse arrive. On ne la prend qu une fois, et seulement pour la
     manche en cours : un client en retard ou en avance est ignore. */
  action(j, manche, prend, ms) {
    if (this.finie || manche !== this.manche) return 'ACTION_HORS_TOUR';
    if (this.reponses[j.id]) return 'ACTION_HORS_TOUR';
    this.reponses[j.id] = {
      prend,
      ms: Math.max(0, Math.min(CHRONO_MS, ms))   /* le temps est borne */
    };
    if (Object.keys(this.reponses).length >= this.joueurs.length) this.tranche();
    return null;
  }

  tranche() {
    if (this.finie) return;
    clearTimeout(this.minuteur);
    const s = this.setups[this.manche];
    const v = setups.verdict(s.i, s.sys, CIBLE);   /* la verite, cote serveur */
    const detail = {};
    for (const j of this.joueurs) {
      const r = this.reponses[j.id];
      let juste = false;
      if (r && v !== null) juste = (r.prend === v);
      if (juste) this.scores[j.id]++;
      this.temps[j.id] += r ? r.ms : CHRONO_MS;
      detail[j.id] = { prend: r ? r.prend : null, juste, ms: r ? r.ms : null };
    }
    this.diffuse({ t: S.RESULTAT, manche: this.manche,
      verdict: v, detail, scores: this.scores });
    setTimeout(() => this.mancheSuivante(), 1800);
  }

  /* Un joueur part en cours de partie : l autre gagne, on ne laisse pas la
     partie en suspens. */
  abandon(j) {
    if (this.finie) return;
    this.log('[PARTIE] ' + this.salle.code + ' — ' + j.pseudo + ' abandonne');
    this.termine(j.id);
  }

  termine(abandonne) {
    if (this.finie) return;
    this.finie = true;
    clearTimeout(this.minuteur);
    const [a, b] = this.joueurs;
    let gagnant = null;
    if (abandonne) gagnant = this.joueurs.find(j => j.id !== abandonne).id;
    else if (this.scores[a.id] !== this.scores[b.id])
      gagnant = this.scores[a.id] > this.scores[b.id] ? a.id : b.id;
    else if (this.temps[a.id] !== this.temps[b.id])
      /* a egalite de lecture, le plus rapide l emporte */
      gagnant = this.temps[a.id] < this.temps[b.id] ? a.id : b.id;

    const elo = {};
    for (const j of this.joueurs) {
      const adv = this.joueurs.find(x => x.id !== j.id);
      const res = gagnant === null ? 0.5 : (gagnant === j.id ? 1 : 0);
      const d = mouvement(j.elo, adv.elo, res, j.eloParties || 0);
      elo[j.id] = { avant: j.elo, apres: Math.max(0, j.elo + d), d, res };
      j.elo = elo[j.id].apres;
      j.eloParties = (j.eloParties || 0) + 1;
    }
    this.log('[PARTIE] ' + this.salle.code + ' terminee — ' +
      this.joueurs.map(j => j.pseudo + ' ' + this.scores[j.id]).join(' / ') +
      (gagnant ? ' — gagnant ' + gagnant : ' — egalite'));
    this.diffuse({ t: S.FIN, scores: this.scores, temps: this.temps,
      gagnant, abandon: abandonne || null, elo });
    this.salle.partie = null;
  }
}

module.exports = { Partie, MANCHES, CIBLE, CHRONO_MS };
