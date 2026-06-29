// ============================================================
//  Microsoft Graph client (app-only / service identity)
//  Used by the backend for directory sync + SharePoint reads.
//
//  PRODUCTION: DefaultAzureCredential -> the App Service /
//  Container App Managed Identity. No secrets in code or config.
//  LOCAL DEV: falls back to a confidential-client secret.
// ============================================================
require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } =
  require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');
const cfg = require('./config');

const credential =
  cfg.clientSecret && cfg.graphClientId
    ? new ClientSecretCredential(cfg.tenantId, cfg.graphClientId, cfg.clientSecret) // dev only
    : new DefaultAzureCredential();                                                // prod: Managed Identity

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  // .default = exactly the application permissions admin-consented to this app — nothing more.
  scopes: ['https://graph.microsoft.com/.default'],
});

const graph = Client.initWithMiddleware({ authProvider });

module.exports = graph;
