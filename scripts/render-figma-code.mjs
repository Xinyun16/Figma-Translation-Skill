#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
  return `Usage:
  node scripts/render-figma-code.mjs --node-id 24112:853 --translations consolidated-translations.json --out figma-run.js

Options:
  --allow-length-violations true   Render even when AI translations exceed the ±2 visible-character tolerance. Use only for debugging or with explicit user approval.
  --use-figma-code-json <file>     Also write a JSON payload whose "code" field is the exact script string to pass directly to Figma use_figma.
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

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function charCount(value) {
  return [...String(value)].length;
}

function allowsLengthViolations(args) {
  return ["1", "true", "yes"].includes(String(args["allow-length-violations"] || "").toLowerCase());
}

function buildFallbackLengthChecks(translationPayload, tolerance = 2) {
  const translations = translationPayload.translations || translationPayload;
  const violations = [];
  let violationCount = 0;

  for (const [lang, langTranslations] of Object.entries(translations || {})) {
    if (!langTranslations || typeof langTranslations !== "object" || Array.isArray(langTranslations)) continue;

    for (const [sourceText, targetText] of Object.entries(langTranslations)) {
      const sourceCharCount = charCount(sourceText);
      const targetCharCount = charCount(targetText);
      const lengthDelta = targetCharCount - sourceCharCount;

      if (Math.abs(lengthDelta) <= tolerance) continue;

      violationCount += 1;
      if (violations.length < 50) {
        violations.push({
          lang,
          sourceText,
          targetText,
          sourceCharCount,
          targetCharCount,
          lengthDelta,
          allowedDelta: tolerance,
          origin: "translation",
        });
      }
    }
  }

  return {
    tolerance,
    aiViolationCount: violationCount,
    violationCount,
    violations,
    omittedViolationCount: Math.max(0, violationCount - violations.length),
  };
}

function getLengthChecks(translationPayload) {
  const lengthChecks = translationPayload.lengthChecks;
  if (lengthChecks && Number.isFinite(Number(lengthChecks.aiViolationCount))) {
    return lengthChecks;
  }

  return buildFallbackLengthChecks(translationPayload, Number(lengthChecks?.tolerance) || 2);
}

function assertLengthChecks(translationPayload, args) {
  const lengthChecks = getLengthChecks(translationPayload);
  const blockingViolationCount = Number(lengthChecks.violationCount ?? lengthChecks.aiViolationCount ?? 0);
  if (!blockingViolationCount) return;

  const samples = (lengthChecks.violations || [])
    .slice(0, 10)
    .map((item) => (
      `${item.lang}: ${JSON.stringify(item.sourceText)} -> ${JSON.stringify(item.targetText)} `
      + `(source=${item.sourceCharCount}, target=${item.targetCharCount}, delta=${item.lengthDelta})`
    ));

  const message = [
    `${blockingViolationCount} translations exceed the ±2 visible-character tolerance.`,
    "Revise them before rendering: the ±2 visible-character difference is the primary layout constraint, then choose the best accurate Petlibro localization within that limit.",
    "Use --allow-length-violations true only for debugging or for explicit user-approved exceptions.",
    ...samples,
  ].join("\n");

  if (allowsLengthViolations(args)) {
    console.warn(message);
    return;
  }

  throw new Error(message);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args["node-id"]) throw new Error("--node-id is required");
  if (!args.translations) throw new Error("--translations is required");

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const skillDir = path.resolve(scriptDir, "..");
  const templatePath = path.join(skillDir, "translate.js");
  const template = fs.readFileSync(templatePath, "utf8");
  const translationPayload = readJsonFile(args.translations);
  assertLengthChecks(translationPayload, args);
  const translations = translationPayload.translations || translationPayload;

  const targetAssignment = 'const TARGET_NODE_ID = "__TARGET_NODE_ID__";';
  const translationAssignment = 'const INJECTED_TRANSLATIONS_JSON = "__TRANSLATIONS_JSON__";';

  if (!template.includes(targetAssignment)) {
    throw new Error("TARGET_NODE_ID assignment marker not found");
  }
  if (!template.includes(translationAssignment)) {
    throw new Error("TRANSLATIONS_JSON assignment marker not found");
  }

  let code = template.replace(
    targetAssignment,
    `const TARGET_NODE_ID = ${JSON.stringify(args["node-id"])};`,
  );
  code = code.replace(
    translationAssignment,
    `const INJECTED_TRANSLATIONS_JSON = ${JSON.stringify(JSON.stringify(translations))};`,
  );

  if (code.includes(targetAssignment)) {
    throw new Error("Failed to replace TARGET_NODE_ID assignment");
  }
  if (code.includes(translationAssignment)) {
    throw new Error("Failed to replace TRANSLATIONS_JSON assignment");
  }

  if (args.out) {
    fs.writeFileSync(args.out, code, "utf8");
  } else {
    process.stdout.write(code);
  }

  if (args["use-figma-code-json"]) {
    fs.writeFileSync(
      args["use-figma-code-json"],
      `${JSON.stringify({
        code,
        codeLength: code.length,
        description: `Run Petlibro Figma localization on node ${args["node-id"]}`,
        transport: "Pass this code string directly to use_figma.code. Do not fetch it from localhost inside the Figma runtime.",
      }, null, 2)}\n`,
      "utf8",
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
