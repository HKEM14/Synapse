#!/usr/bin/env node
/* ============================================================================
   TEST — LE TABLEAU DE BORD : chaque chiffre, recomputé à la main sur un
   registre contrôlé. Le tableau ne déclare rien : il lit.
   Lancer : node tests/test-tableau.js
   ========================================================================== */
const T = require("../outils/tableau-de-bord.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

let ok = 0, ko = 0;
const verif = (cond, libelle) => {
  if (cond) { ok++; console.log("  ✔ " + libelle); }
  else { ko++; console.error("  ✘ " + libelle); }
};

const R = [
  { quand: "2026-10-02T10:00:00Z", produit: "monde",  montant: 39,  gateway: "sandbox", ref: "R1", acheteur: "a1" },
  { quand: "2026-10-05T10:00:00Z", produit: "monde",  montant: 39,  gateway: "sandbox", ref: "R2", acheteur: "a2" },
  { quand: "2026-10-09T10:00:00Z", produit: "session",montant: 61,  gateway: "sandbox", ref: "R3", acheteur: "a1" },
  { quand: "2026-11-03T10:00:00Z", produit: "monde",  montant: 39,  gateway: "cash",    ref: "R4", acheteur: "a3" },
  { quand: "2026-11-04T10:00:00Z", produit: "vie",    montant: 590, gateway: "sandbox", ref: "R5", acheteur: "a2" }
];
const t = T.calculer(R, { emises: 3 });

verif(t.revenus.total === 39 + 39 + 61 + 39 + 590, "le revenu total est la somme des lignes, rien de plus");
verif(t.revenus.parMois["2026-10"] === 139 && t.revenus.parMois["2026-11"] === 629, "le revenu par mois se recompte");
verif(t.revenus.parProduit.vie === 590 && t.revenus.parProduit.monde === 117, "le revenu par produit se recompte");
verif(t.transactions === 5, "cinq transactions");
verif(t.acheteurs.length === 3, "trois acheteurs distincts (a1, a2, a3)");
verif(t.panierMoyen === Math.round(768 / 3), "panier moyen = revenu ÷ acheteurs (256)");
verif(t.mix.monde === 3 && t.mix.session === 1 && t.mix.vie === 1, "le mix compte chaque achat");
verif(t.retour2eAchat === Math.round(100 * 2 / 3), "retour du 2ᵉ achat : 2 acheteurs sur 3 sont revenus (67 %)");
verif(t.renouvellements === 2, "a1 (monde→session) et a2 (monde→vie) comptent comme élargissements");
verif(t.cohortes["2026-10"].acheteurs === 2 && t.cohortes["2026-10"].revenus === 39 + 39 + 61 + 590,
      "cohorte d'octobre : 2 acheteurs, tout leur revenu (même tardif) rattaché à leur premier mois");
verif(t.cohortes["2026-11"].acheteurs === 1 && t.cohortes["2026-11"].revenus === 39,
      "cohorte de novembre : a3 seul — le à-vie de a2 reste compté en octobre");
verif(t.vie.emises === 3 && t.vie.restantes === 97, "les clés à vie : 3 émises, 97 restantes, limite réelle");
verif(t.attendentServeur.length === 4, "quatre chiffres attendent le serveur, affichés « — », jamais estimés");

/* registre vide : le tableau reste juste */
const z = T.calculer([], { emises: 0 });
verif(z.revenus.total === 0 && z.panierMoyen === 0 && z.retour2eAchat === null,
      "registre vide : zéros et tirets, pas de divisions par zéro");

/* le détail cite exactement les lignes */
const rap = T.rapport(T.calculer(R, { emises: 3 }), true);
verif(R.every(l => rap.includes(l.ref)), "le détail liste chaque ligne du registre");
verif(rap.includes("seuil qui décide : 35 %"), "le seuil du modèle est rappelé à côté du chiffre");
verif(T.html(t).includes("768"), "la sortie HTML porte le revenu total");

/* les champs venant d'un registre sont des données, jamais du HTML */
const hostile = T.calculer([{ quand:"2026-10-01T00:00:00Z", produit:"<script>alert(1)</script>", montant:1,
  gateway:"<img src=x onerror=alert(1)>", ref:"\"><svg/onload=alert(1)>", acheteur:"<b>acheteur</b>" }], { emises:0 });
const htmlHostile = T.html(hostile);
verif(!htmlHostile.includes("<script>alert(1)</script>") && htmlHostile.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
      "les valeurs du registre sont échappées dans le rapport HTML");
verif(T.rapport(T.calculer([], { emises:0 }), false).includes("Par produit             : —") &&
      T.rapport(T.calculer([], { emises:0 }), false).includes("Mix des achats          : —"),
      "registre vide : les lignes Par produit et Mix affichent bien un tiret");
const tmpReg = path.join(os.tmpdir(), "ariane-registre-invalide-" + process.pid + ".json");
fs.writeFileSync(tmpReg, "{}");
let invalideRefuse = false;
try { T.lireRegistre(tmpReg); } catch (e) { invalideRefuse = /tableau est attendu/.test(e.message); }
finally { try { fs.unlinkSync(tmpReg); } catch (e) { } }
verif(invalideRefuse, "un registre JSON valide mais de mauvais type provoque une erreur, pas un faux zéro");

console.log(ko === 0 ? "\n✅ TABLEAU DE BORD : " + ok + " contrôles réussis" : "\n❌ " + ko + " échec(s) sur " + (ok + ko));
process.exit(ko === 0 ? 0 : 1);
