const PAGE_SIZE = 60;
// GB -> valor máximo acumulado que le cabe
const CAPACIDADES = { 16: 14.4, 32: 28.8, 64: 57.6, 128: 115.2 };
const TIERS_ORDER = [16, 32, 64, 128];

let genres = [];                 // [{id, name}]
let genreState = {};             // name -> {loaded, offset, hasMore, movies:[]}
let selected = {};               // id -> {id, title, image_filename, valor}
let tier = 16;
let deliveryLocation = null;
let searchMode = false;

const CART_KEY = 'pelisAtemajacCart';
try {
  const saved = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  selected = saved.selected || {};
  tier = saved.tier || 16;
} catch (e) { /* nada guardado aún */ }

function saveCartLocal() {
  localStorage.setItem(CART_KEY, JSON.stringify({ selected, tier }));
}

function esc(texto) {
  return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function valorAcumulado() {
  return Object.values(selected).reduce((sum, m) => sum + Number(m.valor), 0);
}

const accordion = document.getElementById('genreAccordion');
const searchInput = document.getElementById('searchInput');
const cartFill = document.getElementById('cartFill');
const cartLabel = document.getElementById('cartLabel');
const tierModal = document.getElementById('tierModal');
const cartModal = document.getElementById('cartModal');
const successModal = document.getElementById('successModal');

async function loadSideImages() {
  try {
    const res = await fetch('/api/settings');
    const cfg = await res.json();
    [['left', cfg.side_left], ['right', cfg.side_right]].forEach(([lado, archivo]) => {
      if (!archivo) return;
      const el = document.createElement('div');
      el.className = 'side-image side-' + lado;
      el.innerHTML = `<img src="/uploads/movies/${archivo}" alt="">`;
      document.body.appendChild(el);
    });
  } catch (e) { /* si falla, el catálogo funciona igual sin imágenes laterales */ }
}

async function init() {
  loadSideImages();
  const res = await fetch('/api/genres');
  genres = await res.json();
  genres.forEach(g => { genreState[g.name] = { loaded: false, offset: 0, hasMore: true, movies: [] }; });
  renderAccordionShell();
  updateCartBar();
}

function renderAccordionShell() {
  accordion.innerHTML = '';
  if (genres.length === 0) {
    accordion.innerHTML = '<div class="no-results">Todavía no hay géneros cargados en el catálogo.</div>';
    return;
  }
  genres.forEach(genre => {
    const section = document.createElement('div');
    section.className = 'genre-section';
    section.dataset.genero = genre.name;
    section.innerHTML = `
      <button class="genre-header">
        <span class="genre-name">${esc(genre.name)}</span>
        <span class="genre-meta">
          <span class="genre-count"></span>
          <span class="genre-chevron">▾</span>
        </span>
      </button>
      <div class="genre-body">
        <div class="genre-grid"></div>
        <div class="genre-load-more" style="display:none;"><button class="btn btn-ghost load-more-btn">Cargar más</button></div>
      </div>
    `;
    section.querySelector('.genre-header').onclick = () => toggleGenre(genre.name, section);
    section.querySelector('.load-more-btn').onclick = () => loadGenreMovies(genre.name, section);
    accordion.appendChild(section);
  });
}

function toggleGenre(genreName, section) {
  const isExpanding = !section.classList.contains('expanded');
  section.classList.toggle('expanded');
  if (isExpanding && !genreState[genreName].loaded) {
    loadGenreMovies(genreName, section);
  }
}

async function loadGenreMovies(genreName, section) {
  const state = genreState[genreName];
  const params = new URLSearchParams({ genero: genreName, limit: PAGE_SIZE, offset: state.offset });
  const res = await fetch('/api/movies?' + params.toString());
  const movies = await res.json();
  state.hasMore = movies.length === PAGE_SIZE;
  state.offset += movies.length;
  state.loaded = true;
  state.movies.push(...movies);

  const grid = section.querySelector('.genre-grid');
  movies.forEach(m => grid.appendChild(buildCard(m)));

  section.querySelector('.genre-count').textContent = state.movies.length + (state.hasMore ? '+' : '');
  section.querySelector('.genre-load-more').style.display = state.hasMore ? 'block' : 'none';
}

function buildCard(movie) {
  const card = document.createElement('div');
  card.className = 'card' + (selected[movie.id] ? ' selected' : '');
  card.dataset.movieId = movie.id;
  card.innerHTML = `
    <div class="poster">
      <img src="/uploads/movies/${movie.image_filename}" alt="${esc(movie.title)}" loading="lazy">
      <div class="check">✓</div>
    </div>
    <div class="title" title="${esc(movie.title)}">${esc(movie.title)}</div>
  `;
  // si el archivo de la imagen no existe, mostrar un recuadro "Sin imagen" en lugar del ícono roto
  card.querySelector('img').onerror = (e) => {
    e.target.remove();
    card.querySelector('.poster').classList.add('poster-vacio');
  };
  card.onclick = () => toggleSelect(movie, card);
  return card;
}

function toggleSelect(movie, card) {
  if (selected[movie.id]) {
    delete selected[movie.id];
    card.classList.remove('selected');
    saveCartLocal();
    updateCartBar();
    return;
  }

  const cap = CAPACIDADES[tier];
  const proyectado = valorAcumulado() + Number(movie.valor);

  if (proyectado > cap) {
    if (tier === 16) {
      // desde la base, ofrecemos las tres capacidades mayores
      tierModal.classList.add('active');
    } else {
      alert(`Tu selección ya no cabe en la memoria de ${tier}GB (máximo ${cap}).`);
    }
    return;
  }

  selected[movie.id] = { id: movie.id, title: movie.title, image_filename: movie.image_filename, valor: movie.valor };
  card.classList.add('selected');
  saveCartLocal();
  updateCartBar();
}

function updateCartBar() {
  const sum = valorAcumulado();
  const cap = CAPACIDADES[tier];
  const pct = Math.min(100, Math.round((sum / cap) * 100));
  cartFill.style.width = pct + '%';
  cartLabel.textContent = `${sum.toFixed(1)} / ${cap} · Memoria ${tier}GB`;
}

// ---------- Búsqueda ----------
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();
  searchTimeout = setTimeout(() => {
    if (query === '') { searchMode = false; renderAccordionShell(); restoreLoadedSections(); }
    else { searchMode = true; runSearch(query); }
  }, 300);
});

