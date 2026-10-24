#!/usr/bin/env node
/* Teste les portes de sécurité de la checklist de mise en ligne, sans réseau. */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");

const script = path.join(__dirname, "..", "outils", "check-production.js");
let ok = 0, ko = 0;
const t = (name, cond, detail = "") => {
  if (cond) { ok++; console.log("  ✅ " + name); }
  else { ko++; console.error("  ❌ " + name + (detail ? " → " + detail : "")); }
};
const baseEnv = { ...process.env, NODE_ENV:"production", ORIGINE:"https://ariane.example.ma", PORT:"8003" };
const mauvais = spawnSync(process.execPath, [script], { encoding:"utf8", env:{
  ...baseEnv,
  CHARI_API_KEY:"test-api-key-not-a-real-credential-0123456789",
  CHARI_MARCHAND:"+212600000000",
  CHARI_BASE:"https://sandbox.charimoney.com",
  ARIANE_ADMIN:"mettre-un-secret-ici"
} });
const sortieMauvaise = (mauvais.stdout || "") + (mauvais.stderr || "");
t("le profil production avec secret faible et base sandbox est bloqué", mauvais.status === 1,
  "status=" + mauvais.status);
t("le rapport nomme le secret admin faible", /ARIANE_ADMIN absent, placeholder ou trop faible/.test(sortieMauvaise));
t("le rapport bloque aussi la base Chari sandbox", /CHARI_BASE doit pointer vers https:\/\/api\.charimoney\.com/.test(sortieMauvaise));
const clesPlaceholder = spawnSync(process.execPath, [script], { encoding:"utf8", env:{
  ...baseEnv,
  CHARI_API_KEY:"mettre-la-cle-ici",
  CHARI_MARCHAND:"+2126xxxxxxxx",
  CHARI_BASE:"https://api.charimoney.com",
  ARIANE_ADMIN:"b".repeat(64)
} });
t("les placeholders Chari restent bloqués même si le secret admin est fort",
  clesPlaceholder.status === 1 && /clés Chari\/numéro marchand absents ou placeholders/.test((clesPlaceholder.stdout || "") + (clesPlaceholder.stderr || "")));

const bonSecret = crypto.randomBytes(32).toString("hex");
const valide = spawnSync(process.execPath, [script], { encoding:"utf8", env:{
  ...baseEnv,
  CHARI_API_KEY:"test-api-key-not-a-real-credential-0123456789",
  CHARI_MARCHAND:"+212600000000",
  CHARI_BASE:"https://api.charimoney.com",
  ARIANE_ADMIN:bonSecret
} });
const sortieValide = (valide.stdout || "") + (valide.stderr || "");
t("un profil de production configuré et une paire de signature cohérente passent", valide.status === 0,
  "status=" + valide.status + "\n" + sortieValide.slice(-700));
t("le jeton d'administration fort est reconnu", /ARIANE_ADMIN a le format hexadécimal attendu pour 256 bits/.test(sortieValide));

const periodique = spawnSync(process.execPath, [script], { encoding:"utf8", env:{
  ...baseEnv,
  CHARI_API_KEY:"test-api-key-not-a-real-credential-0123456789",
  CHARI_MARCHAND:"+212600000000",
  CHARI_BASE:"https://api.charimoney.com",
  ARIANE_ADMIN:"0123456789abcdef".repeat(4)
} });
const sortiePeriodique = (periodique.stdout || "") + (periodique.stderr || "");
t("un secret hexadécimal manifestement périodique est rejeté", periodique.status === 1 && /ARIANE_ADMIN absent, placeholder ou trop faible/.test(sortiePeriodique));

const sansCadreProd = spawnSync(process.execPath, [script], { encoding:"utf8", env:{
  ...process.env,
  NODE_ENV:"development",
  ORIGINE:"",
  CHARI_API_KEY:"test-api-key-not-a-real-credential-0123456789",
  CHARI_MARCHAND:"+212600000000",
  CHARI_BASE:"https://api.charimoney.com",
  ARIANE_ADMIN:bonSecret
} });
const sortieSansCadre = (sansCadreProd.stdout || "") + (sansCadreProd.stderr || "");
t("la passerelle de production sans NODE_ENV production ni origine HTTPS est bloquée",
  sansCadreProd.status === 1 && /NODE_ENV=production est requis/.test(sortieSansCadre) && /ORIGINE doit être configurée en HTTPS/.test(sortieSansCadre));

console.log("\n=== RÉSULTAT : " + ok + " réussis / " + (ok + ko) + " ===");
process.exit(ko ? 1 : 0);
