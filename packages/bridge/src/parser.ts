import type { Result } from '@abk/kernel';
import { ok, err } from '@abk/kernel';

export interface ParsedResult {
  value: unknown;
  repaired: boolean;
}

function stripCodeFences(text: string): string {
  return text.replace(/```(?:json|js|ts)?\s*([\s\S]*?)```/gi, '$1');
}

function findTagged(text: string): string | null {
  const match = text.match(/<abk_result\b[^>]*>([\s\S]*?)<\/abk_result>/i);
  return match ? match[1].trim() : null;
}

function repairJson(input: string): string {
  let s = input.trim();
  // Remove trailing commas before } or ].
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Quote unquoted keys (basic).
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  // Replace single quotes with double quotes.
  s = s.replace(/'([^']*)'/g, '"$1"');
  return s;
}

export function extractAbkResult(text: string): Result<ParsedResult> {
  const tagged = findTagged(text);
  const base = tagged ?? stripCodeFences(text);
  const candidates = [base];
  // If no braces, try whole text.
  const start = base.indexOf('{');
  const end = base.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(base.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return ok({ value: JSON.parse(candidate), repaired: false });
    } catch {
      const repaired = repairJson(candidate);
      try {
        return ok({ value: JSON.parse(repaired), repaired: true });
      } catch {
        // Continue.
      }
    }
  }
  // Last resort: find any JSON object in text.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return ok({ value: JSON.parse(match[0]), repaired: false });
    } catch {
      try {
        return ok({ value: JSON.parse(repairJson(match[0])), repaired: true });
      } catch {
        // Fall through.
      }
    }
  }
  return err('No valid <abk_result> JSON found');
}
