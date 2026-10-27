function esc(texto) {
  return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
    if (btn.dataset.tab === 'laterales') loadSideImages();
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
    item.innerHTML = `<input type="checkbox" value="${g.id}"> ${esc(g.name)}`;
    container.appendChild(item);
  });
}

let draggedIndex = null;

function renderGenreList() {
  const list = document.getElementById('genreList');
  list.innerHTML = '';
  genres.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'admin-row genre-row';
    row.draggable = true;
    row.innerHTML = `
      <div class="admin-row-info">
        <span class="drag-handle" title="Arrastra para acomodar">⋮⋮</span>
        <div class="admin-row-title">${esc(g.name)}</div>
      </div>
      <div class="admin-row-actions">
        <button class="move-up" title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="move-down" title="Bajar" ${i === genres.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="danger delete-btn">Borrar</button>
      </div>
    `;
    row.querySelector('.move-up').onclick = () => moveGenre(i, i - 1);
    row.querySelector('.move-down').onclick = () => moveGenre(i, i + 1);
    row.querySelector('.delete-btn').onclick = async () => {
      if (!confirm(`¿Borrar el género "${g.name}"?`)) return;
      await fetch('/api/genres/' + g.id, { method: 'DELETE' });
      loadGenresAdmin();
    };

    row.addEventListener('dragstart', (e) => {
      draggedIndex = i;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i)); // Firefox lo exige
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (draggedIndex !== null && draggedIndex !== i) moveGenre(draggedIndex, i);
    });
    row.addEventListener('dragend', () => {
      draggedIndex = null;
      document.querySelectorAll('.genre-row').forEach(r => r.classList.remove('dragging', 'drag-over'));
    });

    list.appendChild(row);
  });
}

async function moveGenre(from, to) {
  if (to < 0 || to >= genres.length || from === to) return;
  const marcados = [...document.querySelectorAll('#genreCheckList input:checked')].map(c => c.value);
  const [item] = genres.splice(from, 1);
  genres.splice(to, 0, item);
  renderGenreList();
  renderGenreCheckList();
  document.querySelectorAll('#genreCheckList input').forEach(c => { c.checked = marcados.includes(c.value); });

  const res = await fetch('/api/genres/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: genres.map(g => g.id) })
  });
  if (!res.ok) {
    alert('No se pudo guardar el orden. Se va a recargar la lista.');
    loadGenresAdmin();
  }
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
        <img src="/uploads/movies/${m.image_filename}" alt="${esc(m.title)}">
        <div>
          <div class="admin-row-title">${esc(m.title)}</div>
          <div class="admin-row-sub">Valor: ${m.valor} · ${esc((m.generos || []).join(', ') || 'Sin género')}</div>
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
    list.innerHTML = '<p class="admin-hint">Todavía no hay pedidos.</p>';
    return;
  }
  orders.forEach(o => {
    const row = document.createElement('div');
    row.className = 'admin-row order-row';
    const fecha = new Date(o.created_at).toLocaleString('es-MX');
    const nombre = o.customer_name ? esc(o.customer_name) : '<em>Sin nombre (pedido anterior)</em>';
    const contacto = o.customer_phone
      ? `${esc(o.customer_phone)} · <a href="https://wa.me/52${esc(o.customer_phone)}" target="_blank" rel="noopener">WhatsApp</a>`
      : 'Sin celular';
    row.innerHTML = `
      <div class="admin-row-info">
        <div>
          <div class="admin-row-title">Pedido #${o.id} · ${nombre}</div>
          <div class="admin-row-sub">Celular: ${contacto}</div>
          <div class="admin-row-sub">Memoria ${o.tier}GB · ${esc(o.delivery_location)} · ${esc(fecha)}</div>
          <div class="admin-row-sub">${o.peliculas.length} ${o.peliculas.length === 1 ? 'película' : 'películas'}: ${esc(o.peliculas.join(', '))}</div>
        </div>
      </div>
      <div class="admin-row-actions">
        <select class="status-select">
          <option value="pendiente"${o.status === 'pendiente' ? ' selected' : ''}>Pendiente</option>
          <option value="armado"${o.status === 'armado' ? ' selected' : ''}>Armado</option>
          <option value="entregado"${o.status === 'entregado' ? ' selected' : ''}>Entregado</option>
        </select>
        <button class="danger delete-order">Borrar</button>
      </div>
    `;
    row.querySelector('select').onchange = async (e) => {
      await fetch(`/api/orders/${o.id}/estatus`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: e.target.value })
      });
    };
    row.querySelector('.delete-order').onclick = async () => {
      const estatus = row.querySelector('select').value;
      const pregunta = estatus === 'entregado'
        ? `¿Borrar el pedido #${o.id}?`
        : `El pedido #${o.id} todavía NO está marcado como Entregado.\n\n¿Borrarlo de todos modos?`;
      if (!confirm(pregunta + '\n\nEsto no se puede deshacer.')) return;
      const r = await fetch('/api/orders/' + o.id, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || 'No se pudo borrar el pedido.');
      }
      loadOrders();
    };
    list.appendChild(row);
  });
}

checkSession();


// ---------- IMÁGENES LATERALES ----------
function pintarLado(lado, archivo) {
  const box = document.getElementById(lado === 'left' ? 'sidePreviewLeft' : 'sidePreviewRight');
  if (archivo) box.innerHTML = `<img src="/uploads/movies/${archivo}" alt="Imagen ${lado === 'left' ? 'izquierda' : 'derecha'}">`;
  else box.textContent = 'Sin imagen';
}

async function loadSideImages() {
  const res = await fetch('/api/settings');
  const s = await res.json();
  pintarLado('left', s.side_left);
  pintarLado('right', s.side_right);
}

async function subirLado(lado) {
  const msg = document.getElementById('sideMsg');
  const input = document.getElementById(lado === 'left' ? 'sideFileLeft' : 'sideFileRight');
  const file = input.files[0];
  if (!file) { msg.style.color = 'var(--accent)'; msg.textContent = 'Primero elige una imagen.'; return; }
  const ambos = document.getElementById('sameBoth').checked;

  const fd = new FormData();
  fd.append('side', ambos ? 'both' : lado);
  fd.append('imagen', file);
  msg.style.color = 'var(--text-muted)';
  msg.textContent = 'Subiendo...';
  const res = await fetch('/api/settings/side', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) { msg.style.color = 'var(--accent)'; msg.textContent = data.error || 'No se pudo subir la imagen.'; return; }

  input.value = '';
  pintarLado('left', data.side_left);
  pintarLado('right', data.side_right);
  msg.style.color = 'var(--success)';
  msg.textContent = '✓ Imagen guardada.';
  setTimeout(() => { msg.textContent = ''; }, 2000);
}

async function quitarLado(lado) {
  const msg = document.getElementById('sideMsg');
  const res = await fetch('/api/settings/side/' + lado, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) { msg.style.color = 'var(--accent)'; msg.textContent = data.error || 'No se pudo quitar.'; return; }
  pintarLado('left', data.side_left);
  pintarLado('right', data.side_right);
}

document.getElementById('sideUploadLeft').onclick = () => subirLado('left');
document.getElementById('sideUploadRight').onclick = () => subirLado('right');
document.getElementById('sideRemoveLeft').onclick = () => quitarLado('left');
document.getElementById('sideRemoveRight').onclick = () => quitarLado('right');
