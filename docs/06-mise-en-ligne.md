# Étape finale — la mise en ligne, sans rien casser

L'application est finie, testée (704 + 203 + 11 contrôles), et son entrée de production
existe déjà : `outils/serveur-ariane.js` sert l'appli, le paiement et le webhook sur une
seule origine. Ce document dit exactement ce qui reste, et ce qui est à vous.

## Ce qui est prêt (rien à faire)

- Le serveur minimal : `node outils/serveur-ariane.js` (PORT par défaut 8003).
- Le service worker et le manifest : l'appli s'installe sur téléphone ; le hors ligne
  fonctionne dès que le site est en HTTPS (ou localhost).
- Le paiement : simulation uniquement en HTTP local ; sandbox avec
  `CHARI_API_KEY` + `CHARI_MARCHAND` ; production avec, en plus,
  `CHARI_BASE=https://api.charimoney.com`. Chari production reste indisponible
  tant que `NODE_ENV=production`, l'hôte API exact et une `ORIGINE` en HTTPS ne
  sont pas tous configurés avec des identifiants réels (sans placeholders).
- `deploy/ariane.service` fixe `NODE_ENV=production` et lit les secrets depuis
  `/etc/ariane/ariane.env` (hors dépôt ; propriétaire root, groupe du service,
  droits 0640). Le fichier contient `CHARI_API_KEY`, `CHARI_MARCHAND`,
  `CHARI_BASE` et `ARIANE_ADMIN` — jamais des valeurs d'exemple.
- Les prix, les clés, le registre et le tableau de bord restent sur le serveur.

## Blindé pour la production (étape 35, codé et testé)

- **Paiement confirmé côté serveur** : le webhook doit correspondre à une
  référence et à un `orderId` déjà enregistrés, puis le serveur re-demande le
  statut à Chari (`GET /api/operations/{id}`) et n'émet la clé que si
  `transactionStatus` vaut 2. Le retour 3DS vérifie aussi ce statut ; la route
  `simule-3ds` ne répond qu'en HTTP local simulé. Références de paiement tirées
  aléatoirement sur 128 bits. Chari injoignable ou statut différent : aucune
  clé n'est émise. En production sans Chari correctement configuré, le paiement
  est indisponible — jamais simulé.
- **Borne anti-abus** : 20 créations de paiement par heure et par IP, au-delà
  le serveur répond 429. Vos parcours de test restent largement dessous.
- **Vue créateur protégée** : le seul endpoint `GET /compteur/etat` échoue
  fermé en production (ou sur toute origine HTTPS) si `ARIANE_ADMIN` est absent,
  faible, manifestement périodique ou encore un placeholder. Le secret doit être
  une valeur hexadécimale de 64 caractères générée au hasard. Pour l'appeler,
  envoyer `Authorization: Bearer <secret>` ;
  ne jamais placer le jeton dans l'URL (historique et journaux). En HTTP local,
  sans secret, l'endpoint reste accessible uniquement depuis l'ordinateur lui-même
  (loopback) ; dès qu'un secret existe, l'en-tête Bearer est requis. Générer le secret avec
  `openssl rand -hex 32` et le garder dans `/etc/ariane/ariane.env`, hors dépôt.

## La boîte à outils de l'ouverture (étape 36)

- `node outils/check-production.js` — la checklist avant d'ouvrir : version de
  Node, fichiers présents, **ORIGINE en HTTPS obligatoire (blocage sinon)**,
  `NODE_ENV=production` quand Chari production est choisi, clés Chari,
  ARIANE_ADMIN et PORT. Dit « vous pouvez ouvrir » ou vous arrête.
- `sh outils/sauvegarde.sh [dossier]` — emballe les 6 trésors (données élèves,
  avis, reçus, secrets, clé d'accès) en `.zip` daté — à copier **hors de la
  machine** (disque externe, cloud chiffré).
- `node outils/fumee.js https://votre-domaine` — juste après l'ouverture :
  sonde les 8 points vitaux (appli, sw, manifeste, encyclopédie, `/sante`,
  pouls anonyme, reçu inconnu, passerelle).
- `/sante` — la sonde de vie du serveur : `{ok:true, mode, version}`.
- `deploy/ariane.service` — service systemd prêt à l'emploi (redémarre seul
  en cas de chute) ; `deploy/nginx-ariane.conf` — HTTPS certbot →
  127.0.0.1:8003, à adapter au domaine.

## Ce qui est à vous (trois décisions, une après-midi)

1. **Le domaine** — un `.ma` coûte environ 100-150 MAD/an (ou un .com ~120). Choisissez
   le nom ; « ariane » seul est probablement pris, pensez « ariane-med.ma » ou
   « ariane.app ». Le nom de la marque, lui, est déjà posé.
2. **La machine** — deux options honnêtes :
   - un petit VPS (ex. 4-5 €/mois) : vous copiez le dossier, lancez le serveur derrière
     nginx + Let's Encrypt (HTTPS gratuit, indispensable au service worker) ;
   - un PaaS type Render/Railway (plan gratuit ou ~7 $/mois) : dépôt git, le serveur
     démarre tout seul, HTTPS fourni.
   Dans les deux cas : `PORT=80` (ou 443 via nginx), et le dossier `app/` + `outils/`
   suffisent — rien d'autre n'est requis.
3. **La sauvegarde** — trois fichiers sont votre trésor : `registre-paiements.json`,
   `paiements-en-cours.json`, et `cle-ed25519-priv.pem` (la clé qui signe les licences :
   la perdre = devoir réémettre les clés). Copie hebdomadaire hors de la machine.

## L'ordre conseillé

1. Domaine + machine + HTTPS (1 h si le domaine est déjà propagé).
2. Lancer le serveur en mode simulé, ouvrir sur téléphone, installer la PWA, vérifier
   le hors ligne (avion) — c'est votre recette de test, elle est dans les journaux.
3. Demander la clé sandbox Chari (docs/05), poser les deux variables, rejouer le
   parcours avec la carte de test.
4. Ouvrir aux étudiants en gardant la phase d'essai (`PHASE_ESSAI = true`) : tout reste
   ouvert, les portes ne servent qu'à montrer le prix honnête. Le jour où vous passez
   la production Chari, mettez `PHASE_ESSAI = false` — une ligne.
5. La fiscalité (auto-entrepreneur, 0,5-1 %, ~50 MAD et 48 h) est un chantier séparé,
   « presque un nouveau projet » comme vous l'avez dit : il peut courir en parallèle,
   il ne bloque rien techniquement.

## Ce que je ne peux pas faire à votre place

Créer le compte du domaine, celui de la machine, et signer le formulaire Chari —
trois identités qui doivent être la vôtre. Tout le reste est codé, testé, documenté.
