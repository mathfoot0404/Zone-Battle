'use strict';
/* ============================================================================
   Protocole ZONE BATTLE — messages echanges en WebSocket.

   Un message est un objet JSON { t: TYPE, ... }. Tout ce qui arrive du
   navigateur est considere comme hostile jusqu a preuve du contraire : la
   fonction lire() rejette ce qui n est pas conforme au lieu de laisser une
   donnee douteuse circuler dans le serveur.
   ========================================================================== */

/* --- du client vers le serveur --- */
const C = {
  BONJOUR:   'BONJOUR',      /* {pseudo, elo, jeton?}                      */
  CREER:     'ROOM_CREATE',  /* {}                                          */
  REJOINDRE: 'ROOM_JOIN',    /* {code}                                      */
  QUITTER:   'ROOM_LEAVE',   /* {}                                          */
  LANCER:    'GAME_START',   /* {}                    (createur uniquement) */
  ACTION:    'PLAYER_ACTION',/* {manche, prend:bool, ms}                    */
  PONG:      'PONG'
};

/* --- du serveur vers le client --- */
const S = {
  BIENVENUE:  'CONNECT',      /* {id, jeton, enLigne}                       */
  EN_LIGNE:   'ONLINE_COUNT', /* {n}                                        */
  SALLE:      'ROOM_STATE',   /* {code, hote, joueurs:[{id,pseudo,elo,pret}]}*/
  DEPART:     'GAME_START',   /* {manches, cible, chrono}                   */
  MANCHE:     'ROUND_START',  /* {manche, setup:{i,sys,d}}                  */
  RESULTAT:   'ROUND_RESULT', /* {manche, verdict, joueurs:{id:{prend,juste,ms}}} */
  ETAT:       'GAME_STATE',   /* {manche, scores:{id:n}}                    */
  FIN:        'GAME_END',     /* {scores, gagnant, elo:{id:{avant,apres,d}}} */
  ERREUR:     'ERROR',        /* {code, message}                            */
  PING:       'PING'
};

const ERR = {
  MESSAGE:      'MESSAGE_INVALIDE',
  SALLE_ABSENTE:'SALLE_INTROUVABLE',
  SALLE_PLEINE: 'SALLE_PLEINE',
  SALLE_EN_JEU: 'PARTIE_DEJA_LANCEE',
  PAS_HOTE:     'PAS_HOTE',
  PAS_ASSEZ:    'PAS_ASSEZ_DE_JOUEURS',
  HORS_TOUR:    'ACTION_HORS_TOUR',
  TROP_VITE:    'TROP_DE_MESSAGES'
};

const PSEUDO_MAX = 18;
const TAILLE_MAX = 2048;          /* octets par message                     */

function texte(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  /* On retire ce qui pourrait casser un affichage HTML cote client. */
  return t.replace(/[<>&"']/g, '') || null;
}

function entier(v, min, max, defaut) {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaut;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/* Analyse un message brut. Renvoie l objet valide, ou null. */
function lire(brut) {
  if (typeof brut !== 'string' || brut.length > TAILLE_MAX) return null;
  let m;
  try { m = JSON.parse(brut); } catch (e) { return null; }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  switch (m.t) {
    case C.BONJOUR:
      return { t: m.t,
        pseudo: texte(m.pseudo, PSEUDO_MAX) || 'Joueur',
        elo: entier(m.elo, 0, 100000, 0),
        jeton: texte(m.jeton, 64) };
    case C.CREER:
    case C.QUITTER:
    case C.LANCER:
    case C.PONG:
      return { t: m.t };
    case C.REJOINDRE: {
      const code = texte(m.code, 12);
      if (!code) return null;
      return { t: m.t, code: code.toUpperCase() };
    }
    case C.ACTION:
      if (typeof m.prend !== 'boolean') return null;
      return { t: m.t,
        manche: entier(m.manche, 0, 999, -1),
        prend: m.prend,
        ms: entier(m.ms, 0, 600000, 0) };
    default:
      return null;
  }
}

module.exports = { C, S, ERR, lire, texte, entier, PSEUDO_MAX, TAILLE_MAX };
