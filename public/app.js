const VIEWS = ['view-landing','view-register-success','view-onboarding','view-login','view-register','view-fraud','view-contact','view-terms','view-privacy','view-ballot','view-done','view-admin-login','view-admin'];

function showView(id) {
  for (const v of VIEWS) document.getElementById(v)?.classList.add('hidden');
  document.getElementById(id)?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let currentVoter = null;
let candidatesByPosition = {};
let adminToken = sessionStorage.getItem('adminToken') || null;

// Sidebar — hamburger collapsible
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
function setSidebar(open) {
  if (!sidebar || !hamburger || !overlay) return;
  sidebar.classList.toggle('open', open);
  overlay.classList.toggle('hidden', !open);
  hamburger.setAttribute('aria-expanded', String(open));
  sidebar.setAttribute('aria-hidden', String(!open));
  overlay.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('sidebar-open', open);
}
function toggleSidebar() { setSidebar(!sidebar.classList.contains('open')); }
function closeSidebar() { setSidebar(false); }
hamburger?.addEventListener('click', toggleSidebar);
overlay?.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

// Sounds — Web Audio, toggle persisted
let soundOn = (localStorage.getItem('soundOn') ?? '1') === '1';
function setSoundUI() {
  const b = document.getElementById('sound-toggle');
  const l = document.getElementById('sound-label');
  if (b) b.textContent = soundOn ? '🔊' : '🔈';
  if (l) l.textContent = soundOn ? 'Sounds on' : 'Sounds off';
  b?.setAttribute('aria-pressed', String(soundOn));
}
setSoundUI();
document.getElementById('sound-toggle')?.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('soundOn', soundOn ? '1' : '0');
  setSoundUI();
  if (soundOn) play('tap');
});
let audioCtx = null;
function ensureAudio() {
  if (!soundOn) return null;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type='sine', gain=0.14, slideTo) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g); g.connect(ctx.destination);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  osc.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.stop(ctx.currentTime + dur);
}
function play(kind) {
  if (kind === 'tap') tone(520, 0.12, 'sine', 0.12);
  else if (kind === 'success') { tone(520, 0.14, 'sine', 0.13); setTimeout(()=>tone(660,0.18,'sine',0.13),110); setTimeout(()=>tone(780,0.22,'sine',0.11),230); }
  else if (kind === 'error') tone(180, 0.28, 'triangle', 0.16, 120);
  else if (kind === 'nav') tone(440, 0.09, 'sine', 0.10);
  else if (kind === 'submit') { tone(300, 0.10, 'square', 0.09); setTimeout(()=>tone(600,0.20,'sine',0.12),100); }
}

