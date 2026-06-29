import fs from 'fs';

const extracted = JSON.parse(fs.readFileSync('.tmp/extracted-texts.json', 'utf8'));
const consolidated = JSON.parse(fs.readFileSync('.tmp/consolidated-translations.json', 'utf8'));

const sourceTexts = extracted.uniqueTexts;
const languages = consolidated.languages;

const normalizeText = (text) => {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
};

const getCharCount = (text) => {
  return [...text].length;
};

const violations = [];

for (const lang of languages) {
  const translations = consolidated.translations[lang];
  for (const sourceText of sourceTexts) {
    const normalizedSource = normalizeText(sourceText);
    const translation = translations[normalizedSource];
    if (translation) {
      const sourceCount = getCharCount(normalizedSource);
      const targetCount = getCharCount(translation);
      const delta = targetCount - sourceCount;
      if (Math.abs(delta) > 2) {
        violations.push({
          lang,
          source: normalizedSource,
          target: translation,
          sourceCount,
          targetCount,
          delta
        });
      }
    }
  }
}

console.log(JSON.stringify(violations, null, 2));
