const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
 
// ---- Diagnóstico: escribe en los logs qué dirección de base de datos recibió la app ----
const dbUrl = process.env.DATABASE_URL;
console.log('[DB] DATABASE_URL definida:', !!dbUrl, '| longitud:', dbUrl ? dbUrl.length : 0);
if (dbUrl) {
  try {
    const u = new URL(dbUrl);
    console.log('[DB] host:', u.hostname, '| puerto:', u.port, '| base:', u.pathname);
  } catch (e) {
    console.log('[DB] DATABASE_URL no se puede leer como dirección. Empieza con:', dbUrl.slice(0, 12));
  }
} else {
  console.log('[DB] La app NO recibió DATABASE_URL. Variables que sí recibió que empiezan con DATABASE o PG:',
    Object.keys(process.env).filter(k => /^(DATABASE|PG)/.test(k)).join(', ') || '(ninguna)');
}
 
const isLocalDb = /localhost|127\.0\.0\.1/.test(dbUrl || '');
 
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});
 
async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Esquema de base de datos verificado.');
}
 
module.exports = { pool, initSchema };
 