function restoreLoadedSections() {
  genres.forEach(genre => {
    const state = genreState[genre.name];
    if (state.loaded) {
      const section = accordion.querySelector(`.genre-section[data-genero="${CSS.escape(genre.name)}"]`);
      const grid = section.querySelector('.genre-grid');
      state.movies.forEach(m => grid.appendChild(buildCard(m)));
      section.querySelector('.genre-count').textContent = state.movies.length + (state.hasMore ? '+' : '');
      section.querySelector('.genre-load-more').style.display = state.hasMore ? 'block' : 'none';
    }
  });
}

async function runSearch(query) {
  const params = new URLSearchParams({ buscar: query, limit: 200, offset: 0 });
  const res = await fetch('/api/movies?' + params.toString());
  const movies = await res.json();

  accordion.innerHTML = '';
  if (movies.length === 0) {
    accordion.innerHTML = '<div class="no-results">No encontramos películas con ese nombre.<br><strong>¿No encuentras tu película? Te la conseguimos.</strong></div>';
    return;
  }

  const byGenre = {};
  movies.forEach(m => {
    const gens = (m.generos && m.generos.length) ? m.generos : ['Sin género'];
    gens.forEach(g => { if (!byGenre[g]) byGenre[g] = []; byGenre[g].push(m); });
  });

  Object.keys(byGenre).forEach(genreName => {
    const section = document.createElement('div');
    section.className = 'genre-section expanded';
    section.innerHTML = `
      <button class="genre-header">
        <span class="genre-name">${esc(genreName)}</span>
        <span class="genre-meta"><span class="genre-count">${byGenre[genreName].length}</span><span class="genre-chevron">▾</span></span>
      </button>
      <div class="genre-body"><div class="genre-grid"></div></div>
    `;
    const grid = section.querySelector('.genre-grid');
    byGenre[genreName].forEach(m => grid.appendChild(buildCard(m)));
    section.querySelector('.genre-header').onclick = () => section.classList.toggle('expanded');
    accordion.appendChild(section);
  });
}

