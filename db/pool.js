const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Esquema de base de datos verificado.');
}

module.exports = { pool, initSchema };
