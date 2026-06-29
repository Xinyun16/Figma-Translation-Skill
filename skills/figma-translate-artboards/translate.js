const translations = {
  DE: {},
  FR: {},
  ES: {},
};
const MAX_UNTRANSLATED_SAMPLES = 20;

const INJECTED_TRANSLATIONS_JSON = "__TRANSLATIONS_JSON__";
if (INJECTED_TRANSLATIONS_JSON && INJECTED_TRANSLATIONS_JSON !== "__TRANSLATIONS_JSON__") {
  const injectedTranslations = JSON.parse(INJECTED_TRANSLATIONS_JSON);
  for (const [lang, langTranslations] of Object.entries(injectedTranslations)) {
    translations[lang] = {
      ...(translations[lang] || {}),
      ...langTranslations,
    };
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\s\u00a0\u2028\u2029]+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

function getTranslation(lang, text) {
  const langTranslations = translations[lang] || {};
  if (Object.prototype.hasOwnProperty.call(langTranslations, text)) {
    return langTranslations[text];
  }

  const normalized = normalizeText(text);
  if (Object.prototype.hasOwnProperty.call(langTranslations, normalized)) {
    return langTranslations[normalized];
  }

  return null;
}

function mapFontName(fontName) {
  if (fontName === figma.mixed) {
    return { family: "Inter", style: "Regular" };
  }

  if (fontName.family !== "Söhne") {
    return fontName;
  }

  const styleMap = {
    Leicht: "Light",
    Buch: "Regular",
    Kräftig: "Semi Bold",
  };
  return {
    family: "Inter",
    style: styleMap[fontName.style] || "Regular",
  };
}

async function loadMappedFont(fontName) {
  let targetFont = mapFontName(fontName);
  try {
    await figma.loadFontAsync(targetFont);
  } catch (error) {
    targetFont = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(targetFont);
  }

  return targetFont;
}

async function buildFontPlan(textNode) {
  if (textNode.textStyleId && textNode.textStyleId !== figma.mixed) {
    textNode.textStyleId = "";
  }

  if (textNode.fontName !== figma.mixed) {
    const font = await loadMappedFont(textNode.fontName);
    return { defaultFont: font, ranges: [] };
  }

  const segments = textNode.getStyledTextSegments(["fontName"]);
  const plannedSegments = [];
  for (const segment of segments) {
    const font = await loadMappedFont(segment.fontName);
    plannedSegments.push({
      start: segment.start,
      end: segment.end,
      sourceText: textNode.characters.slice(segment.start, segment.end),
      font,
    });
  }

  const regularSegment = plannedSegments.find((segment) => segment.font.style === "Regular");
  const defaultFont = regularSegment?.font || plannedSegments[plannedSegments.length - 1]?.font || { family: "Inter", style: "Regular" };
  return {
    defaultFont,
    ranges: plannedSegments.filter((segment) => (
      segment.font.family !== defaultFont.family || segment.font.style !== defaultFont.style
    )),
  };
}

function targetRangeForSourceSegment(sourceText, targetText) {
  const trimmed = sourceText.trim();
  if (!trimmed) return null;

  const numericPrefix = trimmed.match(/^\d+(?:[.,]\d+)?\s*[A-Za-z°]+/);
  if (numericPrefix) {
    const targetMatch = targetText.match(/^\s*\d+(?:[.,]\d+)?\s*[A-Za-z°]+/);
    if (targetMatch) {
      let end = targetMatch[0].length;
      if (/\s$/.test(sourceText) && targetText[end] === " ") end += 1;
      return { start: 0, end };
    }
  }

  const name = trimmed.replace(/[’']s$/i, "").split(/[\s\n]+/)[0];
  if (name) {
    const start = targetText.indexOf(name);
    if (start >= 0) {
      let end = start + name.length;
      if (/[\s\n]$/.test(sourceText) && /[\s\n]/.test(targetText[end] || "")) end += 1;
      return { start, end };
    }
  }

  return { start: 0, end: Math.min(sourceText.length, targetText.length) };
}

function applyFontPlan(textNode, targetText, fontPlan) {
  textNode.fontName = fontPlan.defaultFont;
  if (targetText.length > 0) {
    textNode.setRangeFontName(0, targetText.length, fontPlan.defaultFont);
  }

  for (const range of fontPlan.ranges) {
    const targetRange = targetRangeForSourceSegment(range.sourceText, targetText);
    if (!targetRange || targetRange.end <= targetRange.start) continue;
    textNode.setRangeFontName(targetRange.start, Math.min(targetRange.end, targetText.length), range.font);
  }
}

function detachInstances(root) {
  let detachedCount = 0;

  // Detaching can invalidate nested instance IDs, so rediscover after each detach.
  for (let guard = 0; guard < 500; guard += 1) {
    const instance = root.findAllWithCriteria({ types: ["INSTANCE"] })[0];
    if (!instance) return detachedCount;

    instance.detachInstance();
    detachedCount += 1;
  }

  throw new Error("Could not detach all instances before guard limit");
}

async function run() {
  const TARGET_NODE_ID = "__TARGET_NODE_ID__";
  if (!TARGET_NODE_ID || TARGET_NODE_ID === "__TARGET_NODE_ID__") {
    return { ok: false, error: "Missing TARGET_NODE_ID" };
  }

  const originalNode = await figma.getNodeByIdAsync(TARGET_NODE_ID);
  if (!originalNode) {
    return { ok: false, error: "Original node not found", targetNodeId: TARGET_NODE_ID };
  }

  let targetPage = originalNode;
  while (targetPage && targetPage.type !== "PAGE") {
    targetPage = targetPage.parent;
  }
  if (!targetPage) {
    return { ok: false, error: "Original node is not attached to a page", targetNodeId: TARGET_NODE_ID };
  }

  await figma.setCurrentPageAsync(targetPage);

  const originalName = originalNode.name;
  originalNode.name = "EN";

  await figma.loadFontAsync({ family: "Inter", style: "Light" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });

  const langs = ["DE", "FR", "ES"];
  const spacing = 100;
  const summary = {
    ok: true,
    targetNodeId: originalNode.id,
    pageId: targetPage.id,
    originalName,
    created: [],
    errors: [],
  };

  for (let i = 0; i < langs.length; i += 1) {
    const lang = langs[i];
    const clone = originalNode.clone();
    const detachedInstanceCount = detachInstances(clone);

    clone.name = lang;
    clone.x = originalNode.x + (originalNode.width + spacing) * (i + 1);
    clone.y = originalNode.y;

    const textNodes = clone.findAllWithCriteria({ types: ["TEXT"] });
    let translatedTextCount = 0;
    const untranslatedSamples = [];
    let untranslatedTextCount = 0;

    for (const textNode of textNodes) {
      try {
        const originalText = textNode.characters;
        const fontPlan = await buildFontPlan(textNode);
        applyFontPlan(textNode, originalText, fontPlan);

        const translated = getTranslation(lang, originalText);
        if (translated !== null) {
          textNode.deleteCharacters(0, textNode.characters.length);
          textNode.insertCharacters(0, translated);
          applyFontPlan(textNode, translated, fontPlan);
          translatedTextCount += 1;
        } else if (normalizeText(originalText)) {
          untranslatedTextCount += 1;
          if (untranslatedSamples.length < MAX_UNTRANSLATED_SAMPLES) {
            untranslatedSamples.push({
              nodeId: textNode.id,
              text: originalText,
            });
          }
        }
      } catch (error) {
        summary.errors.push(`Failed on node ${textNode.id} (${textNode.characters}): ${error.message}`);
      }
    }

    const missingFonts = clone.findAllWithCriteria({ types: ["TEXT"] })
      .filter((textNode) => textNode.hasMissingFont)
      .map((textNode) => `${textNode.id}: ${textNode.characters}`);

    const created = {
      lang,
      nodeId: clone.id,
      name: clone.name,
      appended: missingFonts.length === 0,
      textNodeCount: textNodes.length,
      translatedTextCount,
      untranslatedTextCount,
      untranslatedSamples,
      untranslatedOmittedCount: Math.max(0, untranslatedTextCount - untranslatedSamples.length),
      missingFontCount: missingFonts.length,
      detachedInstanceCount,
    };

    if (missingFonts.length > 0) {
      summary.errors.push(`Skipped appending ${lang}; missing fonts remained after normalization:\n${missingFonts.join("\n")}`);
      summary.created.push(created);
      continue;
    }

    targetPage.appendChild(clone);
    summary.created.push(created);
  }

  summary.ok = summary.errors.length === 0;
  summary.errorCount = summary.errors.length;
  summary.message = summary.ok ? "Success" : "Completed with some errors";
  return summary;
}

return run();
