// Unit tests for the API error-code → user-facing message mapping.
import { describe, it, expect } from 'vitest';
import { friendlyError, ERROR_MESSAGES } from '../src/errors.js';

describe('friendlyError', () => {
  it('maps a known code to its curated message (ignoring a technical detail)', () => {
    expect(friendlyError('quiz_required', 'quiz gate not passed'))
      .toBe('Please pass the knowledge check before signing.');
    expect(friendlyError('forbidden', null)).toBe('You don’t have permission to do that.');
  });

  it('falls back to the server detail for an unknown code', () => {
    expect(friendlyError('some_new_code', 'Specific server explanation')).toBe('Specific server explanation');
  });

  it('falls back to the raw code when there is no detail', () => {
    expect(friendlyError('some_new_code', null)).toBe('some_new_code');
  });

  it('returns a generic message when nothing is available', () => {
    expect(friendlyError(null, null)).toBe('Something went wrong. Please try again.');
  });

  it('covers the user-facing codes an employee can actually hit', () => {
    for (const code of ['quiz_required', 'no_attempts_left', 'must_acknowledge', 'forbidden', 'missing_file', 'upload_failed']) {
      expect(ERROR_MESSAGES[code], `missing friendly message for ${code}`).toBeTruthy();
      expect(ERROR_MESSAGES[code]).not.toBe(code); // must be a real sentence, not the code
    }
  });
});
