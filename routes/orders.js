const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

const UBICACIONES = ['Parque Rojo', 'Santa Tere'];
// tier (GB) -> valor máximo acumulado que le cabe
const CAPACIDADES = { 16: 14.4, 32: 28.8, 64: 57.6, 128: 115.2 };

// POST /api/orders - crear pedido (público)
router.post('/', async (req, res) => {
  const { movieIds, tier, deliveryLocation } = req.body;

  if (!Array.isArray(movieIds) || movieIds.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos una película' });
  }
  if (!UBICACIONES.includes(deliveryLocation)) {
    return res.status(400).json({ error: 'Elige un lugar de entrega válido' });
  }
  const cap = CAPACIDADES[Number(tier)];
  if (!cap) {
    return res.status(400).json({ error: 'Capacidad de memoria inválida' });
  }

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id, valor FROM movies WHERE id = ANY($1::int[])', [movieIds]);
    if (existing.rows.length !== new Set(movieIds).size) {
      return res.status(400).json({ error: 'Alguna de las películas seleccionadas ya no está disponible' });
    }

    // el valor acumulado se recalcula en el servidor, nunca se confía en lo que mande el navegador
    const valorTotal = existing.rows.reduce((sum, m) => sum + Number(m.valor), 0);
    if (valorTotal > cap) {
      return res.status(400).json({ error: `Tu selección (${valorTotal.toFixed(1)}) no cabe en una memoria de ${tier}GB (máximo ${cap}).` });
    }

    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO orders (tier, delivery_location, status) VALUES ($1, $2, $3) RETURNING id, created_at',
      [tier, deliveryLocation, 'pendiente']
    );
    const orderId = result.rows[0].id;
    for (const movieId of movieIds) {
      await client.query('INSERT INTO order_movies (order_id, movie_id) VALUES ($1, $2)', [orderId, movieId]);
    }
    await client.query('COMMIT');
    res.json({ id: orderId, created_at: result.rows[0].created_at, valorTotal });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al crear el pedido' });
  } finally {
    client.release();
  }
});

// GET /api/orders (admin) - listar pedidos con sus películas
router.get('/', requireAdmin, async (req, res) => {
  try {
    const orders = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const movies = await pool.query(`
      SELECT om.order_id, m.title, m.valor FROM order_movies om
      JOIN movies m ON m.id = om.movie_id
      ORDER BY m.title ASC
    `);
    const byOrder = {};
    movies.rows.forEach(r => {
      if (!byOrder[r.order_id]) byOrder[r.order_id] = [];
      byOrder[r.order_id].push(r.title);
    });
    const result = orders.rows.map(o => ({ ...o, peliculas: byOrder[o.id] || [] }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pedidos' });
  }
});

// PATCH /api/orders/:id/estatus (admin)
router.patch('/:id/estatus', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pendiente', 'armado', 'entregado'].includes(status)) {
    return res.status(400).json({ error: 'Estatus inválido' });
  }
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el estatus' });
  }
});

module.exports = router;
