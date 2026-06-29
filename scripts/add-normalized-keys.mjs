import fs from 'fs';

const consolidated = JSON.parse(fs.readFileSync('.tmp/consolidated-translations.json', 'utf8'));

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\s\u00a0\u2028\u2029]+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

for (const lang of consolidated.languages) {
  const langTranslations = consolidated.translations[lang];
  const newTranslations = { ...langTranslations };
  for (const [source, target] of Object.entries(langTranslations)) {
    const normalized = normalizeText(source);
    if (normalized !== source && !langTranslations[normalized]) {
      newTranslations[normalized] = target;
    }
  }
  consolidated.translations[lang] = newTranslations;
}

fs.writeFileSync('.tmp/consolidated-translations.json', JSON.stringify(consolidated, null, 2), 'utf8');
console.log("Normalized keys added.");
