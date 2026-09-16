function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autorizado. Inicia sesión en el panel de administración.' });
}

module.exports = { requireAdmin };
