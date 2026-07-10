// Entry point. Sets the MSAL global the app expects, then loads the app.
// React/ReactDOM are imported directly inside app.jsx (bundled by Vite).
import './_tokens.css';                 // light/dark design tokens (theme)
import { applyTheme } from './theme.js';
import * as msal from '@azure/msal-browser';

// Apply the saved/system theme as early as the bundle runs. Done here (not via an
// inline <script>) because the web tier's CSP is script-src 'self' with no inline
// allowance — an inline script would be blocked. The app shows a Splash while
// loading, so there is no visible flash of the wrong theme.
try { applyTheme(); } catch (_) { /* default light */ }

window.msal = msal;
import('./app.jsx');
