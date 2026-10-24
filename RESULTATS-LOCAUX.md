# Résultats des contrôles locaux

**Date : 6 octobre 2026.** Ces contrôles ont été exécutés sur la copie de travail originale, qui conserve localement la clé privée hors de cette archive. Ils ne constituent ni un avis indépendant d'IA, ni un audit externe, ni un test d'intrusion ou une certification.

| Contrôle | Résultat | Portée utile |
|---|---:|---|
| `node --check` sur serveur, connecteur, comptoir, tableau, checklist et tests concernés | réussi | Syntaxe JavaScript |
| `node tests/test-serveur-chari.js` | **62/62** | Tarifs, paiement simulé, Chari avec faux `fetch`, vérification serveur, reçus, limites, authentification admin, garde-fous production, accès local loopback et traversal statique |
| `node tests/test-tableau.js` | **20/20** | Agrégats financiers, registre vide/invalide, échappement HTML |
| `node tests/test-check-production.js` | **8/8** | Profil production, sandbox/placeholders, secret admin faible/périodique et exigences de contexte HTTPS/production |
| `node tests/test-cles.js` | **22/22** | Signature Ed25519 et vérification hors ligne |
| `node tests/test-pwa.js` | **55/55** | PWA et synchronisation du service worker |

Le service worker a été régénéré après la dernière modification de `app/index.html` : version `38f29ef0a2`, 29 fichiers précachés. Les tests serveur ont sauvegardé puis restauré les registres et le dossier `emails/` ; aucun achat réel ni appel réseau à Chari n'a été effectué.

## Corrections back-office incluses dans cette copie

- Chari production est indisponible sans `NODE_ENV=production`, origine HTTPS, hôte API Chari exact et identifiants non-placeholder.
- La vue créateur est servie uniquement en GET et exige le Bearer configuré hors développement local.
- Le secret admin doit être de 64 caractères hexadécimaux ; les chaînes manifestement répétées/périodiques sont rejetées.
- Un JSON `null` ou un autre corps non objet ne fait plus planter le serveur.
- Un chemin statique sortant des racines approuvées ne révèle pas la clé de signature.
- Les contrôles de production exigent la passerelle Chari de production, HTTPS et l'environnement adéquat avant l'ouverture.

## Limites

- Aucun paiement réel, environnement Chari, déploiement public ou essai sur Mac/iPhone physique n'a été validé dans ce lot.
- La clé privée, les fichiers `.env`, les reçus, les registres et les données étudiantes sont volontairement absents du paquet.
- Les résultats ci-dessus sont des tests locaux de l'auteur du dépôt ; cinq avis IA indépendants n'ont pas été obtenus.
