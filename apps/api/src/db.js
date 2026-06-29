const { Pool } = require('pg');
const cfg = require('./config');

const pool = new Pool({
  connectionString: cfg.databaseUrl,
  // Managed-identity Postgres (Azure DB for PostgreSQL) can also be wired here;
  // for a password connection over TLS, keep ssl on.
  ssl: cfg.pgSsl ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('pg pool error', err));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
