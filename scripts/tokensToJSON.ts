/**
 * scripts/tokensToJSON.ts
 *
 * Parses the CSS custom properties from src/index.css and emits a
 * structured tokens.json suitable for Style Dictionary / Figma Tokens.
 *
 * Usage:  npx tsx scripts/tokensToJSON.ts
 * Output: tokens/tokens.json
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSS_PATH = resolve(ROOT, 'src/index.css');
const OUT_DIR = resolve(ROOT, 'tokens');
const OUT_PATH = resolve(OUT_DIR, 'tokens.json');

// ── Read CSS ───────────────────────────────────────────────────────────
const css = readFileSync(CSS_PATH, 'utf-8');

// ── Regex to capture --property: value; inside :root { } or .dark { } ──
//    We grab both light (:root) and dark (.dark) blocks separately.
function extractVars(block: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

// Split on .dark to separate light and dark
const darkIdx = css.indexOf('.dark {');
const lightBlock = darkIdx === -1 ? css : css.slice(0, darkIdx);
const darkBlock = darkIdx === -1 ? '' : css.slice(darkIdx);

const lightVars = extractVars(lightBlock);
const darkVars = extractVars(darkBlock);

// ── Build structured tokens ────────────────────────────────────────────
interface TokenValue {
  $value: string;
  $type: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'number';
  $description?: string;
  $extensions?: Record<string, unknown>;
}

function tokenType(key: string, value: string): TokenValue['$type'] {
  if (key.includes('font-family') || key === 'font-sans' || key === 'font-heading' || key === 'font-mono' || key === 'font-numeric')
    return 'fontFamily';
  if (key.includes('text-') && !key.includes('color'))
    return 'dimension';
  if (key.includes('spacing'))
    return 'dimension';
  if (key.includes('shadow'))
    return 'dimension';
  if (value.startsWith('#') || value.startsWith('rgb'))
    return 'color';
  return 'dimension';
}

function buildTokens(vars: Record<string, string>, mode: string): Record<string, TokenValue> {
  const tokens: Record<string, TokenValue> = {};
  for (const [key, value] of Object.entries(vars)) {
    tokens[key] = {
      $value: value,
      $type: tokenType(key, value),
      $description: `${mode} mode`,
    };
  }
  return tokens;
}

const output = {
  $schema: 'https://design-tokens.github.io/community-group/format/',
  $description: '4CoreFinSupport design tokens – generated from src/index.css',
  light: buildTokens(lightVars, 'light'),
  dark: buildTokens(darkVars, 'dark'),
  modes: ['light', 'dark'],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');

console.log(`✅ Wrote ${OUT_PATH}`);
console.log(`   Light tokens: ${Object.keys(lightVars).length}`);
console.log(`   Dark tokens:  ${Object.keys(darkVars).length}`);
