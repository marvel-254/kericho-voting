const views = ['view-landing','view-login','view-register','view-ballot','view-done','view-admin-login','view-admin'];

function showView(id) {
  for (const v of views) document.getElementById(v)?.classList.add('hidden');
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let currentVoter = null;
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
      row.innerHTML = `<span><strong>${c.name}</strong> · ${c.class}</span><span>${c.votes} votes · ${c.percent}%</span>`;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('span');
      fill.style.width = `${c.percent}%`;
      bar.appendChild(fill);
      sec.appendChild(row);
      sec.appendChild(bar);
    }
    const totalVotes = data.byPosition[pos].reduce((s, x) => s + x.votes, 0);
    const sumPct = data.byPosition[pos].reduce((s, x) => s + x.percent, 0);
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `Total votes: ${totalVotes}${totalVotes > 0 ? ` · summed %: ${sumPct}%` : ''}`;
    sec.appendChild(meta);
    container.appendChild(sec);
  }
}

async function loadRegistrations() {
  if (!adminToken) { showView('view-admin-login'); return; }
  const res = await fetch('/api/admin/registrations', { headers: { 'x-admin-token': adminToken } });
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
  const list = document.getElementById('registrations-list');
  const countEl = document.getElementById('reg-count');
  const regs = data.registrations || [];
  const pending = regs.filter(r => r.Status === 'pending').length;
  if (pending > 0) {
    countEl.textContent = String(pending);
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
  if (regs.length === 0) {
    list.innerHTML = `<p class="muted">No registrations yet.</p>`;
    return;
  }
  list.innerHTML = '';
  for (const r of regs) {
    const card = document.createElement('div');
    card.className = 'reg-card';
    const statusClass = r.Status;
    card.innerHTML = `
      <div class="reg-meta">
        <strong>${r.Name} · ${r.AdmissionNumber}</strong>
        <span class="muted">${r.Class} · ${new Date(r.CreatedAt).toLocaleString()}</span>
        <span class="status ${statusClass}">${r.Status}</span>
      </div>
      <div class="reg-actions">
        ${r.Status === 'pending' ? `<button class="btn primary sm" data-approve="${r.id}">Approve</button><button class="btn danger sm" data-reject="${r.id}">Reject</button>` : `<span class="muted small">Reviewed: ${r.ReviewedAt ? new Date(r.ReviewedAt).toLocaleString() : '—'}</span>`}
      </div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-approve');
      btn.disabled = true;
      const res = await fetch(`/api/admin/registrations/${id}/approve`, { method: 'POST', headers: { 'x-admin-token': adminToken } });
      const d = await res.json();
      const msg = document.getElementById('registrations-msg');
      if (d.ok) { msg.textContent = 'Approved — voter can now log in.'; await loadRegistrations(); await renderResults(); }
      else { msg.textContent = d.error || 'Approve failed.'; btn.disabled = false; }
    });
  });
  list.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-reject');
      if (!confirm('Reject this registration? The applicant can re-apply.')) return;
      btn.disabled = true;
      const res = await fetch(`/api/admin/registrations/${id}/reject`, { method: 'POST', headers: { 'x-admin-token': adminToken } });
      const d = await res.json();
      const msg = document.getElementById('registrations-msg');
      if (d.ok) { msg.textContent = 'Rejected.'; await loadRegistrations(); }
      else { msg.textContent = d.error || 'Reject failed.'; btn.disabled = false; }
    });
  });
}

function showAdminTab(which) {
  const btnResults = document.getElementById('tab-results');
  const btnRegs = document.getElementById('tab-registrations');
  const panelResults = document.getElementById('admin-panel-results');
  const panelRegs = document.getElementById('admin-panel-registrations');
  if (which === 'registrations') {
    btnResults.classList.remove('active'); btnRegs.classList.add('active');
    panelResults.classList.add('hidden'); panelRegs.classList.remove('hidden');
    loadRegistrations();
  } else {
    btnRegs.classList.remove('active'); btnResults.classList.add('active');
    panelRegs.classList.add('hidden'); panelResults.classList.remove('hidden');
    renderResults();
  }
}

// Navigation
document.getElementById('nav-home')?.addEventListener('click', () => showView('view-landing'));
document.getElementById('nav-register')?.addEventListener('click', () => showView('view-register'));
document.getElementById('nav-login')?.addEventListener('click', () => showView('view-login'));
document.getElementById('hero-register')?.addEventListener('click', () => showView('view-register'));
document.getElementById('hero-login')?.addEventListener('click', () => showView('view-login'));
document.getElementById('landing-cta-register')?.addEventListener('click', () => showView('view-register'));
document.getElementById('landing-cta-login')?.addEventListener('click', () => showView('view-login'));
document.getElementById('login-to-register')?.addEventListener('click', () => showView('view-register'));
document.getElementById('register-to-login')?.addEventListener('click', () => showView('view-login'));
document.getElementById('register-to-home')?.addEventListener('click', () => showView('view-landing'));
document.getElementById('btn-back-home')?.addEventListener('click', () => showView('view-landing'));

document.getElementById('btn-admin-nav')?.addEventListener('click', () => {
  if (adminToken) { showView('view-admin'); showAdminTab('results'); }
  else showView('view-admin-login');
});
document.getElementById('footer-admin-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (adminToken) { showView('view-admin'); showAdminTab('results'); }
  else showView('view-admin-login');
});
document.getElementById('btn-admin-back')?.addEventListener('click', () => showView('view-landing'));
document.getElementById('tab-results')?.addEventListener('click', () => showAdminTab('results'));
document.getElementById('tab-registrations')?.addEventListener('click', () => showAdminTab('registrations'));
document.getElementById('btn-refresh')?.addEventListener('click', renderResults);
document.getElementById('btn-reg-refresh')?.addEventListener('click', loadRegistrations);
document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
  adminToken = null;
  sessionStorage.removeItem('adminToken');
  showView('view-landing');
});
document.getElementById('btn-reset')?.addEventListener('click', async () => {
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

// Pupil login
document.getElementById('form-login')?.addEventListener('submit', async (e) => {
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

// Registration
document.getElementById('form-register')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const adm = document.getElementById('reg-adm').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const klass = document.getElementById('reg-class').value.trim();
  const pin = document.getElementById('reg-pin').value;
  const pin2 = document.getElementById('reg-pin2').value;
  const err = document.getElementById('register-error');
  const ok = document.getElementById('register-ok');
  err.classList.add('hidden'); ok.classList.add('hidden');
  if (pin !== pin2) {
    err.textContent = 'PINs do not match.';
    err.classList.remove('hidden');
    return;
  }
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admissionNumber: adm, name, class: klass, pin })
    });
    const data = await res.json();
    if (!data.ok) {
      err.textContent = data.error;
      err.classList.remove('hidden');
      return;
    }
    ok.textContent = `Application submitted for ${data.registration.AdmissionNumber} — awaiting admin approval. Try logging in after approval.`;
    ok.classList.remove('hidden');
    e.target.reset();
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
  }
});

// Ballot submit
document.getElementById('form-ballot')?.addEventListener('submit', async (e) => {
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

// Admin login
document.getElementById('form-admin-login')?.addEventListener('submit', async (e) => {
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
    showView('view-admin');
    showAdminTab('results');
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
  }
});

// Default view
showView('view-landing');
