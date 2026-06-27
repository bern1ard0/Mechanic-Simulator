// Mechanic Simulator — frontend. Plain JS, no build step.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (url, opts) => {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let vehicles = [];
let currentBucket = 'owned';
let editingId = null;

// ---------- tab navigation ----------
$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.remove('active'));
    $$('.view').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $(`#view-${t.dataset.view}`).classList.add('active');
    if (t.dataset.view === 'settings') loadSettings();
    if (t.dataset.view === 'visual') loadPresets();
  })
);

$$('.subtab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.subtab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    currentBucket = t.dataset.bucket;
    renderGarage();
  })
);

// ---------- garage ----------
async function loadVehicles() {
  vehicles = await api('/api/vehicles');
  renderGarage();
  fillCarSelects();
}

function carName(v) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Unnamed car';
}

function renderGarage() {
  const list = $('#garageList');
  const inBucket = vehicles.filter((v) => (v.status || 'owned') === currentBucket);
  if (!inBucket.length) {
    list.innerHTML = `<div class="empty">No cars here yet. Click "+ Add a car" to start.</div>`;
    return;
  }

  let html = '';
  if (currentBucket === 'owned') {
    // group by owner
    const byOwner = {};
    inBucket.forEach((v) => {
      const o = v.owner || 'Me';
      (byOwner[o] ||= []).push(v);
    });
    for (const owner of Object.keys(byOwner).sort((a) => (a === 'Me' ? -1 : 1))) {
      html += `<div class="owner-group">${esc(owner)}'s cars</div>`;
      html += byOwner[owner].map(card).join('');
    }
  } else {
    html = inBucket.map(card).join('');
  }
  list.innerHTML = html;

  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openDialog(b.dataset.edit)));
  $$('[data-del]').forEach((b) => b.addEventListener('click', () => removeCar(b.dataset.del)));
  $$('[data-explore]').forEach((b) =>
    b.addEventListener('click', () => {
      $('.tab[data-view="visual"]').click();
      $('#visCar').value = b.dataset.explore;
    })
  );
  $$('[data-fix]').forEach((b) =>
    b.addEventListener('click', () => {
      $('.tab[data-view="diagnose"]').click();
      $('#diagCar').value = b.dataset.fix;
    })
  );
}

function card(v) {
  const photo = v.photo
    ? `<div class="car-photo" style="background-image:url('${esc(v.photo)}')"></div>`
    : `<div class="car-photo">🚗</div>`;
  const buy = (v.status === 'prospective');
  const meta = [v.mileage && `${esc(v.mileage)} mi`, v.color && esc(v.color)].filter(Boolean).join(' · ');
  return `
    <div class="car-card">
      ${photo}
      <div class="car-body">
        <div class="row between">
          <span class="car-title">${esc(carName(v))}</span>
          <span class="chip ${buy ? 'buy' : ''}">${buy ? 'Considering' : esc(v.owner || 'Me')}</span>
        </div>
        <div class="car-meta">${meta || '&nbsp;'}</div>
        <div class="car-actions">
          ${buy
            ? `<button class="btn" data-explore="${v.id}">Explore</button>`
            : `<button class="btn" data-fix="${v.id}">Diagnose</button>
               <button class="btn" data-explore="${v.id}">Visualize</button>`}
          <button class="btn ghost" data-edit="${v.id}">Edit</button>
          <button class="btn ghost" data-del="${v.id}">✕</button>
        </div>
      </div>
    </div>`;
}

async function removeCar(id) {
  if (!confirm('Remove this car?')) return;
  await api(`/api/vehicles/${id}`, { method: 'DELETE' });
  loadVehicles();
}

// ---------- add/edit dialog ----------
const dialog = $('#carDialog');
$('#addCarBtn').addEventListener('click', () => openDialog(null));
$('#cancelCarBtn').addEventListener('click', () => dialog.close());

function openDialog(id) {
  editingId = id;
  const v = id ? vehicles.find((x) => x.id === id) : {};
  $('#carDialogTitle').textContent = id ? 'Edit car' : 'Add a car';
  $('#f_status').value = v.status || currentBucket;
  $('#f_owner').value = v.owner || 'Me';
  ['year', 'make', 'model', 'trim', 'vin', 'mileage', 'color', 'notes'].forEach((f) => {
    $(`#f_${f}`).value = v[f] || '';
  });
  $('#f_photo').value = '';
  dialog.showModal();
}

$('#carForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    status: $('#f_status').value,
    owner: $('#f_owner').value.trim() || 'Me',
  };
  ['year', 'make', 'model', 'trim', 'vin', 'mileage', 'color', 'notes'].forEach((f) => {
    body[f] = $(`#f_${f}`).value.trim();
  });
  const file = $('#f_photo').files[0];
  if (file) body.photo = await fileToDataUrl(file);

  if (editingId) await api(`/api/vehicles/${editingId}`, { method: 'PUT', headers: json(), body: JSON.stringify(body) });
  else await api('/api/vehicles', { method: 'POST', headers: json(), body: JSON.stringify(body) });
  dialog.close();
  loadVehicles();
});

const json = () => ({ 'content-type': 'application/json' });
const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// ---------- car dropdowns ----------
function fillCarSelects() {
  const opts = vehicles.map((v) => `<option value="${v.id}">${esc(carName(v))} (${esc(v.owner || (v.status === 'prospective' ? 'considering' : 'Me'))})</option>`).join('');
  $('#diagCar').innerHTML = opts || '<option value="">Add a car first</option>';
  $('#visCar').innerHTML = opts || '<option value="">Add a car first</option>';
}

