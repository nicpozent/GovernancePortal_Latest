// Unit tests for the presentation/logic helpers extracted from app.jsx.
// parseEmployeeCsv is real parsing logic that backs the bulk-import feature and
// had no coverage before the extraction.
import { describe, it, expect } from 'vitest';
import { parseEmployeeCsv, fmtDate, pctColor, initials, statusPill } from '../src/ui.jsx';

describe('parseEmployeeCsv', () => {
  it('parses a headered CSV, mapping aliased column names', () => {
    const rows = parseEmployeeCsv('First,Last,Email,Dept,Title\nAda,Lovelace,ada@x,Eng,Engineer');
    expect(rows).toEqual([{ firstName: 'Ada', lastName: 'Lovelace', displayName: '', email: 'ada@x', department: 'Eng', jobTitle: 'Engineer' }]);
  });

  it('falls back to positional columns when there is no recognisable header', () => {
    const rows = parseEmployeeCsv('Ada,Lovelace,ada@x,Eng,Engineer');
    expect(rows[0].firstName).toBe('Ada');
    expect(rows[0].email).toBe('ada@x');
  });

  it('handles quoted fields containing commas and escaped quotes', () => {
    const rows = parseEmployeeCsv('name,email\n"Doe, John",john@x\n"A ""B""",b@x');
    expect(rows[0].displayName).toBe('Doe, John');
    expect(rows[1].displayName).toBe('A "B"');
  });

  it('drops empty rows and returns [] for empty input', () => {
    expect(parseEmployeeCsv('')).toEqual([]);
    expect(parseEmployeeCsv('name,email\n,\nAda,ada@x')).toHaveLength(1);
  });
});

describe('formatting helpers', () => {
  it('fmtDate renders a readable date and an em-dash for empty/invalid', () => {
    expect(fmtDate('2026-07-05T00:00:00Z')).toMatch(/2026/);
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('not-a-date')).toBe('—');
  });

  it('pctColor maps compliance bands to colours', () => {
    expect(pctColor(90)).toBe('var(--c1f7a5c)'); // green ≥80
    expect(pctColor(60)).toBe('var(--cb7791f)'); // amber ≥50
    expect(pctColor(20)).toBe('var(--cc0143c)'); // red <50
  });

  it('initials takes up to two upper-cased initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Cher')).toBe('C');
    expect(initials('')).toBe('—');
  });

  it('statusPill returns a distinct style object per status', () => {
    expect(statusPill('signed').color).toBe('var(--c1f7a5c)');
    expect(statusPill('pending').color).toBe('var(--c9a6712)');
    expect(statusPill('outdated').color).toBe('var(--cc0143c)');
  });
});
