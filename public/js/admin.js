const loginScreen = document.getElementById('loginScreen');
const adminPanel = document.getElementById('adminPanel');
const logoutBtn = document.getElementById('logoutBtn');

let genres = [];
let editingMovieId = null;

async function checkSession() {
  const res = await fetch('/api/admin/check');
  const data = await res.json();
  if (data.isAdmin) {
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    initAdmin();
  } else {
    loginScreen.style.display = 'flex';
    adminPanel.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
}

document.getElementById('loginBtn').onclick = async () => {
  const password = document.getElementById('passwordInput').value;
  const errorEl = document.getElementById('loginError');
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (res.ok) { checkSession(); }
  else { const d = await res.json(); errorEl.textContent = d.error || 'Error al iniciar sesión'; }
};
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

logoutBtn.onclick = async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  checkSession();
};

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('selected', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
    if (btn.dataset.tab === 'pedidos') loadOrders();
  };
});

function initAdmin() {
  loadGenresAdmin();
  loadMoviesAdmin();
}

// ---------- GÉNEROS ----------
async function loadGenresAdmin() {
  const res = await fetch('/api/genres');
  genres = await res.json();
  renderGenreCheckList();
  renderGenreList();
}

function renderGenreCheckList() {
  const container = document.getElementById('genreCheckList');
  container.innerHTML = '';
  genres.forEach(g => {
    const item = document.createElement('label');
    item.className = 'genre-check-item';
    item.innerHTML = `<input type="checkbox" value="${g.id}"> ${g.name}`;
    container.appendChild(item);
  });
}

function renderGenreList() {
  const list = document.getElementById('genreList');
  list.innerHTML = '';
  genres.forEach(g => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-title">${g.name}</div>
      <div class="admin-row-actions"><button class="danger">Borrar</button></div>
    `;
    row.querySelector('button').onclick = async () => {
      if (!confirm(`¿Borrar el género "${g.name}"?`)) return;
      await fetch('/api/genres/' + g.id, { method: 'DELETE' });
      loadGenresAdmin();
    };
    list.appendChild(row);
  });
}

document.getElementById('genreForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('genreName').value.trim();
  const msg = document.getElementById('genreFormMsg');
  const res = await fetch('/api/genres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error; return; }
  document.getElementById('genreName').value = '';
  msg.textContent = '';
  loadGenresAdmin();
};

// ---------- PELÍCULAS ----------
async function loadMoviesAdmin() {
  const res = await fetch('/api/movies?limit=1000');
  const movies = await res.json();
  const list = document.getElementById('movieList');
  list.innerHTML = '';
  movies.forEach(m => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-info">
        <img src="/uploads/movies/${m.image_filename}" alt="${m.title}">
        <div>
          <div class="admin-row-title">${m.title}</div>
          <div class="admin-row-sub">Valor: ${m.valor} · ${(m.generos || []).join(', ') || 'Sin género'}</div>
        </div>
      </div>
      <div class="admin-row-actions">
        <button class="edit-btn">Editar</button>
        <button class="danger delete-btn">Borrar</button>
      </div>
    `;
    row.querySelector('.edit-btn').onclick = () => editMovie(m);
    row.querySelector('.delete-btn').onclick = async () => {
      if (!confirm(`¿Borrar "${m.title}"?`)) return;
      await fetch('/api/movies/' + m.id, { method: 'DELETE' });
      loadMoviesAdmin();
    };
    list.appendChild(row);
  });
}

function editMovie(movie) {
  editingMovieId = movie.id;
  document.getElementById('movieFormTitle').textContent = 'Editar: ' + movie.title;
  document.getElementById('movieId').value = movie.id;
  document.getElementById('movieTitle').value = movie.title;
  document.getElementById('movieValor').value = movie.valor;
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  document.querySelectorAll('#genreCheckList input').forEach(cb => {
    cb.checked = (movie.generos || []).includes(genres.find(g => g.id == cb.value)?.name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('cancelEditBtn').onclick = () => resetMovieForm();

function resetMovieForm() {
  editingMovieId = null;
  document.getElementById('movieFormTitle').textContent = 'Agregar película';
  document.getElementById('movieForm').reset();
  document.getElementById('cancelEditBtn').style.display = 'none';
}

document.getElementById('movieForm').onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('movieFormMsg');
  const title = document.getElementById('movieTitle').value.trim();
  const valor = document.getElementById('movieValor').value || '1.2';
  const imageFile = document.getElementById('movieImage').files[0];
  const genreIds = [...document.querySelectorAll('#genreCheckList input:checked')].map(cb => Number(cb.value));

  if (!editingMovieId && !imageFile) { msg.textContent = 'Selecciona una imagen.'; return; }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('valor', valor);
  formData.append('generos', JSON.stringify(genreIds));
  if (imageFile) formData.append('imagen', imageFile);

  msg.textContent = 'Guardando...';
  const url = editingMovieId ? '/api/movies/' + editingMovieId : '/api/movies';
  const method = editingMovieId ? 'PUT' : 'POST';
  const res = await fetch(url, { method, body: formData });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error || 'Error al guardar'; return; }

  msg.textContent = '';
  resetMovieForm();
  loadMoviesAdmin();
};

// ---------- PEDIDOS ----------
async function loadOrders() {
  const res = await fetch('/api/orders');
  const orders = await res.json();
  const list = document.getElementById('orderList');
  list.innerHTML = '';
  if (orders.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);">Todavía no hay pedidos.</p>';
    return;
  }
  orders.forEach(o => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const fecha = new Date(o.created_at).toLocaleString('es-MX');
    row.innerHTML = `
      <div class="admin-row-info">
        <div>
          <div class="admin-row-title">Pedido #${o.id} · ${o.tier} películas · ${o.delivery_location}</div>
          <div class="admin-row-sub">${fecha} — ${o.peliculas.join(', ')}</div>
        </div>
      </div>
      <div class="admin-row-actions">
        <select class="status-select">
          <option value="pendiente"${o.status === 'pendiente' ? ' selected' : ''}>Pendiente</option>
          <option value="armado"${o.status === 'armado' ? ' selected' : ''}>Armado</option>
          <option value="entregado"${o.status === 'entregado' ? ' selected' : ''}>Entregado</option>
        </select>
      </div>
    `;
    row.querySelector('select').onchange = async (e) => {
      await fetch(`/api/orders/${o.id}/estatus`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: e.target.value })
      });
    };
    list.appendChild(row);
  });
}

checkSession();
