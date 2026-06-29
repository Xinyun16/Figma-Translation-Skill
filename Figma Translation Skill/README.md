# Petlibro Figma Translation Workflow

This repository contains an automated workflow to dynamically translate Figma artboards from English (EN) to German (DE), French (FR), and Spanish (ES) while strictly adhering to Petlibro's localization guidelines and official glossaries.

## Workflow Overview

When the `/figma-translate-artboards` skill is triggered (via a Figma URL and Node ID), the automated pipeline executes the following steps:

1. **Text Extraction:**
   Extracts all unique text strings from the specified Figma artboard.

2. **Official Glossary Check (Product Names & Slogans):**
   Queries the [Official Petlibro Glossary](https://docs.google.com/spreadsheets/d/1FimNIsjXo3WxGm9p1b0a47oOfwJ7EgRHHURQEVd5wCQ/edit?gid=0#gid=0) for exact matches on product names, slogans, and short descriptions. 
   *Action:* Direct matches are applied automatically without AI translation.

3. **Active Glossary Check (Marketing Copy & UI):**
   Queries the dynamic [Petlibro Glossary (Active)](https://docs.google.com/spreadsheets/d/1prNDj4NLWcHUMBz7EhALB22Sk-B-ThXy85kPx4nQVOE/edit?usp=sharing).
   *Action:* 
   - Uses translations flagged as **`HIGH`** confidence directly.
   - Rejects translations flagged as **`MEDIUM`** or **`LOW`**, forwarding them to the next step for AI generation.

4. **AI-Powered Localization:**
   Any remaining text (unmatched strings or those with `MEDIUM`/`LOW` confidence) is translated dynamically by AI. This process strictly follows the **[Petlibro Localization Prompt v1.2](./Petlibro%20Localization%20Prompt%20v1.2.md):** brand guidelines (e.g., maintaining a warm/casual tone and keeping core product names in English).

5. **Figma Execution & Formatting:**
   - Renames the original artboard to `EN`.
   - Clones the artboard three times (`DE`, `FR`, `ES`) on the same page.
   - Replaces the `Söhne` font family with `Inter`.
   - Injects the final consolidated translations into the respective language artboards.

## Core Rules & References

- **[Petlibro Glossary Rule.md](./references/Petlibro%20Glossary%20Rule.md):** Defines how to parse the standard localization columns (EN/DE/FR/ES...) for standard products.
- **[Petlibro Glossary(Active) Rule.md](./references/Petlibro%20Glossary(Active)%20Rule.md):** Defines the active terminology database logic, specifically the `Confidence` flag handling (`HIGH` = auto-apply, `MEDIUM`/`LOW` = fallback to AI).
- **[Petlibro Localization Prompt v1.2](./references/Petlibro%20Localization%20Prompt%20v1.2.md):** The core tone of voice and stylistic guidelines for the AI translator.