// Búsqueda por título que ignora mayúsculas y acentos:
// "mision imposible" encuentra "Misión Imposible", "ano" encuentra "Año", etc.
// Usa solo funciones básicas de Postgres (translate/lower), así no depende de extensiones
// ni del idioma configurado en el servidor.
const MIN = 'áàâäéèêëíìîïóòôöúùûüñ';
const MIN_A = 'aaaaeeeeiiiioooouuuun';
const DE = MIN + MIN.toUpperCase();
const A = MIN_A + MIN_A.toUpperCase();

function normalizar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Agrega el patrón a `params` y devuelve el fragmento SQL para usar en un WHERE.
function condicionTitulo(params, texto) {
  const patron = '%' + normalizar(String(texto).trim()).replace(/[\\%_]/g, '\\$&') + '%';
  params.push(patron);
  return `lower(translate(m.title, '${DE}', '${A}')) LIKE $${params.length} ESCAPE '\\'`;
}

module.exports = { condicionTitulo, normalizar };