// ---------- diagnose ----------
$('#diagBtn').addEventListener('click', async () => {
  const vehicleId = $('#diagCar').value;
  const symptom = $('#diagSymptom').value.trim();
  if (!symptom) return alert('Describe the problem first.');
  const out = $('#diagResult');
  out.innerHTML = `<div class="banner">Thinking through it…</div>`;
  try {
    const r = await api('/api/diagnose', { method: 'POST', headers: json(), body: JSON.stringify({ vehicleId, symptom }) });
    out.innerHTML = renderDiagnosis(r);
  } catch (err) {
    out.innerHTML = `<div class="banner warn">${esc(err.message)}</div>`;
  }
});

function renderDiagnosis(r) {
  let h = `<div class="result"><h3>${esc(r.car || 'Your car')} — ${esc(r.symptom)}</h3>`;
  if (!r.aiUsed) h += `<div class="banner warn">${esc(r.note)}</div>`;
  if (r.likelyCauses?.length) {
    h += `<h4>Most likely</h4>`;
    h += r.likelyCauses.map((c) =>
      `<div class="cause sev-${esc(c.severity || 'low')}"><strong>${esc(c.cause)}</strong> <span class="chip">${esc(c.severity || '')}</span><br><span class="muted">${esc(c.why || '')}</span></div>`
    ).join('');
  }
  if (r.followUps?.length) h += `<h4>To narrow it down</h4><ul class="tight">${r.followUps.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
  if (r.parts?.length) h += `<h4>Parts</h4><ul class="tight">${r.parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
  if (r.tools?.length) h += `<h4>Tools</h4><ul class="tight">${r.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (r.steps?.length) h += `<h4>Repair steps</h4><ul class="tight">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
  if (r.safety) h += `<div class="banner warn">⚠ ${esc(r.safety)}</div>`;
  h += `<div class="linkbox">
      <a href="${esc(r.video.url)}" target="_blank" rel="noopener">▶ ${esc(r.video.title)}</a>
      <a href="${esc(r.manual.url)}" target="_blank" rel="noopener">📖 ${esc(r.manual.title)}</a>
    </div>`;
  if (r.aiUsed && r.note) h += `<p class="tip">${esc(r.note)}</p>`;
  h += `</div>`;
  return h;
}

// ---------- visual studio ----------
let presetData = null;
let chosenPresets = new Set();

async function loadPresets() {
  if (presetData) return;
  presetData = await api('/api/visualize/presets');
  const box = $('#visPresets');
  box.innerHTML = '';
  for (const [group, items] of Object.entries(presetData)) {
    const label = document.createElement('div');
    label.className = 'preset-group-label';
    label.textContent = group;
    box.appendChild(label);
    items.forEach((it) => {
      const el = document.createElement('span');
      el.className = 'preset';
      el.textContent = it;
      el.addEventListener('click', () => {
        el.classList.toggle('on');
        if (el.classList.contains('on')) chosenPresets.add(it);
        else chosenPresets.delete(it);
      });
      box.appendChild(el);
    });
  }
}

$('#visBtn').addEventListener('click', async () => {
  const vehicleId = $('#visCar').value;
  const freeText = $('#visFree').value.trim();
  const out = $('#visResult');
  out.innerHTML = `<div class="banner">Building the edit…</div>`;
  try {
    const r = await api('/api/visualize', { method: 'POST', headers: json(), body: JSON.stringify({ vehicleId, presets: [...chosenPresets], freeText }) });
    out.innerHTML = `<div class="result">
      <h4>Realism-checked ✓</h4>
      <div class="banner">${esc(r.note)}</div>
      <h4>Prompt that will be sent</h4>
      <p class="muted">${esc(r.prompt)}</p>
    </div>`;
  } catch (err) {
    out.innerHTML = `<div class="banner warn">${esc(err.message)}</div>`;
  }
});

// ---------- settings ----------
async function loadSettings() {
  const s = await api('/api/settings');
  setStatus('statAnthropic', s.ANTHROPIC_API_KEY);
  setStatus('statYoutube', s.YOUTUBE_API_KEY);
  setStatus('statHiggsfield', s.HIGGSFIELD_API_KEY);
}
function setStatus(id, on) {
  const el = $(`#${id}`);
  el.textContent = on ? '✓ set' : 'not set';
  el.className = `status ${on ? 'set' : 'unset'}`;
}

$('#saveSettingsBtn').addEventListener('click', async () => {
  const body = {};
  const map = { setAnthropic: 'ANTHROPIC_API_KEY', setYoutube: 'YOUTUBE_API_KEY', setHiggsfield: 'HIGGSFIELD_API_KEY' };
  for (const [inputId, key] of Object.entries(map)) {
    const val = $(`#${inputId}`).value;
    if (val === '') continue; // leave untouched
    body[key] = val.trim() === '' ? '' : val.trim(); // a space clears it
    $(`#${inputId}`).value = '';
  }
  await api('/api/settings', { method: 'POST', headers: json(), body: JSON.stringify(body) });
  $('#settingsSaved').textContent = 'Saved ✓';
  setTimeout(() => ($('#settingsSaved').textContent = ''), 2000);
  loadSettings();
});

// ---------- boot ----------
loadVehicles();
