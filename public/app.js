const $ = (s) => document.querySelector(s);
const views = ['view-login','view-ballot','view-done','view-admin-login','view-admin'];

function showView(id) {
  for (const v of views) document.getElementById(v).classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
}

let currentVoter = null; // { AdmissionNumber, Name, Class }
let candidatesByPosition = {};
let adminToken = sessionStorage.getItem('adminToken') || null;

function groupCandidates(candidates) {
  const map = {};
  for (const c of candidates) {
    if (!map[c.Position]) map[c.Position] = [];
    map[c.Position].push(c);
  }
  return map;
}

function renderBallot(candidates) {
  candidatesByPosition = groupCandidates(candidates);
  const el = document.getElementById('ballot-positions');
  el.innerHTML = '';
  for (const pos of Object.keys(candidatesByPosition)) {
    const box = document.createElement('div');
    box.className = 'position';
    const h = document.createElement('h3');
    h.textContent = pos;
    box.appendChild(h);
    for (const c of candidatesByPosition[pos]) {
      const label = document.createElement('label');
      label.className = 'candidate';
      label.innerHTML = `<input type="radio" name="${pos}" value="${c.CandidateID}" required /> <span><strong>${c.Name}</strong> · ${c.Class}</span>`;
      box.appendChild(label);
    }
    el.appendChild(box);
  }
}

async function renderResults() {
  if (!adminToken) { showView('view-admin-login'); return; }
  const res = await fetch('/api/results', { headers: { 'x-admin-token': adminToken } });
  const data = await res.json();
  if (res.status === 401 || !data.ok) {
    adminToken = null;
    sessionStorage.removeItem('adminToken');
    showView('view-admin-login');
    const err = document.getElementById('admin-error');
    err.textContent = data.error || 'Session expired — please log in again.';
    err.classList.remove('hidden');
    return;
  }
  document.getElementById('kpi-turnout').textContent = `${data.turnout}%`;
  document.getElementById('kpi-voted').textContent = `${data.votedCount}`;
  document.getElementById('kpi-total').textContent = `${data.totalVoters}`;
  const container = document.getElementById('results');
  container.innerHTML = '';
  for (const pos of Object.keys(data.byPosition)) {
    const sec = document.createElement('div');
    sec.className = 'position';
    const h = document.createElement('h3');
    h.textContent = pos;
    sec.appendChild(h);
    for (const c of data.byPosition[pos]) {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `
        <span><strong>${c.name}</strong> · ${c.class}</span>
        <span>${c.votes} votes · ${c.percent}%</span>
      `;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('span');
      fill.style.width = `${c.percent}%`;
      bar.appendChild(fill);
      sec.appendChild(row);
      sec.appendChild(bar);
    }
    // sum check
    const totalVotes = data.byPosition[pos].reduce((s, x) => s + x.votes, 0);
    const sumPct = data.byPosition[pos].reduce((s, x) => s + x.percent, 0);
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `Total votes: ${totalVotes}${totalVotes > 0 ? ` · summed %: ${sumPct}%` : ''}`;
    sec.appendChild(meta);
    container.appendChild(sec);
  }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const adm = document.getElementById('login-adm').value.trim().toUpperCase();
  const pin = document.getElementById('login-pin').value;
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admissionNumber: adm, pin })
    });
    const data = await res.json();
    if (!data.ok) {
      err.textContent = data.error;
      err.classList.remove('hidden');
      return;
    }
    currentVoter = data.voter;
    document.getElementById('ballot-user').textContent = `${currentVoter.Name} · ${currentVoter.AdmissionNumber}`;
    renderBallot(data.candidates);
    showView('view-ballot');
  } catch {
    err.textContent = 'Network error — is the server running?';
    err.classList.remove('hidden');
  }
});

document.getElementById('form-ballot').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('ballot-error');
  err.classList.add('hidden');
  const selections = {};
  for (const pos of Object.keys(candidatesByPosition)) {
    const checked = document.querySelector(`input[name="${CSS.escape(pos)}"]:checked`);
    if (!checked) {
      err.textContent = `Please choose one candidate for: ${pos}`;
      err.classList.remove('hidden');
      return;
    }
    selections[pos] = Number(checked.value);
  }
  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admissionNumber: currentVoter.AdmissionNumber, selections })
    });
    const data = await res.json();
    if (!data.ok) {
      err.textContent = data.error;
      err.classList.remove('hidden');
      return;
    }
    showView('view-done');
  } catch {
    err.textContent = 'Network error submitting vote.';
    err.classList.remove('hidden');
  }
});

document.getElementById('btn-back-home').addEventListener('click', () => {
  currentVoter = null;
  document.getElementById('form-login').reset();
  showView('view-login');
});

document.getElementById('btn-admin-nav').addEventListener('click', () => {
  if (adminToken) { showView('view-admin'); renderResults(); }
  else showView('view-admin-login');
});
document.getElementById('footer-admin-link').addEventListener('click', (e) => {
  e.preventDefault();
  if (adminToken) { showView('view-admin'); renderResults(); }
  else showView('view-admin-login');
});
document.getElementById('btn-admin-back').addEventListener('click', () => showView('view-login'));

document.getElementById('form-admin-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-user').value.trim();
  const password = document.getElementById('admin-pass').value;
  const err = document.getElementById('admin-error');
  err.classList.add('hidden');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.ok) {
      err.textContent = data.error;
      err.classList.remove('hidden');
      return;
    }
    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    await renderResults();
    showView('view-admin');
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
  }
});

document.getElementById('btn-refresh').addEventListener('click', renderResults);
document.getElementById('btn-admin-logout').addEventListener('click', () => {
  adminToken = null;
  sessionStorage.removeItem('adminToken');
  showView('view-login');
});
document.getElementById('btn-reset').addEventListener('click', async () => {
  if (!confirm('Reset all votes and allow everyone to vote again?')) return;
  const res = await fetch('/api/reset', { method: 'POST', headers: { 'x-admin-token': adminToken || '' } });
  const data = await res.json();
  if (res.status === 401) {
    alert(data.error || 'Unauthorized — please log in again.');
    adminToken = null;
    sessionStorage.removeItem('adminToken');
    showView('view-admin-login');
    return;
  }
  if (!data.ok) { alert(data.error || 'Reset failed'); return; }
  document.getElementById('admin-msg').textContent = 'Election reset — all votes cleared.';
  await renderResults();
});

// auto-open dashboard if already has token
if (adminToken) {
  // leave on login view; render lazily when they click Admin
}
