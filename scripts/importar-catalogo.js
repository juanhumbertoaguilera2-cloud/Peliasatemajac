/**
 * Importa masivamente un catálogo capturado con pelis-atemajac-captura.html
 * hacia la base de datos real del proyecto (Postgres).
 *
 * Uso:
 *   1. Asegúrate de tener tu archivo .env configurado (DATABASE_URL).
 *   2. Coloca tu JSON exportado junto a este script, o pásale la ruta:
 *        node scripts/importar-catalogo.js ./catalogo-pelis-atemajac.json
 *   3. node scripts/importar-catalogo.js
 *
 * Qué hace:
 *   - Crea los géneros que no existan todavía.
 *   - Crea las películas que no existan todavía (por título).
 *   - Si la película trae imagen (base64 desde la herramienta de captura),
 *     la guarda en public/uploads/movies/. Si no trae imagen, la deja
 *     pendiente para que la subas después desde el admin.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, initSchema } = require('../db/pool');

const jsonPath = process.argv[2] || path.join(__dirname, '../catalogo-pelis-atemajac.json');
const uploadDir = path.join(__dirname, '../public/uploads/movies');

async function main() {
  if (!fs.existsSync(jsonPath)) {
    console.error(`No encontré el archivo: ${jsonPath}`);
    console.error('Pásalo como argumento: node scripts/importar-catalogo.js ruta/al/catalogo.json');
    process.exit(1);
  }

  await initSchema();
  fs.mkdirSync(uploadDir, { recursive: true });

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const generosNombres = data.generos || [];
  const peliculas = data.peliculas || [];

  console.log(`Géneros en el archivo: ${generosNombres.length}`);
  console.log(`Películas en el archivo: ${peliculas.length}`);

  // 1. Crear géneros que falten
  const genreIdByName = {};
  const existingGenres = await pool.query('SELECT id, name FROM genres');
  existingGenres.rows.forEach(g => { genreIdByName[g.name] = g.id; });

  for (const name of generosNombres) {
    if (!genreIdByName[name]) {
      const res = await pool.query(
        'INSERT INTO genres (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id',
        [name]
      );
      if (res.rows[0]) genreIdByName[name] = res.rows[0].id;
      else {
        const again = await pool.query('SELECT id FROM genres WHERE name=$1', [name]);
        genreIdByName[name] = again.rows[0].id;
      }
    }
  }
  console.log(`Géneros listos: ${Object.keys(genreIdByName).length}`);

  // 2. Crear películas que falten
  const existingMovies = await pool.query('SELECT title FROM movies');
  const existingTitles = new Set(existingMovies.rows.map(r => r.title));

  let creadas = 0, saltadas = 0, conImagen = 0;

  for (const p of peliculas) {
    if (existingTitles.has(p.titulo)) { saltadas++; continue; }

    let imageFilename = 'pendiente.jpg'; // placeholder hasta que subas la imagen real
    if (p.imagen && p.imagen.startsWith('data:image')) {
      const matches = p.imagen.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `import-${Date.now()}-${Math.round(Math.random()*1e9)}.${ext}`;
        fs.writeFileSync(path.join(uploadDir, filename), buffer);
        imageFilename = filename;
        conImagen++;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'INSERT INTO movies (title, image_filename) VALUES ($1, $2) RETURNING id',
        [p.titulo, imageFilename]
      );
      const movieId = result.rows[0].id;
      const genresForMovie = p.generos || [];
      for (const gName of genresForMovie) {
        const gId = genreIdByName[gName];
        if (gId) await client.query('INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1,$2)', [movieId, gId]);
      }
      await client.query('COMMIT');
      creadas++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Error al crear "${p.titulo}":`, err.message);
    } finally {
      client.release();
    }
  }

  console.log('---');
  console.log(`Películas creadas: ${creadas}`);
  console.log(`Películas con imagen incluida: ${conImagen}`);
  console.log(`Películas saltadas (ya existían): ${saltadas}`);
  if (creadas > conImagen) {
    console.log(`\nNota: ${creadas - conImagen} películas quedaron con una imagen "pendiente.jpg" de relleno.`);
    console.log('Súbeles su imagen real desde el panel de admin cuando la tengas.');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Error al importar:', err);
  process.exit(1);
});
