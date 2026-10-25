const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

// Las imágenes laterales se guardan junto a las de las películas, así quedan
// dentro del mismo volumen de Railway y no se borran al actualizar la app.
const uploadDir = path.join(__dirname, '../public/uploads/movies');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'lateral-' + unique + path.extname(file.originalname).toLowerCase());
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 800 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('El archivo debe ser una imagen'));
    cb(null, true);
  }
});

const KEYS = { left: 'side_left', right: 'side_right' };

async function getSettings() {
  const r = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [Object.values(KEYS)]);
  const out = { side_left: null, side_right: null };
  r.rows.forEach(row => { out[row.key] = row.value; });
  return out;
}

// borra del disco las imágenes que ya no usa ningún lado
async function limpiarHuerfanas(antes) {
  const ahora = await getSettings();
  const enUso = new Set(Object.values(ahora).filter(Boolean));
  Object.values(antes).filter(Boolean).forEach(archivo => {
    if (!enUso.has(archivo)) fs.unlink(path.join(uploadDir, archivo), () => {});
  });
}

// GET /api/settings - público, lo usa el catálogo para pintar las imágenes
router.get('/', async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al leer los ajustes' });
  }
});

// POST /api/settings/side (admin) - campos: side = left | right | both, imagen = archivo
router.post('/side', requireAdmin, upload.single('imagen'), async (req, res) => {
  const side = req.body.side;
  if (!req.file) return res.status(400).json({ error: 'Falta la imagen' });
  if (!['left', 'right', 'both'].includes(side)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Lado inválido' });
  }
  const lados = side === 'both' ? ['left', 'right'] : [side];
  try {
    const antes = await getSettings();
    for (const lado of lados) {
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [KEYS[lado], req.file.filename]
      );
    }
    await limpiarHuerfanas(antes);
    res.json(await getSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la imagen' });
  }
});

// DELETE /api/settings/side/:side (admin) - quita la imagen de un lado
router.delete('/side/:side', requireAdmin, async (req, res) => {
  const key = KEYS[req.params.side];
  if (!key) return res.status(400).json({ error: 'Lado inválido' });
  try {
    const antes = await getSettings();
    await pool.query('DELETE FROM settings WHERE key = $1', [key]);
    await limpiarHuerfanas(antes);
    res.json(await getSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al quitar la imagen' });
  }
});

module.exports = router;
