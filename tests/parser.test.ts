import { describe, expect, it } from 'vitest';
import { extractAbkResult } from '@abk/bridge';

describe('abk_result parser', () => {
  it('extracts tagged JSON', () => {
    const text = 'noise <abk_result>{"status":"pass","issues":[]}</abk_result> tail';
    const result = extractAbkResult(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value.value as any).status).toBe('pass');
  });

  it('repairs malformed JSON', () => {
    const text = '<abk_result>{status: "fail", feedbackForRetry: "fix it",}</abk_result>';
    const result = extractAbkResult(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value.value as any).status).toBe('fail');
  });

  it('returns error when no JSON is present', () => {
    const result = extractAbkResult('nothing here');
    expect(result.ok).toBe(false);
  });
});
