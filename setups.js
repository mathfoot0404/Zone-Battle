'use strict';
/* ============================================================================
   Vivier de setups, cote serveur.

   Le fichier data/setups.txt est le champ « z » extrait tel quel du jeu : la
   meme chaine, le meme decodeur. Les deux cotes lisent donc exactement les
   memes donnees, ce qui garantit que le serveur et les navigateurs parlent
   du meme setup quand ils echangent un index.

   C est ce qui rend l arbitrage possible : le verdict d un setup (la cible
   est-elle touchee avant le stop ?) est precalcule dans le champ « v ». Le
   serveur n a donc pas besoin de croire le navigateur sur parole.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const d36 = s => {
  let n = 0;
  const neg = s[0] === '-';
  for (const ch of (neg ? s.slice(1) : s)) n = n * 36 + parseInt(ch, 36);
  return neg ? -n : n;
};

const SYSTEMES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'systemes.json'), 'utf8'));

/* Risque maximal admis, en part du prix : identique au client. Les setups au
   stop demesure sont injouables a l ecran, on ne les tire pas. */
const RISQUE_MAX = 0.0045;

const SETUPS = (() => {
  const brut = fs.readFileSync(path.join(__dirname, 'setups.txt'), 'utf8');
  const out = [];
  let prevI = 0;
  for (const ligne of brut.split('|')) {
    const p = ligne.split('.');
    const i = prevI + d36(p[0]);
    prevI = i;
    out.push({
      i,                                   /* index de bougie              */
      d: p[1] === '1' ? 1 : -1,            /* sens : 1 achat, -1 vente     */
      r: d36(p[2]) / 100,                  /* risque en points             */
      z: d36(p[3]) / 100,                  /* hauteur de zone              */
      v: p[6].split('').map(Number),       /* verdicts pour 1R, 2R, 3R, 4R */
      sys: +p[7]                           /* systeme                      */
    });
  }
  return out;
})();

/* Le prix n est pas dans « z » ; on approche la contrainte de risque par une
   borne absolue calibree sur la meme intention. Le client, lui, dispose du
   prix exact — les deux filtres se recoupent a moins d un pourcent pres, et
   seul le client decide de l affichage. */
const JOUABLES = SETUPS.filter(s => s.r > 0 && s.r <= 20);

function melange(tab, alea) {
  const a = tab.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Generateur deterministe : a partir d une graine, le serveur et les deux
   clients peuvent rejouer exactement la meme suite si besoin. */
function alea(graine) {
  let x = graine >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    return x / 4294967296;
  };
}

/* Tire n setups distincts et suffisamment eloignes les uns des autres, comme
   le fait le client : deux setups voisins donnent le meme graphique. */
function tirage(n, graine) {
  const rnd = alea(graine);
  const choisis = [];
  const zones = new Set();
  let essais = 0;
  while (choisis.length < n && essais < n * 400) {
    essais++;
    const s = JOUABLES[Math.floor(rnd() * JOUABLES.length)];
    const zone = s.i >> 9;
    if (zones.has(zone)) continue;
    zones.add(zone);
    choisis.push({ i: s.i, sys: s.sys, d: s.d });
  }
  return choisis;
}

/* Verdict officiel d un setup pour une cible donnee (1 a 4 R).
   Renvoie true si la cible est touchee avant le stop, false sinon, null si
   ni l une ni l autre dans la fenetre — auquel cas la manche ne compte pas. */
const parIndex = new Map();
for (const s of SETUPS) parIndex.set(s.i + '|' + s.sys, s);

function verdict(i, sys, cible) {
  const s = parIndex.get(i + '|' + sys);
  if (!s) return null;
  const k = Math.max(0, Math.min(3, Math.round(cible) - 1));
  const v = s.v[k];
  return v === 2 ? null : v === 1;
}

module.exports = { SETUPS, JOUABLES, SYSTEMES, tirage, verdict, RISQUE_MAX };
