import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || 'voting.db';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || createHash('sha256').update('admin123').digest('hex');
let adminToken = null;
function issueAdminToken() {
  adminToken = createHash('sha256').update(`${Date.now()}-${Math.random()}-${ADMIN_PASSWORD_HASH}`).digest('hex');
  return adminToken;
}
function isAdminAuthorized(req) {
  const token = req.headers['x-admin-token'];
  return Boolean(token && adminToken && token === adminToken);
}

const db = new DatabaseSync(DB_PATH);

const DEFAULT_POSITIONS = [
  'School Captain (Head Boy)',
  'School Captain (Head Girl)',
  'Assistant Head Boy',
  'Assistant Head Girl',
  'Games Captain',
];

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voters (
      AdmissionNumber TEXT PRIMARY KEY,
      PINHash TEXT NOT NULL,
      Name TEXT NOT NULL,
      Class TEXT NOT NULL,
      HasVoted INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS candidates (
      CandidateID INTEGER PRIMARY KEY AUTOINCREMENT,
      Position TEXT NOT NULL,
      Name TEXT NOT NULL,
      Class TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS votes (
      CandidateID INTEGER PRIMARY KEY,
      VoteCount INTEGER DEFAULT 0,
      FOREIGN KEY (CandidateID) REFERENCES candidates(CandidateID)
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS voter_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      AdmissionNumber TEXT NOT NULL UNIQUE,
      Name TEXT NOT NULL,
      Class TEXT NOT NULL,
      PINHash TEXT NOT NULL,
      Status TEXT NOT NULL DEFAULT 'pending',
      CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      ReviewedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS fraud_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ReporterName TEXT NOT NULL,
      AdmissionNumber TEXT,
      Position TEXT,
      Details TEXT NOT NULL,
      CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Contact TEXT NOT NULL,
      Message TEXT NOT NULL,
      CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_candidates_position ON candidates(Position);
    CREATE INDEX IF NOT EXISTS idx_voters_class ON voters(Class);
    CREATE INDEX IF NOT EXISTS idx_registrations_status ON voter_registrations(Status);
  `);
}

function seedPositionsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM positions').get().c;
  if (count > 0) return;
  const existing = db.prepare('SELECT DISTINCT Position as name FROM candidates').all().map(r => r.name).filter(Boolean);
  const source = existing.length ? existing : DEFAULT_POSITIONS;
  const ins = db.prepare('INSERT OR IGNORE INTO positions (name) VALUES (?)');
  for (const n of source) ins.run(n);
  // if still empty (fresh DB with no candidates yet), seed defaults
  const after = db.prepare('SELECT COUNT(*) as c FROM positions').get().c;
  if (after === 0) {
    for (const n of DEFAULT_POSITIONS) ins.run(n);
  }
}

function seedIfEmpty() {
  const voterCount = db.prepare('SELECT COUNT(*) as c FROM voters').get().c;
  if (voterCount > 0) return;

  const voters = [
    { adm: 'KP001', pin: '1234', name: 'Brian Kiplangat', class: 'Grade 6' },
    { adm: 'KP002', pin: '1234', name: 'Dennis Cheruiyot', class: 'Grade 6' },
    { adm: 'KP003', pin: '1234', name: 'Faith Chepngeno', class: 'Grade 6' },
    { adm: 'KP004', pin: '1234', name: 'Geoffrey Kipyegon', class: 'Grade 5' },
    { adm: 'KP005', pin: '1234', name: 'Hellen Cherotich', class: 'Grade 5' },
    { adm: 'KP006', pin: '1234', name: 'Isaac Kiprotich', class: 'Grade 5' },
    { adm: 'KP007', pin: '1234', name: 'Joyce Chebet', class: 'Grade 4' },
    { adm: 'KP008', pin: '1234', name: 'Kevin Kipkorir', class: 'Grade 4' },
    { adm: 'KP009', pin: '1234', name: 'Lydia Chepkorir', class: 'Grade 4' },
    { adm: 'KP010', pin: '1234', name: 'Michael Kipkemboi', class: 'Grade 4' },
  ];

  const candidates = [
    { pos: 'School Captain (Head Boy)', name: 'Brian Kiplangat', class: 'Grade 6' },
    { pos: 'School Captain (Head Boy)', name: 'Dennis Cheruiyot', class: 'Grade 6' },
    { pos: 'School Captain (Head Girl)', name: 'Faith Chepngeno', class: 'Grade 6' },
    { pos: 'School Captain (Head Girl)', name: 'Hellen Cherotich', class: 'Grade 5' },
    { pos: 'Assistant Head Boy', name: 'Geoffrey Kipyegon', class: 'Grade 5' },
    { pos: 'Assistant Head Boy', name: 'Isaac Kiprotich', class: 'Grade 5' },
    { pos: 'Assistant Head Girl', name: 'Joyce Chebet', class: 'Grade 4' },
    { pos: 'Assistant Head Girl', name: 'Lydia Chepkorir', class: 'Grade 4' },
    { pos: 'Games Captain', name: 'Kevin Kipkorir', class: 'Grade 4' },
    { pos: 'Games Captain', name: 'Michael Kipkemboi', class: 'Grade 4' },
  ];

  const insertVoter = db.prepare('INSERT INTO voters (AdmissionNumber, PINHash, Name, Class, HasVoted) VALUES (?, ?, ?, ?, 0)');
  const insertCandidate = db.prepare('INSERT INTO candidates (Position, Name, Class) VALUES (?, ?, ?)');
  const insertVote = db.prepare('INSERT INTO votes (CandidateID, VoteCount) VALUES (?, 0)');

  db.exec('BEGIN');
  try {
    for (const v of voters) {
      const pinHash = createHash('sha256').update(v.pin).digest('hex');
      insertVoter.run(v.adm, pinHash, v.name, v.class);
    }
    for (const c of candidates) {
      const info = insertCandidate.run(c.pos, c.name, c.class);
      insertVote.run(info.lastInsertRowid);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function getPositions() {
  return db.prepare('SELECT id, name FROM positions ORDER BY id').all();
}

function getPositionNames() {
  return getPositions().map(r => r.name);
}

function makeReward(name) {
  const first = String(name).trim().split(/\s+/)[0] || 'Champion';
  const rewards = [
    { title: 'Civic Champion', badge: '🏅', points: 100, tagline: 'Voice of the School' },
    { title: 'Democracy Star', badge: '⭐', points: 100, tagline: 'Future Leader' },
    { title: 'Kericho Voice', badge: '🗳️', points: 100, tagline: 'Your Vote Counts' },
    { title: 'Unity Builder', badge: '🤝', points: 100, tagline: 'Together We Decide' },
  ];
  const pick = rewards[Math.floor(Math.random() * rewards.length)];
  // personalize
  return {
    ...pick,
    message: `Hongera, ${first}! 🎉 Your vote is in — thank you for shaping Kericho Primary. You've earned the ${pick.title} ${pick.badge} — ${pick.points} points for showing up for your school. One vote, one voice, one proud community!`,
    voterName: name,
  };
}

function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex');
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filepath) {
  try {
    const content = readFileSync(filepath);
    const ext = extname(filepath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.webmanifest': 'application/manifest+json',
    };
    // PWA: set correct manifest content type if path ends with manifest.json
    let ct = types[ext] || 'application/octet-stream';
    if (filepath.endsWith('manifest.json') || filepath.endsWith('manifest.webmanifest')) ct = 'application/manifest+json';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

const loginPupil = (body) => {
  const { admissionNumber, pin } = body || {};
  if (!admissionNumber || !pin) return { ok: false, error: 'Admission number and PIN required' };
  const voter = db.prepare('SELECT * FROM voters WHERE AdmissionNumber = ?').get(admissionNumber);
  if (!voter) return { ok: false, error: 'Invalid admission number or PIN' };
  if (voter.PINHash !== hashPin(pin)) return { ok: false, error: 'Invalid admission number or PIN' };
  if (voter.HasVoted) return { ok: false, error: 'You have already voted' };
  const candidates = db.prepare('SELECT CandidateID, Position, Name, Class FROM candidates ORDER BY Position, Name').all();
  const positions = getPositionNames();
  return { ok: true, voter: { AdmissionNumber: voter.AdmissionNumber, Name: voter.Name, Class: voter.Class }, candidates, positions };
};

const submitVote = (body) => {
  const { admissionNumber, selections } = body || {};
  if (!admissionNumber || !selections) return { ok: false, error: 'Missing data' };
  const voter = db.prepare('SELECT * FROM voters WHERE AdmissionNumber = ?').get(admissionNumber);
  if (!voter) return { ok: false, error: 'Invalid voter' };
  if (voter.HasVoted) return { ok: false, error: 'Already voted' };
  const positions = getPositionNames();
  if (positions.length === 0) return { ok: false, error: 'No positions configured — contact admin' };
  for (const pos of positions) {
    if (!selections[pos]) return { ok: false, error: `Missing selection for ${pos}` };
  }
  // reject extra positions not in list
  for (const k of Object.keys(selections)) {
    if (!positions.includes(k)) return { ok: false, error: `Unknown position: ${k}` };
  }
  const candidateIds = Object.values(selections);
  const placeholders = candidateIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT CandidateID, Position FROM candidates WHERE CandidateID IN (${placeholders})`).all(...candidateIds);
  if (rows.length !== candidateIds.length) return { ok: false, error: 'Invalid candidate selection' };
  const byId = new Map(rows.map(r => [r.CandidateID, r.Position]));
  for (const pos of positions) {
    const cid = selections[pos];
    if (byId.get(cid) !== pos) return { ok: false, error: `Candidate does not belong to ${pos}` };
  }
  db.exec('BEGIN');
  try {
    for (const cid of candidateIds) {
      db.prepare('UPDATE votes SET VoteCount = VoteCount + 1 WHERE CandidateID = ?').run(cid);
    }
    db.prepare('UPDATE voters SET HasVoted = 1 WHERE AdmissionNumber = ?').run(admissionNumber);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
  const reward = makeReward(voter.Name);
  return { ok: true, reward };
};

const adminLogin = (body) => {
  const { username, password } = body || {};
  if (!username || !password) return { ok: false, error: 'Username and password required' };
  if (username !== ADMIN_USERNAME) return { ok: false, error: 'Invalid credentials' };
  const hash = createHash('sha256').update(password).digest('hex');
  if (hash !== ADMIN_PASSWORD_HASH) return { ok: false, error: 'Invalid credentials' };
  return { ok: true, token: issueAdminToken() };
};

const getResults = () => {
  const results = db.prepare(`
    SELECT c.CandidateID, c.Position, c.Name, c.Class, v.VoteCount
    FROM candidates c
    JOIN votes v ON c.CandidateID = v.CandidateID
    ORDER BY c.Position, v.VoteCount DESC, c.Name
  `).all();
  const totalVoters = db.prepare('SELECT COUNT(*) as c FROM voters').get().c;
  const votedCount = db.prepare('SELECT COUNT(*) as c FROM voters WHERE HasVoted = 1').get().c;
  const turnout = totalVoters > 0 ? Math.round((votedCount / totalVoters) * 100) : 0;
  const byPosition = {};
  for (const r of results) {
    if (!byPosition[r.Position]) byPosition[r.Position] = [];
    byPosition[r.Position].push({ candidateId: r.CandidateID, name: r.Name, class: r.Class, votes: r.VoteCount });
  }
  // ensure every position appears even if no candidates
  for (const pos of getPositionNames()) {
    if (!byPosition[pos]) byPosition[pos] = [];
  }
  for (const pos of Object.keys(byPosition)) {
    const total = byPosition[pos].reduce((s, c) => s + c.votes, 0);
    for (const c of byPosition[pos]) {
      c.percent = total > 0 ? Math.round((c.votes / total) * 100) : 0;
    }
  }
  return { ok: true, byPosition, turnout, totalVoters, votedCount, positions: getPositions() };
};

const resetElection = () => {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE votes SET VoteCount = 0').run();
    db.prepare('UPDATE voters SET HasVoted = 0').run();
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
  return { ok: true };
};

const registerVoter = (body) => {
  const { admissionNumber, name, class: klass, pin } = body || {};
  if (!admissionNumber || !name || !klass || !pin) return { ok: false, error: 'All fields are required' };
  const adm = String(admissionNumber).trim().toUpperCase();
  const n = String(name).trim();
  const cls = String(klass).trim();
  const p = String(pin).trim();
  if (adm.length < 3 || adm.length > 20) return { ok: false, error: 'Admission number must be 3–20 characters' };
  if (!/^[A-Z0-9/-]+$/.test(adm)) return { ok: false, error: 'Admission number may only contain letters, numbers, / and -' };
  if (n.length < 2) return { ok: false, error: 'Name must be at least 2 characters' };
  if (cls.length < 1) return { ok: false, error: 'Class is required' };
  if (p.length < 4) return { ok: false, error: 'PIN must be at least 4 characters' };
  const existingVoter = db.prepare('SELECT AdmissionNumber FROM voters WHERE AdmissionNumber = ?').get(adm);
  if (existingVoter) return { ok: false, error: 'Admission number already registered and approved' };
  const existingReg = db.prepare('SELECT id, Status FROM voter_registrations WHERE AdmissionNumber = ?').get(adm);
  if (existingReg) {
    if (existingReg.Status === 'pending') return { ok: false, error: 'Application already pending approval' };
    if (existingReg.Status === 'approved') return { ok: false, error: 'Admission already approved — please log in to vote' };
    if (existingReg.Status === 'rejected') {
      db.prepare('DELETE FROM voter_registrations WHERE AdmissionNumber = ?').run(adm);
    }
  }
  const pinHash = hashPin(p);
  db.prepare('INSERT INTO voter_registrations (AdmissionNumber, Name, Class, PINHash, Status) VALUES (?, ?, ?, ?, \'pending\')').run(adm, n, cls, pinHash);
  const row = db.prepare('SELECT * FROM voter_registrations WHERE AdmissionNumber = ?').get(adm);
  return { ok: true, registration: { id: row.id, AdmissionNumber: row.AdmissionNumber, Name: row.Name, Class: row.Class, Status: row.Status } };
};

const listRegistrations = () => {
  const rows = db.prepare('SELECT id, AdmissionNumber, Name, Class, Status, CreatedAt, ReviewedAt FROM voter_registrations ORDER BY CASE Status WHEN \'pending\' THEN 0 WHEN \'approved\' THEN 1 ELSE 2 END, CreatedAt DESC').all();
  return { ok: true, registrations: rows };
};

const approveRegistration = (id) => {
  const reg = db.prepare('SELECT * FROM voter_registrations WHERE id = ?').get(id);
  if (!reg) return { ok: false, error: 'Registration not found' };
  if (reg.Status !== 'pending') return { ok: false, error: `Already ${reg.Status}` };
  const exists = db.prepare('SELECT AdmissionNumber FROM voters WHERE AdmissionNumber = ?').get(reg.AdmissionNumber);
  if (exists) {
    db.prepare('UPDATE voter_registrations SET Status = \'rejected\', ReviewedAt = datetime(\'now\') WHERE id = ?').run(id);
    return { ok: false, error: 'Voter already exists' };
  }
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO voters (AdmissionNumber, PINHash, Name, Class, HasVoted) VALUES (?, ?, ?, ?, 0)').run(reg.AdmissionNumber, reg.PINHash, reg.Name, reg.Class);
    db.prepare('UPDATE voter_registrations SET Status = \'approved\', ReviewedAt = datetime(\'now\') WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return { ok: false, error: 'Failed to approve — ' + e.message };
  }
  return { ok: true };
};

const rejectRegistration = (id) => {
  const reg = db.prepare('SELECT * FROM voter_registrations WHERE id = ?').get(id);
  if (!reg) return { ok: false, error: 'Registration not found' };
  if (reg.Status !== 'pending') return { ok: false, error: `Already ${reg.Status}` };
  db.prepare('UPDATE voter_registrations SET Status = \'rejected\', ReviewedAt = datetime(\'now\') WHERE id = ?').run(id);
  return { ok: true };
};

const submitFraudReport = (body) => {
  const { reporterName, admissionNumber, position, details } = body || {};
  if (!reporterName || !details) return { ok: false, error: 'Name and details are required' };
  const name = String(reporterName).trim();
  const adm = admissionNumber ? String(admissionNumber).trim().toUpperCase() : null;
  const pos = position ? String(position).trim() : null;
  const det = String(details).trim();
  if (name.length < 2) return { ok: false, error: 'Name too short' };
  if (det.length < 10) return { ok: false, error: 'Please describe the issue (at least 10 characters)' };
  if (det.length > 2000) return { ok: false, error: 'Details too long (max 2000)' };
  db.prepare('INSERT INTO fraud_reports (ReporterName, AdmissionNumber, Position, Details) VALUES (?, ?, ?, ?)').run(name, adm, pos, det);
  return { ok: true };
};

const submitContact = (body) => {
  const { name, contact, message } = body || {};
  if (!name || !contact || !message) return { ok: false, error: 'All fields are required' };
  const n = String(name).trim();
  const c = String(contact).trim();
  const m = String(message).trim();
  if (n.length < 2) return { ok: false, error: 'Name too short' };
  if (c.length < 5) return { ok: false, error: 'Contact too short' };
  if (m.length < 10) return { ok: false, error: 'Message must be at least 10 characters' };
  if (m.length > 2000) return { ok: false, error: 'Message too long (max 2000)' };
  db.prepare('INSERT INTO contact_messages (Name, Contact, Message) VALUES (?, ?, ?)').run(n, c, m);
  return { ok: true };
};

const listFraudReports = () => {
  const rows = db.prepare('SELECT * FROM fraud_reports ORDER BY CreatedAt DESC').all();
  return { ok: true, reports: rows };
};

const listContacts = () => {
  const rows = db.prepare('SELECT * FROM contact_messages ORDER BY CreatedAt DESC').all();
  return { ok: true, messages: rows };
};

const listPositions = () => {
  return { ok: true, positions: getPositions() };
};

const addPosition = (body) => {
  const name = body?.name ? String(body.name).trim() : '';
  if (!name) return { ok: false, error: 'Position name required' };
  if (name.length < 3 || name.length > 60) return { ok: false, error: 'Position name must be 3–60 characters' };
  if (getPositionNames().some(p => p.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Position already exists' };
  try {
    const info = db.prepare('INSERT INTO positions (name) VALUES (?)').run(name);
    return { ok: true, position: { id: info.lastInsertRowid, name } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const removePosition = (id) => {
  const pos = db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  if (!pos) return { ok: false, error: 'Position not found' };
  // prevent deleting last position? allow but warn — keep at least 1
  const count = db.prepare('SELECT COUNT(*) as c FROM positions').get().c;
  if (count <= 1) return { ok: false, error: 'Cannot remove the last position' };
  const candidates = db.prepare('SELECT CandidateID FROM candidates WHERE Position = ?').all(pos.name);
  db.exec('BEGIN');
  try {
    for (const c of candidates) {
      db.prepare('DELETE FROM votes WHERE CandidateID = ?').run(c.CandidateID);
    }
    db.prepare('DELETE FROM candidates WHERE Position = ?').run(pos.name);
    db.prepare('DELETE FROM positions WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return { ok: false, error: e.message };
  }
  return { ok: true };
};

initSchema();
seedIfEmpty();
seedPositionsIfEmpty();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/positions') {
    sendJSON(res, 200, listPositions());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/positions') {
    if (!isAdminAuthorized(req)) { sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' }); return; }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { sendJSON(res, 200, addPosition(JSON.parse(body))); } catch { sendJSON(res, 400, { ok: false, error: 'Invalid JSON' }); }
    });
    return;
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/admin\/positions\/\d+$/)) {
    if (!isAdminAuthorized(req)) { sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' }); return; }
    const id = Number(pathname.split('/').pop());
    sendJSON(res, 200, removePosition(id));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendJSON(res, 200, loginPupil(data));
      } catch {
        sendJSON(res, 400, { ok: false, error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/vote') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendJSON(res, 200, submitVote(data));
      } catch (e) {
        sendJSON(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/register') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendJSON(res, 200, registerVoter(data));
      } catch (e) {
        sendJSON(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/fraud') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendJSON(res, 200, submitFraudReport(data));
      } catch (e) {
        sendJSON(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/contact') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendJSON(res, 200, submitContact(data));
      } catch (e) {
        sendJSON(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendJSON(res, 200, adminLogin(data));
      } catch {
        sendJSON(res, 400, { ok: false, error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/results') {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    sendJSON(res, 200, getResults());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    sendJSON(res, 200, resetElection());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/registrations') {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    sendJSON(res, 200, listRegistrations());
    return;
  }

  const approveMatch = pathname.match(/^\/api\/admin\/registrations\/(\d+)\/approve$/);
  if (req.method === 'POST' && approveMatch) {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    const id = Number(approveMatch[1]);
    sendJSON(res, 200, approveRegistration(id));
    return;
  }

  const rejectMatch = pathname.match(/^\/api\/admin\/registrations\/(\d+)\/reject$/);
  if (req.method === 'POST' && rejectMatch) {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    const id = Number(rejectMatch[1]);
    sendJSON(res, 200, rejectRegistration(id));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/fraud') {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    sendJSON(res, 200, listFraudReports());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/contacts') {
    if (!isAdminAuthorized(req)) {
      sendJSON(res, 401, { ok: false, error: 'Unauthorized — admin login required' });
      return;
    }
    sendJSON(res, 200, listContacts());
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(res, join(process.cwd(), 'public', 'index.html'));
    return;
  }

  if (pathname.startsWith('/public/')) {
    serveStatic(res, join(process.cwd(), pathname.slice(1)));
    return;
  }

  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    serveStatic(res, join(process.cwd(), 'public', 'manifest.json'));
    return;
  }

  if (pathname === '/sw.js') {
    serveStatic(res, join(process.cwd(), 'public', 'sw.js'));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kericho Primary Voting System running on http://localhost:${PORT}`);
  console.log(`Admin login: ${ADMIN_USERNAME} / admin123`);
});
