# ZONE BATTLE — depot a plat

Tous les fichiers sont a la racine, sans aucun sous-dossier. C est la
disposition la plus simple a envoyer sur GitHub depuis un telephone, ou
l interface web ne permet pas de glisser un dossier.

## Les onze fichiers

```
package.json      declaration du projet
render.yaml       configuration de deploiement
server.js         serveur HTTP + WebSocket
protocol.js       messages et validation des entrees
players.js        sessions, jetons, presence
rooms.js          salles privees et codes ZB-XXXX
game.js           deroulement du duel et arbitrage
setups.js         vivier de setups et verdicts
setups.txt        les 157 939 setups (3,3 Mo)
systemes.json     noms des systemes
graphique.html    le jeu (8 Mo)
```

Il faut les onze. S il en manque un, le serveur ne demarre pas.

## Mise en ligne sur Render

1. github.com → nouveau depot public `zone-battle`
2. **uploading an existing file** → envoyer les onze fichiers → **Commit**
3. render.com → **New +** → **Web Service** → choisir le depot
4. Render lit `render.yaml` et se configure seul. Verifier : Build `npm install`,
   Start `node server.js`, Instance **Free**
5. **Create Web Service**, trois a cinq minutes

L adresse s affiche en haut. Elle fonctionne pour toujours, sans rien lancer.

## En local, si besoin

```
npm install
npm start
```

Puis http://localhost:3000
