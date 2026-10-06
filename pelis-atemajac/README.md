# Pelis Atemajac

Catálogo de películas para armar memorias USB a la medida. Incluye catálogo público con selección de películas, flujo de pedido con entrega, y panel de administración para gestionar películas, géneros y pedidos.

## Estructura

```
pelis-atemajac/
  server.js              servidor Express
  db/schema.sql           esquema de la base de datos (se aplica solo al arrancar)
  db/pool.js               conexión a Postgres
  routes/                  API: movies, genres, orders, admin (login)
  middleware/auth.js       protección de rutas de administración
  public/
    index.html             catálogo público
    admin.html              panel de administración
    css/, js/               estilos y lógica de cada página
    uploads/movies/         aquí se guardan las imágenes subidas desde el admin
```

## Cargar tu catálogo capturado de un jalón

Si ya capturaste títulos y géneros con la herramienta `pelis-atemajac-captura.html` y tienes tu `catalogo-pelis-atemajac.json`, no hace falta que los vuelvas a escribir uno por uno en el admin real:

1. Coloca tu `catalogo-pelis-atemajac.json` en la raíz del proyecto (junto a `server.js`), o en cualquier lado y pásale la ruta.
2. Con el proyecto ya conectado a su base de datos (local o Railway) y las dependencias instaladas (`npm install`), corre:
   ```
   node scripts/importar-catalogo.js catalogo-pelis-atemajac.json
   ```
3. Esto crea los géneros y películas que falten. Si alguna película no traía imagen todavía, queda con una imagen de relleno (`pendiente.jpg`) — súbele la real después desde el admin, editando esa película.
4. Puedes correrlo varias veces sin duplicar nada: si el título ya existe, lo salta.

## Cómo correrlo en local

1. Necesitas Node.js 18+ y una base de datos Postgres (puedes usar Docker: `docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres`).
2. Copia `.env.example` a `.env` y llena `DATABASE_URL`, `ADMIN_PASSWORD` y `SESSION_SECRET`.
3. Instala dependencias y corre:
   ```
   npm install
   npm start
   ```
4. Abre `http://localhost:3000` (catálogo) y `http://localhost:3000/admin.html` (administración).

La primera vez que arranca, el servidor crea automáticamente las tablas si no existen (no necesitas correr el schema.sql a mano).

## Cómo desplegarlo en Railway

1. **Sube este proyecto a un repositorio de GitHub** (Railway despliega conectando el repo).
2. En Railway, crea un nuevo proyecto y elige **Deploy from GitHub repo**, seleccionando este repositorio.
3. Agrega el plugin de **PostgreSQL** al proyecto (botón "New" → "Database" → "PostgreSQL"). Railway conecta automáticamente la variable `DATABASE_URL` a tu servicio.
4. En la pestaña **Variables** de tu servicio, agrega:
   - `ADMIN_PASSWORD=Pa20262021!` — la contraseña para entrar a `/admin.html` (puedes cambiarla si quieres)
   - `SESSION_SECRET` — cualquier cadena larga y aleatoria
   - `NODE_ENV=production`
5. **Importante — persistencia de imágenes:** agrega un volumen (pestaña "Volumes" del servicio) montado en `/app/public/uploads/movies`. Sin esto, las imágenes que subas desde el admin se perderían cada vez que hagas un nuevo deploy, porque el sistema de archivos del contenedor no es permanente por sí solo.
6. Railway detecta automáticamente que es un proyecto Node.js (por el `package.json`) y corre `npm install` y `npm start`. No necesitas configurar nada más.
7. Una vez desplegado, entra a `/admin.html` con tu `ADMIN_PASSWORD` y empieza a cargar las películas del género infantil.

## Notas

- Las imágenes se recomiendan de ~12KB (thumbnail, sin necesidad de alta calidad) — con 2000+ películas esto mantiene el espacio total bajo control incluso en el volumen más pequeño de Railway.
- Los lugares de entrega (Parque Rojo / Santa Tere) están definidos directamente en `routes/orders.js` (constante `UBICACIONES`). Si en el futuro quieres agregar más lugares o gestionarlos desde el admin, es un cambio sencillo — dímelo cuando lo necesites.
- Las capacidades de memoria (12/24/48/96) están en `routes/orders.js` (constante `TIERS`) y en `public/js/catalog.js`.
