/**
 * AI Prompt Injection Sanitization
 * Prevents prompt injection attacks on Gemini endpoints
 */
import crypto from 'crypto';

// Patterns that indicate potential prompt injection
const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|earlier|above)\s+(instructions|prompts|rules)/gi,
  /disregard\s+(previous|prior|earlier|above)\s+(instructions|prompts|rules)/gi,
  /forget\s+(previous|prior|earlier|above)\s+(instructions|prompts|rules)/gi,
  /system\s*:/gi,
  /assistant\s*:/gi,
  /user\s*:/gi,
  /\[INST\]/gi,
  /\[SYS\]/gi,
  /\[SYSTEM\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /###\s*(instruction|system|prompt)/gi,
  /---+\s*(instruction|system|prompt)/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(if\s+you\s+are\s+)?/gi,
  /pretend\s+(to\s+be\s+)?/gi,
  /roleplay\s+as/gi,
  /simulate\s+(being\s+)?/gi,
  /output\s+(only|just)\s+the\s+/gi,
  /print\s+(only|just)\s+the\s+/gi,
  /return\s+(only|just)\s+the\s+/gi,
  /respond\s+(only|just)\s+with/gi,
  /do\s+not\s+(explain|include|add)/gi,
  /no\s+(explanation|formatting|markdown)/gi,
  /raw\s+output/gi,
  /json\s+only/gi,
  /plain\s+text\s+only/gi,
];

// Suspicious sequences that might be encoding bypasses
const ENCODING_PATTERNS = [
  /\\u[0-9a-fA-F]{4}/g,  // Unicode escapes
  /\\x[0-9a-fA-F]{2}/g,  // Hex escapes
  /%[0-9a-fA-F]{2}/g,    // URL encoding
  /&#x?[0-9a-fA-F]+;/g,  // HTML entities
];

function isControlChar(code: number): boolean {
  return (code >= 0 && code <= 31) || code === 127;
}

function hasControlChars(s: string): boolean {
  for (const ch of s) {
    if (isControlChar(ch.charCodeAt(0))) return true;
  }
  return false;
}

// Removes C0 control characters except tab (9), LF (10) and CR (13).
function stripControlChars(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13) {
      out += ch;
    } else if (!isControlChar(code)) {
      out += ch;
    }
  }
  return out;
}

/**
 * Sanitize user input for use in AI prompts
 * Removes potential injection patterns and limits length
 */
export function sanitizePromptInput(input: string, maxLength: number = 10000): string {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input.slice(0, maxLength);

  // Remove injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }

  // Normalize encoding bypasses (decode then re-encode safe chars)
  for (const pattern of ENCODING_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      try {
        // Try to decode
        let decoded = match;
        if (match.startsWith('\\u')) {
          decoded = String.fromCharCode(parseInt(match.slice(2), 16));
        } else if (match.startsWith('\\x')) {
          decoded = String.fromCharCode(parseInt(match.slice(2), 16));
        } else if (match.startsWith('%')) {
          decoded = decodeURIComponent(match);
        } else if (match.startsWith('&#')) {
          decoded = match.replace(/&#x?([0-9a-fA-F]+);/g, (_, code) => 
            String.fromCharCode(parseInt(code, match.includes('x') ? 16 : 10))
          );
        }
        // If decoded is a control char or suspicious, filter it
        if (hasControlChars(decoded) || INJECTION_PATTERNS.some(p => p.test(decoded))) {
          return '[FILTERED]';
        }
        return decoded;
      } catch {
        return '[FILTERED]';
      }
    });
  }

  // Remove any remaining control characters except newline/tab
  sanitized = stripControlChars(sanitized);

  // Collapse excessive whitespace
  sanitized = sanitized.replace(/\s{4,}/g, '   ');

  return sanitized.trim();
}

/**
 * Validate that AI response matches expected schema
 * Throws if response doesn't match
 */
export function validateAIResponse<T>(response: unknown, schema: { parse: (data: unknown) => T }): T {
  try {
    return schema.parse(response);
  } catch (error) {
    console.error('AI response validation failed:', error);
    throw new Error('AI response format validation failed', { cause: error });
  }
}

/**
 * Log AI request for audit trail
 */
export function logAIRequest(
  logger: any,
  userId: string,
  endpoint: string,
  prompt: string,
  model: string
): void {
  logger.info({
    userId,
    endpoint,
    model,
    promptLength: prompt.length,
    promptHash: hashPrompt(prompt),
    timestamp: new Date().toISOString()
  }, 'AI request');
}

/**
 * Hash prompt for logging (without storing full prompt)
 */
function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}