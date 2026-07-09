/* Per-user light/dark theme preference.
   The preference ('light' | 'dark' | 'system') is stored in localStorage and
   applied as data-theme="light|dark" on <html>. A tiny inline script in
   index.html applies it before first paint (no flash); this module owns
   changes at runtime + a small React hook for the toggle. */
import * as React from 'react';

const KEY = 'gp-theme';

export function storedPref() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}
function systemDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
// Resolve a preference to the concrete theme actually shown.
export function resolve(pref) {
  pref = pref || storedPref();
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
}
export function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolve(pref));
}
export function setPref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}

// Hook: returns the resolved theme + a toggle that persists the choice.
export function useTheme() {
  const [pref, setP] = React.useState(storedPref());
  React.useEffect(() => { applyTheme(pref); }, [pref]);
  const set = (p) => { setPref(p); setP(p); };
  const theme = resolve(pref);
  const toggle = () => set(theme === 'dark' ? 'light' : 'dark');
  return { pref, theme, toggle, set };
}