// ---------- Modales ----------
document.querySelectorAll('.tier-btn').forEach(btn => {
  btn.onclick = () => {
    tier = Number(btn.dataset.tier);
    saveCartLocal();
    updateCartBar();
    tierModal.classList.remove('active');
  };
});
document.getElementById('tierCancelBtn').onclick = () => tierModal.classList.remove('active');

document.getElementById('viewCartBtn').onclick = openCartModal;
document.getElementById('cartCloseBtn').onclick = () => cartModal.classList.remove('active');

function openCartModal() {
  renderCartList();
  cartModal.classList.add('active');
}

function renderCartList() {
  const list = document.getElementById('cartList');
  const labelModal = document.getElementById('cartLabelModal');
  const sum = valorAcumulado();
  const cap = CAPACIDADES[tier];
  labelModal.textContent = `${sum.toFixed(1)} / ${cap} · Memoria ${tier}GB`;
  list.innerHTML = '';
  Object.values(selected).forEach(movie => {
    const item = document.createElement('div');
    item.className = 'cart-item';
    item.innerHTML = `<span>${esc(movie.title)} <span class="cart-item-valor">(${movie.valor})</span></span><button aria-label="Quitar">✕</button>`;
    item.querySelector('button').onclick = () => {
      delete selected[movie.id];
      saveCartLocal();
      updateCartBar();
      renderCartList();
      const card = accordion.querySelector(`.card[data-movie-id="${movie.id}"]`);
      if (card) card.classList.remove('selected');
    };
    list.appendChild(item);
  });
  const hayPeliculas = Object.keys(selected).length > 0;
  document.getElementById('customerSection').style.display = hayPeliculas ? 'block' : 'none';
  document.getElementById('deliverySection').style.display = hayPeliculas ? 'block' : 'none';
}

document.querySelectorAll('.delivery-btn').forEach(btn => {
  btn.onclick = () => {
    deliveryLocation = btn.dataset.lugar;
    document.querySelectorAll('.delivery-btn').forEach(b => b.classList.toggle('selected', b === btn));
  };
});

document.getElementById('confirmOrderBtn').onclick = async () => {
  const statusMsg = document.getElementById('orderStatusMsg');
  const count = Object.keys(selected).length;
  if (count === 0) { statusMsg.textContent = 'Selecciona al menos una película.'; return; }
  const nombre = document.getElementById('customerName').value.replace(/\s+/g, ' ').trim();
  let celular = document.getElementById('customerPhone').value.replace(/\D/g, '');
  if (celular.length === 12 && celular.startsWith('52')) celular = celular.slice(2);
  if (nombre.length < 2) { statusMsg.textContent = 'Escribe tu nombre.'; document.getElementById('customerName').focus(); return; }
  if (celular.length !== 10) { statusMsg.textContent = 'Escribe tu celular a 10 dígitos (ejemplo: 3312345678).'; document.getElementById('customerPhone').focus(); return; }
  if (!deliveryLocation) { statusMsg.textContent = 'Elige un lugar de entrega.'; return; }

  statusMsg.textContent = 'Enviando pedido...';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movieIds: Object.keys(selected).map(Number),
        tier,
        deliveryLocation,
        customerName: nombre,
        customerPhone: celular
      })
    });
    const data = await res.json();
    if (!res.ok) { statusMsg.textContent = data.error || 'Error al enviar el pedido.'; return; }

    cartModal.classList.remove('active');
    document.getElementById('successMsg').textContent =
      `¡Gracias, ${nombre}! Pedido #${data.id} con ${count} películas, entrega en ${deliveryLocation}. Te contactaremos al ${celular} si hace falta.`;
    successModal.classList.add('active');

    selected = {};
    tier = 16;
    deliveryLocation = null;
    document.getElementById('customerName').value = '';
    document.getElementById('customerPhone').value = '';
    document.querySelectorAll('.delivery-btn').forEach(b => b.classList.remove('selected'));
    saveCartLocal();
    updateCartBar();
    accordion.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    statusMsg.textContent = '';
  } catch (e) {
    statusMsg.textContent = 'No se pudo conectar con el servidor.';
  }
};

document.getElementById('successCloseBtn').onclick = () => successModal.classList.remove('active');

init();
