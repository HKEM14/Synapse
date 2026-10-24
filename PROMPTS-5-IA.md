# Consignes proposées — cinq relectures indépendantes du back-office

À utiliser seulement après inspection et approbation du paquet par son propriétaire. Envoyer le paquet séparément à chaque service/session ; ne pas transmettre les réponses précédentes avant la fin des cinq analyses.

## Consigne commune

> Relis uniquement les fichiers fournis. Le paquet est une copie source expurgée : il ne contient ni clé privée, ni credentials Chari, ni registre réel, ni corpus de cours. N'infère pas que ces éléments ont été vérifiés. Cherche des défauts concrets et reproductibles, pas seulement des préférences. Pour chaque constat, donne : gravité, chemin et fonction/ligne, précondition, scénario de reproduction, impact, résultat attendu, correctif minimal et test de non-régression proposé. Sépare les constats vérifiables du code des hypothèses qui demanderaient un déploiement ou une réponse de Chari. N'affirme pas avoir exécuté les suites ou contacté un service si tu ne l'as pas fait. Termine par les limites dues aux fichiers volontairement absents.

## Relecteur 1 — Paiement Chari et état de transaction

Analyse `outils/serveur-ariane.js` et `outils/chari-connecteur.js`. Trace une transaction depuis la création jusqu'au retour 3DS, au webhook, à la vérification du statut distant et à l'émission idempotente de la licence. Cherche les contournements, courses concurrentes, états ambigus, comportements réseau dégradés, usages des identifiants `orderId`/`trackId` et hypothèses sur les réponses Chari. Ne contacte pas la passerelle.

## Relecteur 2 — Authentification et autorisation administratives

Analyse `GET /compteur/etat`, la validation de `ARIANE_ADMIN`, la comparaison du Bearer, les modes d'exécution et `outils/check-production.js`. Cherche les voies d'accès non authentifiées, incohérences entre checklist et runtime, fuites de secret, méthodes HTTP non nécessaires et modes de panne ouverts. Distingue nettement la vue d'administration serveur du rapport CLI local.

## Relecteur 3 — Robustesse HTTP et exposition de fichiers/données

Analyse les routes, `corpsJson`, limites de taille, contrôle anti-abus, chemins statiques, reçus HTML et réponses d'erreur. Cherche traversal/symlinks, plantage sur JSON atypique, déni de service, XSS, fuite de données, cache inapproprié et comportements différents selon la méthode HTTP. Ne considère pas un contrôle statique comme une preuve de test d'intrusion.

## Relecteur 4 — Secrets et exploitation en production

Analyse `outils/comptoir.js`, `outils/cles-ed25519.js`, `docs/06-mise-en-ligne.md` et les fichiers `deploy/`. Vérifie le cycle de vie des clés, les permissions et emplacements de secrets, les paramètres systemd/reverse-proxy, la séparation sandbox/production, les journaux, sauvegardes et consignes de restauration. La clé privée et les vrais fichiers d'environnement sont absents : indique ce que cette absence empêche de conclure.

## Relecteur 5 — Rapport financier, intégrité et confidentialité

Analyse `outils/tableau-de-bord.js` et ses tests. Vérifie chaque agrégat, les hypothèses du registre, les cas de registre invalide/vide, l'échappement de la sortie HTML et le risque de divulgation des références ou identifiants dans les détails. Ne suppose pas que les chiffres d'exploitation réels sont dans le paquet.

## Format de réponse

1. Résumé (maximum cinq lignes).
2. Constats classés par gravité, chacun selon le format commun.
3. Zones examinées sans défaut observé.
4. Vérifications impossibles sans clé, configuration Chari, données de production ou environnement déployé.
5. Doutes et informations supplémentaires à demander au propriétaire.
