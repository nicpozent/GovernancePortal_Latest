// Entry point. Sets the MSAL global the app expects, then loads the app.
// React/ReactDOM are imported directly inside app.jsx (bundled by Vite).
import './_tokens.css';                 // light/dark design tokens (theme)
import * as msal from '@azure/msal-browser';
window.msal = msal;
import('./app.jsx');
