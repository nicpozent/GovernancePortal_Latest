// Pure formatting/escaping helpers used by the SPA. Kept in their own module so
// they're unit-testable (see test/format.test.js) — both are security-relevant.

// CSV field encoder with a spreadsheet formula-injection guard: values starting
// with = + - @ (or tab/CR) are prefixed with a quote so Excel/Sheets won't
// execute them, and fields containing quotes/commas/newlines are quoted.
export function csvField(v) {
  let s = (v === null || v === undefined) ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// HTML-escape a value before injecting it into markup (e.g. the printed
// acknowledgement receipt).
export function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
