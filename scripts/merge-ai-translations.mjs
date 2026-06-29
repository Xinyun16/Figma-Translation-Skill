#!/usr/bin/env node

import fs from "node:fs";

const LANGS = ["DE", "FR", "ES"];
const DEFAULT_LENGTH_TOLERANCE = 2;
const MAX_LENGTH_VIOLATION_SAMPLES = 50;

function usage() {
  return `Usage:
  node scripts/merge-ai-translations.mjs --plan plan.json --ai ai-translations.json --out consolidated-translations.json

AI JSON can be one of:
  { "DE": { "source": "translation" }, "FR": {...}, "ES": {...} }
  { "translations": { "DE": {...}, "FR": {...}, "ES": {...} } }
  [ { "sourceText": "source", "lang": "DE", "translation": "..." } ]
  [ { "sourceText": "source", "DE": "...", "FR": "...", "ES": "..." } ]
`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function emptyTranslations() {
  return Object.fromEntries(LANGS.map((lang) => [lang, {}]));
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\s\u00a0\u2028\u2029]+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/’/g, "'")
    .replace(/”/g, '"')
    .replace(/“/g, '"')
    .trim();
}

function charCount(value) {
  return Array.from(normalizeText(value)).length;
}

function normalizeAiTranslations(value) {
  const out = emptyTranslations();
  const payload = value.translations || value;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const source = item.sourceText || item.source || item.en || item.EN;
      if (!source) continue;

      if (item.lang && item.translation) {
        const lang = String(item.lang).toUpperCase();
        if (LANGS.includes(lang)) out[lang][source] = item.translation;
        continue;
      }

      for (const lang of LANGS) {
        if (item[lang]) out[lang][source] = item[lang];
      }
    }
    return out;
  }

  for (const lang of LANGS) {
    if (payload[lang] && typeof payload[lang] === "object") {
      Object.assign(out[lang], payload[lang]);
    }
  }
  return out;
}

function buildLengthChecks(translations, tolerance, planTranslations = emptyTranslations()) {
  const stats = Object.fromEntries(
    LANGS.map((lang) => [lang, { checked: 0, violations: 0 }]),
  );
  const byOrigin = {
    ai: { checked: 0, violations: 0 },
    glossary: { checked: 0, violations: 0 },
  };
  const violations = [];
  let violationCount = 0;
  let checkedCount = 0;
  let aiViolationCount = 0;

  for (const lang of LANGS) {
    for (const [sourceText, targetText] of Object.entries(translations[lang] || {})) {
      const origin = Object.prototype.hasOwnProperty.call(planTranslations[lang] || {}, sourceText)
        ? "glossary"
        : "ai";
      const sourceCharCount = charCount(sourceText);
      const targetCharCount = charCount(targetText);
      const lengthDelta = targetCharCount - sourceCharCount;
      const withinTolerance = Math.abs(lengthDelta) <= tolerance;

      checkedCount += 1;
      stats[lang].checked += 1;
      byOrigin[origin].checked += 1;

      if (!withinTolerance) {
        violationCount += 1;
        stats[lang].violations += 1;
        byOrigin[origin].violations += 1;
        if (origin === "ai") aiViolationCount += 1;
        if (violations.length < MAX_LENGTH_VIOLATION_SAMPLES) {
          violations.push({
            origin,
            lang,
            sourceText,
            targetText,
            sourceCharCount,
            targetCharCount,
            lengthDelta,
            allowedDelta: tolerance,
          });
        }
      }
    }
  }

  return {
    tolerance,
    checkedCount,
    violationCount,
    aiViolationCount,
    omittedViolationCount: Math.max(0, violationCount - violations.length),
    stats,
    byOrigin,
    violations,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.plan) throw new Error("--plan is required");
  if (!args.ai) throw new Error("--ai is required");

  const plan = readJsonFile(args.plan);
  const ai = normalizeAiTranslations(readJsonFile(args.ai));
  const consolidated = emptyTranslations();
  const lengthTolerance = Number.isFinite(Number(plan.lengthTolerance))
    ? Number(plan.lengthTolerance)
    : DEFAULT_LENGTH_TOLERANCE;

  for (const lang of LANGS) {
    // Priority 2: AI/User Overrides (can be overwritten by glossary)
    Object.assign(consolidated[lang], ai[lang]);
    
    // Priority 1: Glossary (overwrites AI if match exists)
    Object.assign(consolidated[lang], plan.translations?.[lang] || {});
  }

  const missing = [];
  for (const item of plan.needsAi || []) {
    if (!consolidated[item.lang]?.[item.sourceText]) {
      missing.push(item);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    languages: LANGS,
    translations: consolidated,
    missing,
    lengthChecks: buildLengthChecks(consolidated, lengthTolerance, plan.translations || emptyTranslations()),
    stats: Object.fromEntries(
      LANGS.map((lang) => [lang, Object.keys(consolidated[lang]).length]),
    ),
  };

  const json = JSON.stringify(output, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, `${json}\n`, "utf8");
  } else {
    process.stdout.write(`${json}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
