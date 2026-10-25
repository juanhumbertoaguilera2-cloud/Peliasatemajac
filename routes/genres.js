const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, position FROM genres ORDER BY position ASC, id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener géneros' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Falta el nombre del género' });
  try {
    // el género nuevo entra al final de la lista
    const result = await pool.query(
      `INSERT INTO genres (name, position)
       VALUES ($1, COALESCE((SELECT MAX(position) FROM genres), 0) + 1)
       ON CONFLICT (name) DO NOTHING RETURNING *`,
      [name.trim()]
    );
    if (!result.rows[0]) return res.status(409).json({ error: 'Ese género ya existe' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el género' });
  }
});

// PUT /api/genres/reorder (admin) - body: { ids: [3, 1, 2, ...] } en el orden deseado
router.put('/reorder', requireAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: 'Lista de géneros inválida' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE genres SET position=$1 WHERE id=$2', [i + 1, ids[i]]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al guardar el orden' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM genres WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al borrar el género' });
  }
});

module.exports = router;
