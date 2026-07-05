import { describe, it, expect } from 'vitest';
import { csvField, escapeHtml } from '../src/format.js';

describe('csvField (CSV formula-injection guard + quoting)', () => {
  it('passes plain values through', () => {
    expect(csvField('hello')).toBe('hello');
    expect(csvField(42)).toBe('42');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
  it('neutralizes formula-injection leading characters', () => {
    expect(csvField('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@cmd')).toBe("'@cmd");
  });
  it('quotes and escapes fields with commas/quotes/newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml(`<script>alert('x')&"`)).toBe('&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;');
  });
  it('handles nullish and non-strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(7)).toBe('7');
  });
});
