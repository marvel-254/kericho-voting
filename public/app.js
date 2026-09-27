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


// Confetti — canvas burst on success
function fireConfetti() {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * (window.devicePixelRatio || 1);
  canvas.height = H * (window.devicePixelRatio || 1);
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  const colors = ['#1b7a2b','#2a9a3a','#c9a227','#e8c24a','#0f2f12','#fff'];
  const pieces = [];
  const count = 90;
  for (let i=0;i<count;i++) {
    pieces.push({
      x: Math.random()*W,
      y: -20 - Math.random()*40,
      r: 6 + Math.random()*6,
      col: colors[Math.floor(Math.random()*colors.length)],
      vx: (Math.random()-0.5)*6,
      vy: 2 + Math.random()*5,
      rot: Math.random()*360,
      vr: (Math.random()-0.5)*12,
      shape: Math.random() < 0.33 ? 'rect' : Math.random() < 0.66 ? 'circle' : 'tri'
    });
  }
  let t=0;
  const maxT = 210; // frames
  function frame() {
    ctx.clearRect(0,0,W,H);
    let alive=false;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.14; p.vx *= 0.999;
      if (p.y < H + 20) alive=true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.col;
      ctx.strokeStyle = '#142014';
      ctx.lineWidth = 1;
      if (p.shape==='rect') { ctx.fillRect(-p.r/2,-p.r/3,p.r,p.r*0.62); ctx.strokeRect(-p.r/2,-p.r/3,p.r,p.r*0.62); }
      else if (p.shape==='circle') { ctx.beginPath(); ctx.arc(0,0,p.r/2,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(0,-p.r/2); ctx.lineTo(-p.r/2,p.r/2); ctx.lineTo(p.r/2,p.r/2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    if (alive && t < maxT) { t++; requestAnimationFrame(frame); }
    else { ctx.clearRect(0,0,W,H); }
  }
  requestAnimationFrame(frame);
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


async function loadPositions() {
  // admin needs token
  if (!adminToken) { showView('view-admin-login'); return; }
  const res = await fetch('/api/positions');
  const data = await res.json();
  // public list doesn't need token, but we also need to refresh message
  const list = document.getElementById('positions-list');
  const msg = document.getElementById('positions-msg');
  if (!data.ok) { if (msg) msg.textContent = data.error || 'Failed to load positions'; return; }
  const positions = data.positions || [];
  // Also fetch admin token check for delete buttons
  if (!adminToken) return;
  if (positions.length === 0) { list.innerHTML = '<p class="muted">No positions yet.</p>'; return; }
  list.innerHTML = positions.map(p => `
    <div class="reg-card">
      <div class="reg-meta"><strong>${p.name}</strong><span class="muted small">ID ${p.id}</span></div>
      <div class="reg-actions"><button class="btn danger sm" data-del-pos="${p.id}" data-name="${p.name}">Remove</button></div>
    </div>`).join('');
  list.querySelectorAll('[data-del-pos]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-pos');
      const name = btn.getAttribute('data-name');
      if (!confirm(`Remove position "${name}"? This deletes its candidates and votes and cannot be undone.`)) return;
      btn.disabled = true;
      const res = await fetch(`/api/admin/positions/${id}`, { method:'DELETE', headers:{'x-admin-token': adminToken }});
      const d = await res.json();
      if (d.ok) { play('tap'); msg.textContent = `Removed "${name}".`; await loadPositions(); await renderResults(); }
      else { play('error'); msg.textContent = d.error || 'Remove failed'; btn.disabled=false; }
    });
  });
}

function showAdminTab(which) {
  const tabs = ['results','registrations','positions','fraud','contacts','guide','settings'];
  for (const t of tabs) {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t===which);
    document.getElementById(`admin-panel-${t}`)?.classList.toggle('hidden', t!==which);
  }
  play('tap');
  if (which==='results') renderResults();
  else if (which==='registrations') loadRegistrations();
  else if (which==='fraud') loadFraud();
  else if (which==='contacts') loadContacts();
  else if (which==='positions') loadPositions();
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
document.getElementById('btn-share')?.addEventListener('click', async () => {
  const text = document.getElementById('reward-message')?.textContent || 'I just voted at Kericho Primary — your vote, your voice!';
  const url = 'https://kericho-voting.onrender.com/';
  if (navigator.share) { try { await navigator.share({ title:'Kericho Primary — I Voted!', text, url }); play('tap'); } catch {} }
  else if (navigator.clipboard) { await navigator.clipboard.writeText(text + ' ' + url); alert('Copied — share it with friends!'); play('tap'); }
  else { alert(text); }
});
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
document.getElementById('tab-positions')?.addEventListener('click', () => showAdminTab('positions'));
document.getElementById('btn-refresh')?.addEventListener('click', () => { play('tap'); renderResults(); });
document.getElementById('btn-reg-refresh')?.addEventListener('click', () => { play('tap'); loadRegistrations(); });
document.getElementById('btn-fraud-refresh')?.addEventListener('click', () => { play('tap'); loadFraud(); });
document.getElementById('btn-contacts-refresh')?.addEventListener('click', () => { play('tap'); loadContacts(); });
document.getElementById('btn-print-guide')?.addEventListener('click', () => { play('tap'); window.print(); });
document.getElementById('form-add-position')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-position-name');
  const msg = document.getElementById('positions-msg');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch('/api/admin/positions', { method:'POST', headers:{'Content-Type':'application/json','x-admin-token': adminToken}, body: JSON.stringify({name}) });
  const d = await res.json();
  if (d.ok) { play('success'); input.value=''; msg.textContent = 'Added — now add candidates under that position via server seed or contact admin.'; await loadPositions(); await renderResults(); }
  else { play('error'); msg.textContent = d.error || 'Add failed'; }
});
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
    // personalized reward from server
    const reward = data.reward;
    if (reward) {
      const badge = document.getElementById('reward-badge');
      const title = document.getElementById('reward-title');
      const msg = document.getElementById('reward-message');
      const tag = document.getElementById('reward-tagline');
      if (badge) badge.textContent = `${reward.badge} ${reward.title} \u00b7 ${reward.points} pts`;
      if (title) {
        const first = (reward.voterName||'').split(/\s+/)[0] || '';
        title.textContent = first ? `Hongera, ${first}! ${reward.badge}` : reward.title;
      }
      if (msg) msg.textContent = reward.message;
      if (tag) tag.textContent = reward.tagline ? `— ${reward.tagline}` : '';
    }
    play('submit');
    showView('view-done');
    // confetti + haptics
    setTimeout(fireConfetti, 60);
    if (navigator.vibrate) navigator.vibrate([30,40,30]);
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

// PWA — install prompt + service worker
let deferredPrompt = null;
const installBanner = document.getElementById('install-banner');
const installAccept = document.getElementById('install-accept');
const installDismiss = document.getElementById('install-dismiss');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // don't show if already installed or dismissed recently
  const dismissed = localStorage.getItem('installDismissedAt');
  if (dismissed && Date.now() - Number(dismissed) < 1000*60*60*24*3) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  installBanner?.classList.remove('hidden');
});
installAccept?.addEventListener('click', async () => {
  if (!deferredPrompt) { installBanner?.classList.add('hidden'); return; }
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') play('success');
  deferredPrompt = null;
  installBanner?.classList.add('hidden');
});
installDismiss?.addEventListener('click', () => {
  installBanner?.classList.add('hidden');
  localStorage.setItem('installDismissedAt', String(Date.now()));
  play('tap');
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installBanner?.classList.add('hidden');
  play('success');
});

// Register SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}

