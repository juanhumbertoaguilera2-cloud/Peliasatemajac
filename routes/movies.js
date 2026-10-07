const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '../public/uploads/movies');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('El archivo debe ser una imagen'));
    cb(null, true);
  }
});

// GET /api/movies?genero=&buscar=&limit=&offset=
router.get('/', async (req, res) => {
  const { genero, buscar, limit = 48, offset = 0 } = req.query;
  try {
    let query = `
      SELECT m.id, m.title, m.image_filename, m.valor,
        COALESCE(array_agg(g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS generos
      FROM movies m
      LEFT JOIN movie_genres mg ON mg.movie_id = m.id
      LEFT JOIN genres g ON g.id = mg.genre_id
    `;
    const conditions = [];
    const params = [];

    if (buscar) {
      params.push(`%${buscar}%`);
      conditions.push(`m.title ILIKE $${params.length}`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY m.id ';

    if (genero && genero !== 'todas') {
      params.push(genero);
      query += ` HAVING $${params.length} = ANY(array_agg(g.name)) `;
    }

    query += ' ORDER BY m.title ASC ';
    params.push(Number(limit));
    query += ` LIMIT $${params.length} `;
    params.push(Number(offset));
    query += ` OFFSET $${params.length} `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener películas' });
  }
});

// POST /api/movies (admin) - crear película
router.post('/', requireAdmin, upload.single('imagen'), async (req, res) => {
  const { title, generos, valor } = req.body;
  if (!title || !req.file) return res.status(400).json({ error: 'Falta título o imagen' });
  const valorNum = Number(valor);
  const valorFinal = Number.isFinite(valorNum) && valorNum > 0 ? valorNum : 1.2;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO movies (title, image_filename, valor) VALUES ($1, $2, $3) RETURNING id',
      [title.trim(), req.file.filename, valorFinal]
    );
    const movieId = result.rows[0].id;
    const genreIds = generos ? JSON.parse(generos) : [];
    for (const gId of genreIds) {
      await client.query('INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1, $2)', [movieId, gId]);
    }
    await client.query('COMMIT');
    res.json({ id: movieId, title, image_filename: req.file.filename });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al crear la película' });
  } finally {
    client.release();
  }
});

// PUT /api/movies/:id (admin) - editar título/imagen/géneros
router.put('/:id', requireAdmin, upload.single('imagen'), async (req, res) => {
  const { id } = req.params;
  const { title, generos, valor } = req.body;
  const valorNum = Number(valor);
  const valorFinal = Number.isFinite(valorNum) && valorNum > 0 ? valorNum : 1.2;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (req.file) {
      await client.query('UPDATE movies SET title=$1, image_filename=$2, valor=$3 WHERE id=$4', [title.trim(), req.file.filename, valorFinal, id]);
    } else {
      await client.query('UPDATE movies SET title=$1, valor=$2 WHERE id=$3', [title.trim(), valorFinal, id]);
    }
    await client.query('DELETE FROM movie_genres WHERE movie_id=$1', [id]);
    const genreIds = generos ? JSON.parse(generos) : [];
    for (const gId of genreIds) {
      await client.query('INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1, $2)', [id, gId]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al editar la película' });
  } finally {
    client.release();
  }
});

// DELETE /api/movies/:id (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await pool.query('SELECT image_filename FROM movies WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM movies WHERE id=$1', [req.params.id]);
    if (existing.rows[0]) {
      const filePath = path.join(uploadDir, existing.rows[0].image_filename);
      fs.unlink(filePath, () => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al borrar la película' });
  }
});

module.exports = router;
