#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LANGS = ["DE", "FR", "ES"];
const OFFICIAL_SHEET_ID = "1FimNIsjXo3WxGm9p1b0a47oOfwJ7EgRHHURQEVd5wCQ";
const ACTIVE_SHEET_ID = "1prNDj4NLWcHUMBz7EhALB22Sk-B-ThXy85kPx4nQVOE";
const ACTIVE_MARKET_TAB_PATTERN = /_Market$/i;
const LENGTH_TOLERANCE = 2;

function usage() {
  return `Usage:
  node scripts/build-translation-plan.mjs --texts extracted-texts.json --out plan.json

Options:
  --texts <file>          JSON from the Figma text extraction step.
  --out <file>            Output translation plan JSON.
  --official-csv <file>   Use a local CSV/TSV export for the official glossary.
  --active-csv <file>     Use a local CSV/TSV export for the active glossary.
  --official-url <url>    Override the official glossary CSV URL.
  --active-url <url>      Override the active glossary CSV URL.
  --active-sheet-id <id>   Override the active glossary Google Sheet ID.
  --ai-instruction-out <file>
                         Write the AI instruction to a separate markdown file and keep the plan compact.
  --audit-out <file>      Write detailed translation decisions to a separate JSON file and keep the plan compact.
  --prompt <file>         Localization prompt markdown path.
  --help                  Show this help.
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
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function csvUrl(sheetId, gid) {
  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}`;
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
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

function lengthBounds(source) {
  const sourceCharCount = charCount(source);
  return {
    sourceCharCount,
    targetCharMin: Math.max(0, sourceCharCount - LENGTH_TOLERANCE),
    targetCharMax: sourceCharCount + LENGTH_TOLERANCE,
    lengthTolerance: LENGTH_TOLERANCE,
  };
}

function lengthMeta(source, target) {
  const sourceCharCount = charCount(source);
  const targetCharCount = charCount(target);
  const lengthDelta = targetCharCount - sourceCharCount;
  return {
    sourceCharCount,
    targetCharCount,
    lengthDelta,
    lengthWithinTolerance: Math.abs(lengthDelta) <= LENGTH_TOLERANCE,
    lengthTolerance: LENGTH_TOLERANCE,
  };
}

function normalizeHeader(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[_:()[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeTextFile(file, text) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function isHeaderLike(value) {
  const normalized = normalizeHeader(value);
  return [
    "product name",
    "slogan",
    "one sentence description",
    "source english en",
    "source english",
    "en",
  ].includes(normalized);
}

function parseDelimited(input) {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((value) => value !== "") || rows.length === 0) {
    rows.push(row);
  }
  return rows;
}

async function readTextSource({ file, url, label }) {
  if (file) {
    return {
      source: file,
      text: fs.readFileSync(file, "utf8"),
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} fetch failed: HTTP ${response.status} ${response.statusText}`);
  }
  return {
    source: url,
    text: await response.text(),
  };
}

async function discoverGoogleSheetTabs(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Active glossary tab discovery failed: HTTP ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const tabs = [];
  const seen = new Set();
  const snapshotPattern =
    /\[21350203,"\[(\d+),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;

  for (const match of html.matchAll(snapshotPattern)) {
    const [, index, gid, name] = match;
    const key = `${gid}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tabs.push({
      index: Number(index),
      gid,
      name,
    });
  }

  return tabs.sort((a, b) => a.index - b.index);
}

async function readActiveSources(args) {
  if (args["active-csv"] || args["active-url"]) {
    const active = await readTextSource({
      file: args["active-csv"],
      url: args["active-url"] || csvUrl(args["active-sheet-id"] || ACTIVE_SHEET_ID),
      label: "Active glossary",
    });
    return { sources: [active], warnings: [] };
  }

  const sheetId = args["active-sheet-id"] || ACTIVE_SHEET_ID;
  const warnings = [];

  try {
    const tabs = await discoverGoogleSheetTabs(sheetId);
    
    // Use all tabs from the workbook to ensure we don't miss any market-specific translations.
    // The buildActiveGlossary function will skip tabs that don't match the glossary format.
    const uniqueTabs = tabs.length > 0 ? tabs : [{ gid: "0", name: "Default" }];
    if (!uniqueTabs.find(t => String(t.gid) === "0")) {
      uniqueTabs.unshift({ gid: "0", name: "Default" });
    }

    const sources = await Promise.all(
      uniqueTabs.map(async (tab) => {
        try {
          const active = await readTextSource({
            url: csvUrl(sheetId, tab.gid),
            label: `Active glossary tab ${tab.name}`,
          });
          return {
            ...active,
            sheetId,
            gid: tab.gid,
            tabName: tab.name,
          };
        } catch (err) {
          warnings.push(`Failed to fetch tab ${tab.name} (gid ${tab.gid}): ${err.message}`);
          return null;
        }
      }),
    );
    return { sources: sources.filter(Boolean), warnings };
  } catch (error) {
    warnings.push(`${error.message} Falling back to the workbook's default active glossary CSV.`);
    const fallback = await readTextSource({
      url: csvUrl(sheetId),
      label: "Active glossary",
    });
    return { sources: [fallback], warnings };
  }
}

function extractTextList(jsonValue) {
  if (Array.isArray(jsonValue)) {
    return jsonValue.map(normalizeText).filter(Boolean);
  }
  if (Array.isArray(jsonValue.uniqueTexts)) {
    return jsonValue.uniqueTexts.map(normalizeText).filter(Boolean);
  }
  if (Array.isArray(jsonValue.texts)) {
    return jsonValue.texts.map(normalizeText).filter(Boolean);
  }
  if (Array.isArray(jsonValue.textNodes)) {
    return jsonValue.textNodes
      .map((item) => normalizeText(typeof item === "string" ? item : item.characters))
      .filter(Boolean);
  }
  throw new Error("Unsupported texts JSON. Expected an array, uniqueTexts, texts, or textNodes.");
}

function pushGlossaryHit(map, source, lang, target, meta) {
  const sourceText = normalizeText(source);
  const targetText = normalizeText(target);
  if (!sourceText || !targetText || isHeaderLike(sourceText)) return;

  if (!map.has(sourceText)) {
    map.set(sourceText, {});
  }
  map.get(sourceText)[lang] = {
    target: targetText,
    ...meta,
  };
}

function buildOfficialGlossary(rows) {
  const map = new Map();
  for (const row of rows) {
    const groups = [
      { source: 2, DE: 5, FR: 8, ES: 11, field: "Product Name" },
      { source: 3, DE: 6, FR: 9, ES: 12, field: "Slogan" },
      { source: 4, DE: 7, FR: 10, ES: 13, field: "One-sentence description" },
    ];
    for (const group of groups) {
      for (const lang of LANGS) {
        pushGlossaryHit(map, row[group.source], lang, row[group[lang]], {
          sourceType: "official_glossary",
          confidence: "OFFICIAL",
          field: group.field,
          model: normalizeText(row[1]),
          productLine: normalizeText(row[0]),
        });
      }
    }
  }
  return map;
}

function findHeaderRow(rows) {
  let best = { index: 0, score: -1 };
  const max = Math.min(rows.length, 10);
  for (let i = 0; i < max; i += 1) {
    const joined = rows[i].map(normalizeHeader).join(" | ");
    let score = 0;
    if (joined.includes("source") && joined.includes("english")) score += 3;
    if (joined.includes("confidence")) score += 2;
    if (joined.includes("target")) score += 1;
    if (score > best.score) best = { index: i, score };
  }
  return best.index;
}

function findColumn(headers, predicates) {
  return headers.findIndex((header) => predicates.some((predicate) => predicate(header)));
}

function isOfficialFormat(rows) {
  if (rows.length < 2) return false;
  const row1 = rows[0].map(normalizeText);
  const row2 = rows[1].map(normalizeHeader);
  return (
    (row1.includes("EN") || row1.includes("English")) &&
    (row2.includes("product line") || row2.includes("model"))
  );
}

function buildActiveGlossary(rows, meta = {}) {
  if (rows.length === 0) return new Map();

  if (isOfficialFormat(rows)) {
    // If it looks like the official format, use that logic but mark as active_glossary
    const map = buildOfficialGlossary(rows);
    // Overwrite sourceType to indicate it came from the active sheet
    for (const targets of map.values()) {
      for (const lang of LANGS) {
        if (targets[lang]) {
          targets[lang].sourceType = "active_glossary_official_format";
          targets[lang].confidence = "HIGH"; // Treat official format in active sheet as HIGH
          targets[lang].tabName = meta.tabName;
          targets[lang].gid = meta.gid;
          targets[lang].glossarySource = meta.source;
        }
      }
    }
    return map;
  }

  const map = new Map();
  const headerIndex = findHeaderRow(rows);
  const headers = rows[headerIndex].map(normalizeHeader);
  const sourceColumn = findColumn(headers, [
    (h) => h.includes("source") && h.includes("english"),
    (h) => h === "en",
  ]);
  const confidenceColumn = findColumn(headers, [(h) => h.includes("confidence")]);
  const targetColumns = {
    DE: findColumn(headers, [
      (h) => h.includes("target") && (h.includes("german") || h.includes("de")),
      (h) => h === "de",
    ]),
    FR: findColumn(headers, [
      (h) => h.includes("target") && (h.includes("french") || h.includes("fr")),
      (h) => h === "fr",
    ]),
    ES: findColumn(headers, [
      (h) => h.includes("target") && (h.includes("spanish") || h.includes("es")),
      (h) => h === "es",
    ]),
  };

  if (sourceColumn < 0) {
    throw new Error("Active glossary source column not found.");
  }

  for (const row of rows.slice(headerIndex + 1)) {
    const source = normalizeText(row[sourceColumn]);
    const confidence = normalizeText(confidenceColumn >= 0 ? row[confidenceColumn] : "").toUpperCase();
    for (const lang of LANGS) {
      const targetColumn = targetColumns[lang];
      if (targetColumn < 0) continue;
      pushGlossaryHit(map, source, lang, row[targetColumn], {
        sourceType: "active_glossary",
        confidence: confidence || "UNKNOWN",
        tabName: meta.tabName,
        gid: meta.gid,
        glossarySource: meta.source,
      });
    }
  }
  return map;
}

function mergeGlossaryMaps(maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [sourceText, targets] of map) {
      if (!merged.has(sourceText)) {
        merged.set(sourceText, {});
      }
      Object.assign(merged.get(sourceText), targets);
    }
  }
  return merged;
}

function decideTranslations(texts, officialMap, activeMap) {
  const translations = Object.fromEntries(LANGS.map((lang) => [lang, {}]));
  const decisions = [];
  const needsAi = [];

  for (const sourceText of texts) {
    const normalized = normalizeText(sourceText);
    const officialHit = officialMap.get(normalized);
    const activeHit = activeMap.get(normalized);

    for (const lang of LANGS) {
      if (officialHit?.[lang]) {
        translations[lang][sourceText] = officialHit[lang].target;
        decisions.push({
          sourceText,
          lang,
          action: "use_official_glossary",
          ...officialHit[lang],
          ...lengthMeta(sourceText, officialHit[lang].target),
        });
        continue;
      }

      if (activeHit?.[lang]?.confidence === "HIGH") {
        translations[lang][sourceText] = activeHit[lang].target;
        decisions.push({
          sourceText,
          lang,
          action: "use_active_glossary_high",
          ...activeHit[lang],
          ...lengthMeta(sourceText, activeHit[lang].target),
        });
        continue;
      }

      const rejected = activeHit?.[lang];
      needsAi.push({
        sourceText,
        lang,
        ...lengthBounds(sourceText),
        reason: rejected ? `active_glossary_${rejected.confidence || "UNKNOWN"}` : "unmatched",
        rejectedCandidate: rejected?.target,
        rejectedCandidateCharCount: rejected?.target ? charCount(rejected.target) : undefined,
      });
      decisions.push({
        sourceText,
        lang,
        action: "needs_ai_localization",
        ...lengthBounds(sourceText),
        reason: rejected ? `active_glossary_${rejected.confidence || "UNKNOWN"}` : "unmatched",
      });
    }
  }

  return { translations, decisions, needsAi };
}

function buildAiInstruction(needsAi, localizationPrompt) {
  return [
    "# Petlibro AI Localization Task",
    "",
    "Use the localization prompt below to translate only the requested source strings.",
    "Return strict JSON in this shape:",
    "",
    "{",
    '  "DE": { "source text": "German translation" },',
    '  "FR": { "source text": "French translation" },',
    '  "ES": { "source text": "Spanish translation" }',
    "}",
    "",
    "Do not translate Petlibro product names that the prompt says to keep in English.",
    `For each returned translation, count visible characters including spaces and line breaks. The target translation must stay within +/-${LENGTH_TOLERANCE} characters of sourceCharCount, using targetCharMin and targetCharMax as the required range.`,
    "The +/-2 character range has higher priority than preserving a longer literal translation. Within that range, choose the most accurate, warm, casual, smart, and natural Petlibro localization.",
    "Do not use awkward abbreviations, English fallback words, vague wording, filler, grammar errors, or mistranslations just to fit. If no acceptable translation can fit the range, return the best candidate inside the range and mark it for human/native review in an optional note field instead of exceeding the range.",
    "Do not include commentary outside JSON.",
    "",
    "## Strings Needing AI",
    JSON.stringify(needsAi, null, 2),
    "",
    "## Localization Prompt",
    localizationPrompt,
  ].join("\n");
}

function buildDecisionStats(decisions) {
  const stats = {
    total: decisions.length,
    byAction: {},
    byLang: Object.fromEntries(LANGS.map((lang) => [lang, {}])),
  };

  for (const decision of decisions) {
    stats.byAction[decision.action] = (stats.byAction[decision.action] || 0) + 1;
    if (!stats.byLang[decision.lang]) stats.byLang[decision.lang] = {};
    stats.byLang[decision.lang][decision.action] =
      (stats.byLang[decision.lang][decision.action] || 0) + 1;
  }

  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.texts) throw new Error("--texts is required");

  const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const defaultPrompt = path.join(skillDir, "references", "Petlibro Localization Prompt v1.2.md");
  const promptPath = args.prompt ? path.resolve(args.prompt) : defaultPrompt;

  const textJson = readJsonFile(args.texts);
  const texts = [...new Set(extractTextList(textJson))];

  const officialPromise = readTextSource({
    file: args["official-csv"],
    url: args["official-url"] || csvUrl(OFFICIAL_SHEET_ID),
    label: "Official glossary",
  });
  const activePromise = readActiveSources(args);
  const localizationPrompt = fs.readFileSync(promptPath, "utf8");
  const [official, active] = await Promise.all([officialPromise, activePromise]);

  const officialMap = buildOfficialGlossary(parseDelimited(official.text));
  const activeMap = mergeGlossaryMaps(
    active.sources.map((source) => buildActiveGlossary(parseDelimited(source.text), source)),
  );
  const { translations, decisions, needsAi } = decideTranslations(texts, officialMap, activeMap);

  const aiInstruction = buildAiInstruction(needsAi, localizationPrompt);
  const decisionStats = buildDecisionStats(decisions);

  const plan = {
    generatedAt: new Date().toISOString(),
    languages: LANGS,
    lengthTolerance: LENGTH_TOLERANCE,
    sourceTextCount: texts.length,
    glossarySources: {
      official: official.source,
      active: active.sources.map((source) => ({
        source: source.source,
        sheetId: source.sheetId,
        gid: source.gid,
        tabName: source.tabName,
      })),
      localizationPrompt: promptPath,
    },
    warnings: active.warnings,
    translations,
    decisionStats,
    needsAi,
  };

  if (args["audit-out"]) {
    const audit = {
      generatedAt: plan.generatedAt,
      languages: LANGS,
      sourceTextCount: texts.length,
      decisionStats,
      decisions,
    };
    writeTextFile(args["audit-out"], `${JSON.stringify(audit, null, 2)}\n`);
    plan.auditFile = args["audit-out"];
  } else {
    plan.decisions = decisions;
  }

  if (args["ai-instruction-out"]) {
    writeTextFile(args["ai-instruction-out"], `${aiInstruction}\n`);
    plan.aiInstructionFile = args["ai-instruction-out"];
  } else {
    plan.aiInstruction = aiInstruction;
  }

  const output = JSON.stringify(plan, null, 2);
  if (args.out) {
    writeTextFile(args.out, `${output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
