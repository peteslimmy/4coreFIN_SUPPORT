/**
 * SVG upload sanitization.
 *
 * Rejects SVGs containing executable content: <script> tags, event handler
 * attributes (onload, onclick, …), javascript: URIs, foreignObject with
 * embedded HTML, and data: URIs that could carry scripts.
 *
 * This is a deny-list approach — it's easier to enumerate what's dangerous
 * than to whitelist every safe SVG construct.
 */

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Script elements
  { pattern: /<script[\s>]/i, label: '<script> tag' },
  { pattern: /<\/script>/i, label: '</script> closing tag' },

  // Event handler attributes (on* = JS)
  { pattern: /\bon\w+\s*=/i, label: 'event handler attribute (on*)' },

  // javascript: URI scheme (with optional whitespace / encoding)
  { pattern: /javascript\s*:/i, label: 'javascript: URI' },

  // data: URI that could carry script content
  { pattern: /data\s*:\s*text\/html/i, label: 'data: URI with text/html' },
  { pattern: /data\s*:\s*application\/x-javascript/i, label: 'data: URI with JS' },

  // foreignObject can embed arbitrary XHTML
  { pattern: /<foreignobject[\s>]/i, label: '<foreignObject> (XHTML embed)' },

  // SVG animation with JavaScript
  { pattern: /<animate[^>]*\bvalues?\s*=\s*["'][^"']*javascript/i, label: 'animate with javascript value' },

  // <use> referencing external resources
  { pattern: /<use[^>]*\bxlink:href\s*=\s*["']https?:/i, label: '<use> with external xlink:href' },

  // CSS-based attacks
  { pattern: /expression\s*\(/i, label: 'CSS expression()' },
  { pattern: /@import\s+['"]?(?:https?:|javascript:)/i, label: '@import with external URL' },
  { pattern: /<style[\s>][^<]*?(?:expression|javascript|url\s*\()/i, label: 'CSS with dangerous content' },

  // SVG set/animate with href to javascript
  { pattern: /<set[^>]*attributeName\s*=\s*["']href["'][^>]*to\s*=\s*["']javascript/i, label: '<set> with javascript href' },
  { pattern: /<animate[^>]*attributeName\s*=\s*["']href["'][^>]*values?\s*=\s*["'][^"']*javascript/i, label: '<animate> with javascript href' },

  // meta refresh with javascript
  { pattern: /<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*javascript/i, label: 'meta refresh with javascript' },
];

/**
 * Validate an SVG buffer for dangerous content.
 * Returns `null` if safe, or an error message string if unsafe.
 */
export function validateSvgBuffer(buffer: Buffer): string | null {
  const content = buffer.toString('utf-8');

  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      return `SVG rejected: contains ${label}`;
    }
  }

  return null;
}