function navTo(view) { closeSidebar(); play('nav'); showView(view); }

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
  el.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => play('tap')));
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
    play('error');
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
    play('error');
    return;
  }
  const list = document.getElementById('registrations-list');
  const countEl = document.getElementById('reg-count');
  const regs = data.registrations || [];
  const pending = regs.filter(r => r.Status === 'pending').length;
  if (pending > 0) { countEl.textContent = String(pending); countEl.classList.remove('hidden'); } else countEl.classList.add('hidden');
  if (regs.length === 0) { list.innerHTML = `<p class="muted">No registrations yet.</p>`; return; }
  list.innerHTML = '';
  for (const r of regs) {
    const card = document.createElement('div');
    card.className = 'reg-card';
    card.innerHTML = `
      <div class="reg-meta">
        <strong>${r.Name} · ${r.AdmissionNumber}</strong>
        <span class="muted">${r.Class} · ${new Date(r.CreatedAt).toLocaleString()}</span>
        <span class="status ${r.Status}">${r.Status}</span>
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
      if (d.ok) { play('success'); msg.textContent = 'Approved — voter can now log in.'; await loadRegistrations(); await renderResults(); }
      else { play('error'); msg.textContent = d.error || 'Approve failed.'; btn.disabled = false; }
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
      if (d.ok) { play('tap'); msg.textContent = 'Rejected.'; await loadRegistrations(); }
      else { play('error'); msg.textContent = d.error || 'Reject failed.'; btn.disabled = false; }
    });
  });
}

async function loadFraud() {
  if (!adminToken) { showView('view-admin-login'); return; }
  const res = await fetch('/api/admin/fraud', { headers: { 'x-admin-token': adminToken } });
  const data = await res.json();
  if (res.status === 401 || !data.ok) {
    adminToken = null; sessionStorage.removeItem('adminToken'); showView('view-admin-login'); play('error'); return;
  }
  const list = document.getElementById('fraud-list');
  const badge = document.getElementById('fraud-count');
  const rows = data.reports || [];
  if (rows.length) badge.textContent = String(rows.length), badge.classList.remove('hidden'); else badge.classList.add('hidden');
  if (rows.length === 0) { list.innerHTML = `<p class="muted">No fraud reports.</p>`; return; }
  list.innerHTML = rows.map(r => `<div class="reg-card"><div class="reg-meta"><strong>${r.ReporterName}${r.AdmissionNumber ? ' · '+r.AdmissionNumber : ''}</strong><span class="muted">${r.Position || 'General'} · ${new Date(r.CreatedAt).toLocaleString()}</span><span class="muted" style="white-space:pre-wrap">${r.Details}</span></div></div>`).join('');
}

async function loadContacts() {
  if (!adminToken) { showView('view-admin-login'); return; }
  const res = await fetch('/api/admin/contacts', { headers: { 'x-admin-token': adminToken } });
  const data = await res.json();
  if (res.status === 401 || !data.ok) {
    adminToken = null; sessionStorage.removeItem('adminToken'); showView('view-admin-login'); play('error'); return;
  }
  const list = document.getElementById('contacts-list');
  const badge = document.getElementById('contact-count');
  const rows = data.messages || [];
  if (rows.length) badge.textContent = String(rows.length), badge.classList.remove('hidden'); else badge.classList.add('hidden');
  if (rows.length === 0) { list.innerHTML = `<p class="muted">No messages.</p>`; return; }
  list.innerHTML = rows.map(r => `<div class="reg-card"><div class="reg-meta"><strong>${r.Name} · ${r.Contact}</strong><span class="muted">${new Date(r.CreatedAt).toLocaleString()}</span><span class="muted" style="white-space:pre-wrap">${r.Message}</span></div></div>`).join('');
}

function showAdminTab(which) {
  const tabs = ['results','registrations','fraud','contacts','guide','settings'];
  for (const t of tabs) {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t===which);
    document.getElementById(`admin-panel-${t}`)?.classList.toggle('hidden', t!==which);
  }
  play('tap');
  if (which==='results') renderResults();
  else if (which==='registrations') loadRegistrations();
  else if (which==='fraud') loadFraud();
  else if (which==='contacts') loadContacts();
}

// Nav — close sidebar on every navigation
document.getElementById('nav-home')?.addEventListener('click', () => navTo('view-landing'));
document.getElementById('nav-guide')?.addEventListener('click', () => navTo('view-onboarding'));
document.getElementById('nav-register')?.addEventListener('click', () => navTo('view-register'));
document.getElementById('nav-login')?.addEventListener('click', () => navTo('view-login'));
document.getElementById('hero-register')?.addEventListener('click', () => navTo('view-register'));
document.getElementById('hero-login')?.addEventListener('click', () => navTo('view-login'));
document.getElementById('hero-guide')?.addEventListener('click', () => navTo('view-onboarding'));
document.getElementById('landing-cta-register')?.addEventListener('click', () => navTo('view-register'));
document.getElementById('landing-cta-login')?.addEventListener('click', () => navTo('view-login'));
document.getElementById('landing-cta-guide')?.addEventListener('click', () => navTo('view-onboarding'));
document.getElementById('landing-cta-fraud')?.addEventListener('click', () => navTo('view-fraud'));
document.getElementById('login-to-register')?.addEventListener('click', () => navTo('view-register'));
document.getElementById('login-to-guide')?.addEventListener('click', () => navTo('view-onboarding'));
document.getElementById('register-to-login')?.addEventListener('click', () => navTo('view-login'));
document.getElementById('register-to-home')?.addEventListener('click', () => navTo('view-landing'));
document.getElementById('success-to-login')?.addEventListener('click', () => navTo('view-login'));
document.getElementById('success-to-guide')?.addEventListener('click', () => navTo('view-onboarding'));
document.getElementById('success-to-home')?.addEventListener('click', () => navTo('view-landing'));
document.getElementById('btn-back-home')?.addEventListener('click', () => navTo('view-landing'));
document.querySelectorAll('[data-go]').forEach(el => {
  el.addEventListener('click', (e) => {
    if (el.tagName === 'A') e.preventDefault();
    const go = el.getAttribute('data-go');
    const map = { landing:'view-landing', register:'view-register', login:'view-login', guide:'view-onboarding', fraud:'view-fraud', contact:'view-contact', terms:'view-terms', privacy:'view-privacy' };
    if (map[go]) navTo(map[go]);
  });
});

// Admin nav
document.getElementById('btn-admin-nav')?.addEventListener('click', () => {
  closeSidebar(); play('nav');
  if (adminToken) { showView('view-admin'); showAdminTab('results'); }
  else showView('view-admin-login');
});
document.getElementById('footer-admin-link')?.addEventListener('click', (e) => {
  e.preventDefault(); closeSidebar(); play('nav');
  if (adminToken) { showView('view-admin'); showAdminTab('results'); }
  else showView('view-admin-login');
});
document.getElementById('btn-admin-back')?.addEventListener('click', () => navTo('view-landing'));
document.getElementById('tab-results')?.addEventListener('click', () => showAdminTab('results'));
document.getElementById('tab-registrations')?.addEventListener('click', () => showAdminTab('registrations'));
document.getElementById('tab-fraud')?.addEventListener('click', () => showAdminTab('fraud'));
document.getElementById('tab-contacts')?.addEventListener('click', () => showAdminTab('contacts'));
document.getElementById('tab-guide')?.addEventListener('click', () => showAdminTab('guide'));
document.getElementById('tab-settings')?.addEventListener('click', () => showAdminTab('settings'));
document.getElementById('btn-refresh')?.addEventListener('click', () => { play('tap'); renderResults(); });
document.getElementById('btn-reg-refresh')?.addEventListener('click', () => { play('tap'); loadRegistrations(); });
document.getElementById('btn-fraud-refresh')?.addEventListener('click', () => { play('tap'); loadFraud(); });
document.getElementById('btn-contacts-refresh')?.addEventListener('click', () => { play('tap'); loadContacts(); });
document.getElementById('btn-print-guide')?.addEventListener('click', () => { play('tap'); window.print(); });
document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
  play('tap');
  adminToken = null;
  sessionStorage.removeItem('adminToken');
  showView('view-landing');
});
document.getElementById('btn-reset')?.addEventListener('click', async () => {
  if (!confirm('Reset all votes and allow everyone to vote again?')) return;
  play('tap');
  const res = await fetch('/api/reset', { method: 'POST', headers: { 'x-admin-token': adminToken || '' } });
  const data = await res.json();
  if (res.status === 401) {
    play('error');
    alert(data.error || 'Unauthorized — please log in again.');
    adminToken = null;
    sessionStorage.removeItem('adminToken');
    showView('view-admin-login');
    return;
  }
  if (!data.ok) { play('error'); alert(data.error || 'Reset failed'); return; }
  play('success');
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
      play('error');
      return;
    }
    play('success');
    currentVoter = data.voter;
    document.getElementById('ballot-user').textContent = `${currentVoter.Name} · ${currentVoter.AdmissionNumber}`;
    renderBallot(data.candidates);
    showView('view-ballot');
  } catch {
    err.textContent = 'Network error — is the server running?';
    err.classList.remove('hidden');
    play('error');
  }
});

// Registration -> after-registration page
document.getElementById('form-register')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const adm = document.getElementById('reg-adm').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const klass = document.getElementById('reg-class').value.trim();
  const pin = document.getElementById('reg-pin').value;
  const pin2 = document.getElementById('reg-pin2').value;
  const err = document.getElementById('register-error');
  err.classList.add('hidden');
  if (pin !== pin2) {
    err.textContent = 'PINs do not match.';
    err.classList.remove('hidden');
    play('error');
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
      play('error');
      return;
    }
    play('success');
    const admUp = data.registration.AdmissionNumber;
    document.getElementById('register-success-detail').innerHTML = `Application for <strong>${admUp}</strong> received — now <strong>pending admin approval</strong>.`;
    e.target.reset();
    showView('view-register-success');
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
    play('error');
  }
});

// Fraud
document.getElementById('form-fraud')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('fraud-error');
  const ok = document.getElementById('fraud-ok');
  err.classList.add('hidden'); ok.classList.add('hidden');
  try {
    const res = await fetch('/api/fraud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporterName: document.getElementById('fraud-name').value,
        admissionNumber: document.getElementById('fraud-adm').value || undefined,
        position: document.getElementById('fraud-position').value || undefined,
        details: document.getElementById('fraud-details').value
      })
    });
    const data = await res.json();
    if (!data.ok) { err.textContent = data.error; err.classList.remove('hidden'); play('error'); return; }
    play('success');
    ok.textContent = 'Report submitted — the admin will review it confidentially. Thank you.';
    ok.classList.remove('hidden');
    e.target.reset();
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
    play('error');
  }
});

// Contact
document.getElementById('form-contact')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('contact-error');
  const ok = document.getElementById('contact-ok');
  err.classList.add('hidden'); ok.classList.add('hidden');
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('contact-name').value,
        contact: document.getElementById('contact-contact').value,
        message: document.getElementById('contact-message').value
      })
    });
    const data = await res.json();
    if (!data.ok) { err.textContent = data.error; err.classList.remove('hidden'); play('error'); return; }
    play('success');
    ok.textContent = 'Message sent — we will get back to you soon.';
    ok.classList.remove('hidden');
    e.target.reset();
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
    play('error');
  }
});

// Ballot submit -> success sound
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
      play('error');
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
      play('error');
      return;
    }
    play('submit');
    showView('view-done');
  } catch {
    err.textContent = 'Network error submitting vote.';
    err.classList.remove('hidden');
    play('error');
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
      play('error');
      return;
    }
    play('success');
    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    showView('view-admin');
    showAdminTab('results');
  } catch {
    err.textContent = 'Network error.';
    err.classList.remove('hidden');
    play('error');
  }
});

showView('view-landing');
setSoundUI();
