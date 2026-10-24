#!/usr/bin/env node
/* ============================================================================
   TEST — ÉTAPE 20 · le serveur minimal + le connecteur Chari (sandbox)
   Lance le vrai serveur (mode simulé, port éphémère) et le connecteur avec
   un faux fetch (mode sandbox) : aucun argent réel ne bouge pendant le test.
   LANCER :  node tests/test-serveur-chari.js
   ============================================================================ */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

let reussis = 0, total = 0;
function t(nom, ok, note) {
  total++;
  if (ok) { reussis++; console.log("  ✅ " + nom); }
  else { console.log("  ❌ " + nom + (note ? "\n      → " + note : "")); }
}

/* registre sauvegardé / restauré : le test ne doit pas gonfler le vrai registre */
const REG = path.join(__dirname, "..", "outils", "registre-paiements.json");
const ENC = path.join(__dirname, "..", "outils", "paiements-en-cours.json");
const USERS = path.join(__dirname, "..", "outils", "registre-utilisateurs.json");
const EMAILS = path.join(__dirname, "..", "emails");
const regExistait = fs.existsSync(REG), encExistait = fs.existsSync(ENC), usersExistait = fs.existsSync(USERS), emailsExistait = fs.existsSync(EMAILS);
const regAvant = regExistait ? fs.readFileSync(REG, "utf8") : "";
const encAvant = encExistait ? fs.readFileSync(ENC, "utf8") : "";
const usersAvant = usersExistait ? fs.readFileSync(USERS, "utf8") : "";
const emailsAvant = new Set(emailsExistait ? fs.readdirSync(EMAILS) : []);
const adminInitial = process.env.ARIANE_ADMIN, nodeEnvInitial = process.env.NODE_ENV;
function restaurerEtat() {
  for (const [f, existed, content] of [[REG,regExistait,regAvant],[ENC,encExistait,encAvant],[USERS,usersExistait,usersAvant]]) {
    if (existed) fs.writeFileSync(f, content); else if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  if (fs.existsSync(EMAILS)) {
    for (const f of fs.readdirSync(EMAILS)) if (!emailsAvant.has(f) && /^ARI-/.test(f)) fs.unlinkSync(path.join(EMAILS, f));
    if (!emailsExistait && fs.readdirSync(EMAILS).length === 0) fs.rmdirSync(EMAILS);
  }
  if (adminInitial === undefined) delete process.env.ARIANE_ADMIN; else process.env.ARIANE_ADMIN = adminInitial;
  if (nodeEnvInitial === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnvInitial;
}
process.on("exit", restaurerEtat);
fs.writeFileSync(USERS, "{}");          /* les paliers du test partent de zéro */

(async () => {
  /* ======================= T1 · l'échelle des prix ======================= */
  console.log("\n=== T1 · L'échelle des prix, crédit déduit, rien d'autre ===");
  const S = require("../outils/serveur-ariane.js");
  t("un Monde, c'est 39 et rien d'autre", S.montantAccepte("monde", 39) && !S.montantAccepte("monde", 38));
  t("l'accès local reconnaît les loopbacks IPv4/IPv6, pas une IP de LAN",
    S.adresseLoopback("127.0.0.1") && S.adresseLoopback("127.22.0.4") &&
    S.adresseLoopback("::1") && S.adresseLoopback("::ffff:127.0.0.1") &&
    !S.adresseLoopback("192.168.1.9") && !S.adresseLoopback("::ffff:192.168.1.9"));
  t("la session accepte le crédit (139, 100, 61, 22)", [139, 100, 61, 22].every(m => S.montantAccepte("session", m)));
  t("la session refuse un montant hors échelle", !S.montantAccepte("session", 120));
  t("un achat Monde exige exactement un numéro de I à V", S.mondesValides("monde", [2]) && !S.mondesValides("monde", null) && !S.mondesValides("monde", [2, 3]) && !S.mondesValides("monde", [6]));
  t("le lot de trois exige trois Mondes distincts", S.mondesValides("trois", [1, 3, 5]) && !S.mondesValides("trois", [2, 2, 3]) && !S.mondesValides("trois", [1, 2]));
  t("les produits pleine-session ne prennent pas de mondes fournis par le client", S.mondesValides("session", null) && !S.mondesValides("session", [2]));
  t("l'à-vie accepte 590 moins 39 × Mondes déjà payés", S.montantAccepte("vie", 590) && S.montantAccepte("vie", 473) && !S.montantAccepte("vie", 474));

  /* ======================= T2 · le serveur, mode simulé ======================= */
  console.log("\n=== T2 · Le serveur minimal (mode simulé) ===");
  const { server } = S;
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const PORT = server.address().port;
  const BASE = "http://127.0.0.1:" + PORT;
  const j = async (r) => r.json();

  const accueil = await fetch(BASE + "/");
  const html = await accueil.text();
  t("le serveur sert l'application (même origine que le paiement)", accueil.ok && /Ariane/.test(html));
  const traversal = await fetch(BASE + "/%2e%2e/outils/cle-ed25519-priv.pem");
  const traversalTexte = await traversal.text();
  t("un chemin sortant des racines statiques ne révèle pas la clé privée", !traversalTexte.includes("BEGIN PRIVATE KEY"));
  const dispo = await j(await fetch(BASE + "/chari/dispo"));
  t("sans clé Chari dans l'environnement, le mode est « simulé »", dispo.mode === "simule", JSON.stringify(dispo));

  const mauvais = await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produit: "monde", montant: 1 }) });
  t("un montant hors échelle est refusé (400)", mauvais.status === 400);
  const corpsNull = await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
  t("un JSON null est refusé proprement sans faire tomber le serveur (400)", corpsNull.status === 400);
  const mondeSansChoix = await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produit: "monde", montant: 39 }) });
  t("un achat Monde sans sélection valide est refusé (400)", mondeSansChoix.status === 400);
  const troisDupliques = await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produit: "trois", montant: 89, mondes: [2, 2, 3] }) });
  t("un lot de trois avec doublon est refusé (400)", troisDupliques.status === 400);

  const creer = await j(await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produit: "monde", mondes: [2], montant: 39 }) }));
  t("créer un paiement rend une référence imprévisible de 128 bits", creer.ok === true && /^ARI-[A-F0-9]{32}$/.test(creer.ref), JSON.stringify(creer));

  const avant3ds = await j(await fetch(BASE + "/paiement/statut?ref=" + creer.ref));
  t("avant le 3DS, le paiement est « ouvert », sans clé", avant3ds.etat === "ouvert" && avant3ds.cle === null);

  const confirme = await j(await fetch(BASE + "/paiement/simule-3ds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: creer.ref }) }));
  t("le 3DS simulé signe la clé", confirme.ok === true && confirme.cle && confirme.cle.length > 20);

  const apres = await j(await fetch(BASE + "/paiement/statut?ref=" + creer.ref));
  t("le statut passe à « paye » et rend la clé", apres.etat === "paye" && apres.cle === confirme.cle);

  const bis = await j(await fetch(BASE + "/paiement/simule-3ds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: creer.ref }) }));
  t("deux confirmations, une seule clé (idempotent)", bis.cle === confirme.cle);

  const wh = await fetch(BASE + "/chari/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { OperationStatus: 2, CustomData: creer.ref } }) });
  t("le webhook répond 200 en corps vide (moins de 5 s)", wh.status === 200 && (await wh.text()) === "{}");

  const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
  const ligne = reg[reg.length - 1];
  t("le paiement entre au registre avec son canal", ligne.ref === creer.ref && ligne.gateway === "chari-simule" && ligne.montant === 39, JSON.stringify(ligne));

  const retour = await (await fetch(BASE + "/paiement/retour?ref=" + creer.ref)).text();
  t("la page de retour donne la clé, calmement", retour.includes(confirme.cle) && /C'est à toi/.test(retour));
  const echec = await (await fetch(BASE + "/paiement/retour?ref=" + creer.ref + "&echec=1")).text();
  t("le retour en échec ne signe rien et ne culpabilise pas", /n'est pas passé/.test(echec) && !echec.includes(confirme.cle));
  const tropLourd = await fetch(BASE + "/avis/envoyer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texte: "x".repeat(70 * 1024) }) });
  t("les requêtes JSON de plus de 64 Ko sont rejetées (413)", tropLourd.status === 413);

  /* ======================= T3 · le connecteur, mode sandbox (fetch simulé) ======================= */
  console.log("\n=== T3 · Le connecteur Chari, d'après la documentation officielle ===");
  const { nouveauConnecteur } = require("../outils/chari-connecteur.js");
  const appels = [];
  const fauxFetch = async (url, opts) => {
    appels.push({ url, opts });
    if (/preview/.test(url)) return { ok: true, json: async () => ({ data: { type: 5, feesAmount: 0 } }) };
    if (/payment\/card\?/.test(url)) return { ok: true, json: async () => ({ data: { redirect: true, responseCode: 0, redirectionURL: "https://3ds.test/page", orderId: "CH123", transactionTrackId: "T456" } }) };
    if (/operations\/CH123/.test(url)) return { ok: true, json: async () => ({ data: { transactionStatus: 2 } }) };
    return { ok: false, json: async () => ({}) };
  };
  const c = nouveauConnecteur({ cleApi: "CLE-TEST", marchand: "+212600000000" }, fauxFetch);
  t("la base par défaut est le sandbox officiel", c.base === "https://sandbox.charimoney.com");

  const ap = await c.apercu(39);
  t("l'aperçu appelle le bon endpoint, avec la clé en en-tête",
    ap.ok && /merchant\/payment\/card\/preview\?phoneNumber=%2B212600000000$/.test(appels[0].url) &&
    appels[0].opts.headers["Chari-Api-Key"] === "CLE-TEST" && appels[0].opts.headers["C-Request-Id"]);

  const pay = await c.payer({ montant: 39, pan: "4918914107195005", cvv: "123", expiration: "2608",
    reference: "ARI-TEST", notificationUrl: "http://x/chari/webhook", acceptUrl: "http://x/ok", declineUrl: "http://x/non" });
  const corpsPay = JSON.parse(appels[1].opts.body);
  t("l'encaissement rend la page 3DS et les identifiants", pay.ok && pay.redirection === "https://3ds.test/page" && pay.orderId === "CH123");
  t("la carte part chez Chari (PAN, CVV, expiration YYMM) et l'auto-capture est vraie",
    corpsPay.pan === "4918914107195005" && corpsPay.cvv === "123" && corpsPay.expiryDate === "2608" && corpsPay.autoCapture === true);
  t("les trois URLs du parcours sont posées (webhook, succès, échec)",
    corpsPay.notificationUrl === "http://x/chari/webhook" && corpsPay.acceptUrl === "http://x/ok" && corpsPay.declineUrl === "http://x/non");
  t("la référence externe porte notre ref (le webhook la retrouvera)", corpsPay.externalReference === "ARI-TEST");

  const st = await c.statut("CH123");
  t("le statut lit transactionStatus (2 = COMPLETED)", st.ok && st.statut === 2);

  /* ======================= T5 · l'adoption pilote les prix ======================= */
  console.log("\n=== T5 · Le compteur anonyme, les paliers, le prix qui suit ===");
  const ping = (id) => fetch(BASE + "/compteur/ping?id=" + id).then(j);
  await ping("test-aaa1"); await ping("test-aaa2"); await ping("test-aaa3");
  let et = await fetch(BASE + "/compteur/etat").then(j);
  t("trois pings uniques = trois appareils comptés", et.total === 3 && et.palier === 0);
  t("le même identifiant ne compte jamais deux fois", (await ping("test-aaa1"), (await fetch(BASE + "/compteur/etat").then(j)).total === 3));
  t("palier 0 : 39 accepté, 45 refusé", S.montantAccepte("monde", 39) && !S.montantAccepte("monde", 45));
  const gros = {}; for (let i = 0; i < 120; i++) gros["test-" + i] = new Date().toISOString();
  fs.writeFileSync(USERS, JSON.stringify(gros));
  et = await fetch(BASE + "/compteur/etat").then(j);
  t("120 appareils : palier 1, seuil suivant annoncé (300)", et.palier === 1 && et.seuilSuivant === 300);
  t("le prix fait autorité côté serveur : 45 accepté, 39 refusé",
    S.montantAccepte("monde", 45) && !S.montantAccepte("monde", 39));
  t("l'échelle de crédit suit le palier (session 159, 114, 69)",
    [159, 114, 69].every(m => S.montantAccepte("session", m)) && !S.montantAccepte("session", 139));
  const r = await fetch(BASE + "/compteur/ping?id=..%2Fetc").then(x => x.json());
  t("un identifiant bizarre est ignoré poliment", r.ok === true);
  const et2 = await fetch(BASE + "/compteur/etat").then(j);
  t("l'identifiant rejeté n'a pas gonflé le compteur", et2.total === 120);

  /* ======================= T6 · les codes de classe ======================= */
  console.log("\n=== T6 · Le délégué paie un lot, les camarades reçoivent des codes ===");
  t("le lot de 5 vaut 495, pas 99", S.montantAccepte("classe5", 495) && !S.montantAccepte("classe5", 99));
  t("le lot de 10 vaut 850", S.montantAccepte("classe10", 850) && !S.montantAccepte("classe10", 495));
  const lot = await fetch(BASE + "/paiement/creer", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produit: "classe5", montant: 495,
      pan: "4918914107195005", cvv: "123", expiration: "12/27" }) }).then(j);
  const kl = await fetch(BASE + "/paiement/simule-3ds", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: lot.ref }) }).then(j);
  t("cinq codes émis, tous différents", kl.cles && kl.cles.length === 5 && new Set(kl.cles).size === 5);
  const K = require("../outils/cles-ed25519.js");
  const C2 = require("../outils/comptoir.js");
  const d0 = K.decoder(kl.cles[0]);
  t("chaque code est une clé de session signée (type 2)",
    d0 && d0.champs && d0.champs.type === 2 && K.verifierCle(C2.pub, d0.payload, d0.sig));
  const recuLot = S.recuHtml(lot.ref);
  t("le reçu nomme le lot (« Codes de classe — 5 personnes », 495,00 MAD)",
    !!recuLot && /Codes de classe — 5 personnes/.test(recuLot) && /495,00 MAD/.test(recuLot));
  const regTestAvant = fs.readFileSync(REG, "utf8");
  const refHostile = "<svg/onload=alert(1)>";
  fs.writeFileSync(REG, JSON.stringify([{ quand:"2026-10-06T10:00:00Z", produit:"<script>alert(1)</script>", montant:39,
    gateway:"<img src=x onerror=alert(1)>", ref:refHostile, acheteur:"<b>test</b>" }]));
  const recuHostile = S.recuHtml(refHostile);
  fs.writeFileSync(REG, regTestAvant);
  t("le reçu échappe les valeurs du registre au lieu de les exécuter", !!recuHostile &&
    !recuHostile.includes("<script>alert(1)</script>") && recuHostile.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));

  /* ======================= T7 · webhook de production : on re-vérifie ======================= */
  console.log("\n=== T7 · En production, l'annonce du webhook ne suffit pas ===");
  fs.writeFileSync(USERS, "{}");          /* retour au palier 0 : 39 accepté */
  S._setChariPourTests({ statut: async () => ({ ok: true, statut: 2 }) }, true);
  const w1 = await fetch(BASE + "/paiement/creer", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produit: "monde", mondes: [2], montant: 39,
      pan: "4918914107195005", cvv: "123", expiration: "12/27" }) }).then(j);
  const enCoursW1 = JSON.parse(fs.readFileSync(ENC, "utf8")); enCoursW1[w1.ref].orderId = "OP1"; fs.writeFileSync(ENC, JSON.stringify(enCoursW1, null, 1));
  await fetch(BASE + "/chari/webhook", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { OperationStatus: 2, CustomData: w1.ref, orderId: "OP1" } }) });
  const st1 = await fetch(BASE + "/paiement/statut?ref=" + w1.ref).then(j);
  t("statut Chari = 2 : la clé est émise", st1.cle || st1.etat === "paye", JSON.stringify(st1) + " · w1=" + JSON.stringify(w1));
  const w2 = await fetch(BASE + "/paiement/creer", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produit: "monde", mondes: [2], montant: 39,
      pan: "4918914107195005", cvv: "123", expiration: "12/27" }) }).then(j);
  const enCoursW2 = JSON.parse(fs.readFileSync(ENC, "utf8")); enCoursW2[w2.ref].orderId = "OP2"; fs.writeFileSync(ENC, JSON.stringify(enCoursW2, null, 1));
  S._setChariPourTests({ statut: async () => ({ ok: true, statut: 2 }) }, true);
  await fetch(BASE + "/chari/webhook", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { OperationStatus: 2, CustomData: w2.ref, orderId: "OP1" } }) });
  const foreign = await fetch(BASE + "/paiement/statut?ref=" + w2.ref).then(j);
  t("un orderId déjà payé ne peut pas être réaffecté à une autre référence", !foreign.cle && foreign.etat !== "paye");
  S._setChariPourTests({ statut: async () => ({ ok: true, statut: 1 }) }, true);
  await fetch(BASE + "/chari/webhook", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { OperationStatus: 2, CustomData: w2.ref, orderId: "OP2" } }) });
  const st2 = await fetch(BASE + "/paiement/statut?ref=" + w2.ref).then(j);
  t("webhook falsifié, statut Chari = 1 : aucune clé n'est émise", !st2.cle && st2.etat !== "paye");
  S._setChariPourTests({ statut: async () => { throw new Error("network"); } }, true);
  await fetch(BASE + "/chari/webhook", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { OperationStatus: 2, CustomData: w2.ref, orderId: "OP2" } }) });
  const st3 = await fetch(BASE + "/paiement/statut?ref=" + w2.ref).then(j);
  t("Chari injoignable : le doute profite à la caisse, rien n'est émis", !st3.cle && st3.etat !== "paye");
  S._setChariPourTests(null, false);

  /* ======================= T8 · aucune voie de secours ne signe en production ======================= */
  console.log("\n=== T8 · Le mode simulé et le retour ne peuvent pas contourner Chari en production ===");
  const pendingProd = await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produit: "monde", mondes: [3], montant: 39 }) }).then(j);
  const nodeEnvAvant = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const modeProd = await fetch(BASE + "/chari/dispo").then(j);
  const creerProd = await fetch(BASE + "/paiement/creer", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produit: "monde", mondes: [4], montant: 39 }) });
  const simProd = await fetch(BASE + "/paiement/simule-3ds", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: pendingProd.ref }) });
  const retourProd = await (await fetch(BASE + "/paiement/retour?ref=" + pendingProd.ref)).text();
  const statutProd = await fetch(BASE + "/paiement/statut?ref=" + pendingProd.ref).then(j);
  t("sans Chari sur le runtime de production, le mode annoncé est indisponible", modeProd.mode === "indisponible");
  t("la création d'un paiement simulé y est bloquée (503)", creerProd.status === 503);
  t("la route simule-3DS ne peut pas émettre de clé (404)", simProd.status === 404);
  t("un retour 3DS direct reste en attente, sans afficher de clé", retourProd.includes("Confirmation en cours") && !retourProd.includes("AEBB-"));
  t("le statut d'un paiement ouvert ne révèle aucune clé", statutProd.etat === "ouvert" && statutProd.cle === null);
  if (nodeEnvAvant === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnvAvant;

  const cheminServeur = path.join(__dirname, "..", "outils", "serveur-ariane.js");
  const codeMode = "const s=require(" + JSON.stringify(cheminServeur) + ");process.stdout.write(s.modePublic());";
  const modeDansEnfant = (env) => {
    const p = spawnSync(process.execPath, ["-e", codeMode], { encoding:"utf8", env:{
      ...process.env, NODE_ENV:"production", ORIGINE:"https://ariane.example.ma",
      CHARI_API_KEY:"test-api-key-not-a-real-credential-0123456789",
      CHARI_MARCHAND:"+212600000000", CHARI_BASE:"https://api.charimoney.com", ...env
    } });
    return p.status === 0 ? p.stdout.trim() : "ERREUR:" + (p.stderr || "").slice(0, 100);
  };
  t("Chari production exige NODE_ENV, HTTPS, l'hôte API exact et des identifiants non-placeholder",
    modeDansEnfant({}) === "production" &&
    modeDansEnfant({ ORIGINE:"http://127.0.0.1:8003" }) === "indisponible" &&
    modeDansEnfant({ NODE_ENV:"development" }) === "indisponible" &&
    modeDansEnfant({ CHARI_BASE:"https://api.charimoney.com.evil" }) === "indisponible" &&
    modeDansEnfant({ CHARI_BASE:"http://api.charimoney.com" }) === "indisponible" &&
    modeDansEnfant({ CHARI_API_KEY:"your-production-key" }) === "indisponible" &&
    modeDansEnfant({ CHARI_MARCHAND:"+2126xxxxxxxx" }) === "indisponible");

  /* ======================= T9 · borne anti-abus + vue créateur protégée ======================= */
  console.log("\n=== T9 · La borne anti-abus et le jeton du créateur ===");
  let vu429 = false;
  for (let i = 0; i < 30 && !vu429; i++) {
    const r = await fetch(BASE + "/paiement/creer", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ produit: "monde", mondes: [2], montant: 39,
        pan: "4918914107195005", cvv: "123", expiration: "12/27" }) });
    vu429 = r.status === 429;
  }
  t("au-delà de 20 créations par heure, le serveur dit 429", vu429);
  process.env.ARIANE_ADMIN = "s3cret";
  const sans = await fetch(BASE + "/compteur/etat");
  const avec = await fetch(BASE + "/compteur/etat", { headers: { Authorization: "Bearer s3cret" } });
  const querySecret = await fetch(BASE + "/compteur/etat?token=s3cret");
  const mauvaisMethode = await fetch(BASE + "/compteur/etat", { method: "POST", headers: { Authorization: "Bearer s3cret" } });
  t("vue créateur : 401 sans bearer, 200 avec header Authorization", sans.status === 401 && avec.status === 200);
  t("un jeton dans l'URL n'est plus accepté", querySecret.status === 401);
  t("la vue créateur n'accepte que GET", mauvaisMethode.status === 404);
  delete process.env.ARIANE_ADMIN;
  const libre = await fetch(BASE + "/compteur/etat");
  t("sans jeton, la vue reste accessible seulement en local en HTTP de développement", libre.status === 200);
  const nodeEnvAdminAvant = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.ARIANE_ADMIN = "a".repeat(64);
  const adminFaible = await fetch(BASE + "/compteur/etat");
  process.env.ARIANE_ADMIN = "0123456789abcdef".repeat(4);
  const adminPeriodique = await fetch(BASE + "/compteur/etat");
  delete process.env.ARIANE_ADMIN;
  const adminManquant = await fetch(BASE + "/compteur/etat");
  t("secret répétitif, secret périodique et secret absent bloqués en production (503)",
    adminFaible.status === 503 && adminPeriodique.status === 503 && adminManquant.status === 503);
  if (nodeEnvAdminAvant === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnvAdminAvant;

  /* ======================= résultat ======================= */
  server.close();
  restaurerEtat();
  console.log("\n=== RÉSULTAT : " + reussis + " réussis / " + total + " ===");
  process.exit(reussis === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
