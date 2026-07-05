require('dotenv').config();

const tenantId = process.env.AZURE_TENANT_ID;

module.exports = {
  port: process.env.PORT || 8080,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  pgSsl: process.env.PGSSL === 'require',

  // Entra ID — used to VALIDATE incoming user access tokens
  tenantId,
  apiClientId: process.env.API_CLIENT_ID,
  apiAudience: process.env.API_AUDIENCE || `api://${process.env.API_CLIENT_ID}`,
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  adminAppRole: process.env.ADMIN_APP_ROLE || 'Governance.Admin',
  managerAppRole: process.env.MANAGER_APP_ROLE || 'Governance.Manager',

  // Microsoft Graph — used by the backend to sync the directory + read SharePoint
  graph: {
    enterpriseAppSpId: process.env.GRAPH_ENTERPRISE_APP_SP_ID,
    sharepointSiteId: process.env.SHAREPOINT_SITE_ID,
    // Document library (drive) that holds the policies, and the base folder within it.
    // Defaults match the Global IT "Policies Process Procedures Guidelines" library.
    sharepointLibrary: process.env.SHAREPOINT_LIBRARY || 'Policies Process Procedures Guidelines',
    sharepointBaseFolder: process.env.SHAREPOINT_BASE_FOLDER || 'Approved/Policies',
    // Mailbox used to send reminder emails (Graph Mail.Send application permission).
    mailSender: process.env.GRAPH_MAIL_SENDER || null,
  },
  frontendUrl: process.env.FRONTEND_ORIGIN || '',
  remindersEnabled: process.env.REMINDERS_ENABLED === 'true',

  // Credentials. In production these are BLANK and Managed Identity is used.
  graphClientId: process.env.GRAPH_CLIENT_ID || null,
  clientSecret: process.env.AZURE_CLIENT_SECRET || null,

  // Operational tunables (centralized so policy isn't buried in handlers).
  quizMaxAttempts: parseInt(process.env.QUIZ_MAX_ATTEMPTS, 10) || 3,
  backupRetention: parseInt(process.env.BACKUP_RETENTION, 10) || 14,

  // In-process daily jobs (backup, directory sync + reminders) run on timers.
  // A Postgres advisory lock (src/leader.js) ensures only ONE instance runs
  // each tick, so when scaling the API horizontally leave SCHEDULERS_ENABLED=true
  // on EVERY replica — the lock arbitrates automatically. This flag is now just a
  // kill-switch (set to false to disable the schedulers on an instance entirely).
  // Defaults to enabled.
  schedulersEnabled: process.env.SCHEDULERS_ENABLED !== 'false',

  // Only echo token-validation error detail to clients outside production
  // (it's useful in dev, but leaks "jwt expired" / "audience invalid" otherwise).
  exposeAuthErrors: process.env.NODE_ENV !== 'production',

  // ── Uploaded-file storage (trainings) ──────────────────────
  // Local disk is the default and preserves today's behavior exactly. Set
  // STORAGE_DRIVER=blob (+ Azure Storage settings) to store files in Azure Blob
  // so any API replica can serve them — the enabler for multi-instance/HA.
  uploadDir: process.env.UPLOAD_DIR || '/uploads',
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',   // 'local' | 'blob'
    // Blob: prefer Managed Identity (accountUrl) in prod; connectionString for dev.
    blobAccountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL || null,
    blobConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || null,
    blobContainer: process.env.AZURE_STORAGE_CONTAINER || 'uploads',
  },
};
