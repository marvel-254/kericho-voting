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
    CREATE INDEX IF NOT EXISTS idx_candidates_position ON candidates(Position);
    CREATE INDEX IF NOT EXISTS idx_voters_class ON voters(Class);
  `);
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

  const positions = [
    'School Captain (Head Boy)',
    'School Captain (Head Girl)',
    'Assistant Head Boy',
    'Assistant Head Girl',
    'Games Captain'
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

function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex');
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendHTML(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
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
  return { ok: true, voter: { AdmissionNumber: voter.AdmissionNumber, Name: voter.Name, Class: voter.Class }, candidates };
};

const submitVote = (body) => {
  const { admissionNumber, selections } = body || {};
  if (!admissionNumber || !selections) return { ok: false, error: 'Missing data' };
  const voter = db.prepare('SELECT * FROM voters WHERE AdmissionNumber = ?').get(admissionNumber);
  if (!voter) return { ok: false, error: 'Invalid voter' };
  if (voter.HasVoted) return { ok: false, error: 'Already voted' };
  const positions = ['School Captain (Head Boy)', 'School Captain (Head Girl)', 'Assistant Head Boy', 'Assistant Head Girl', 'Games Captain'];
  for (const pos of positions) {
    if (!selections[pos]) return { ok: false, error: `Missing selection for ${pos}` };
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
  return { ok: true };
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
  for (const pos of Object.keys(byPosition)) {
    const total = byPosition[pos].reduce((s, c) => s + c.votes, 0);
    for (const c of byPosition[pos]) {
      c.percent = total > 0 ? Math.round((c.votes / total) * 100) : 0;
    }
  }
  return { ok: true, byPosition, turnout, totalVoters, votedCount };
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

initSchema();
seedIfEmpty();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

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
      } catch {
        sendJSON(res, 400, { ok: false, error: 'Invalid JSON' });
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

  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(res, join(process.cwd(), 'public', 'index.html'));
    return;
  }

  if (pathname.startsWith('/public/')) {
    serveStatic(res, join(process.cwd(), pathname.slice(1)));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kericho Primary Voting System running on http://localhost:${PORT}`);
  console.log(`Admin login: ${ADMIN_USERNAME} / admin123`);
});