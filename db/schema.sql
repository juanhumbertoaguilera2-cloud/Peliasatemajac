CREATE TABLE IF NOT EXISTS genres (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  image_filename TEXT NOT NULL,
  valor NUMERIC(4,1) NOT NULL DEFAULT 1.2,
  created_at TIMESTAMP DEFAULT NOW()
);

-- por si la tabla ya existía de una versión anterior sin esta columna
ALTER TABLE movies ADD COLUMN IF NOT EXISTS valor NUMERIC(4,1) NOT NULL DEFAULT 1.2;

CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
  genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

-- tier = capacidad de memoria en GB (16, 32, 64 o 128), no número de películas
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  tier INTEGER NOT NULL DEFAULT 16,
  delivery_location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_movies (
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_movies_title ON movies (title);

-- orden de los géneros (se acomodan arrastrando desde el admin)
ALTER TABLE genres ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
-- a los géneros que ya existían les damos un orden inicial (el de su creación)
UPDATE genres SET position = id WHERE position = 0;

-- ajustes sueltos del sitio, por ahora las imágenes laterales (side_left / side_right)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
