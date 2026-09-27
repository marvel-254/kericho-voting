import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let passed = 0, failed = 0;
function ok(name, fn) {
  return async () => {
    try { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
  };
}

async function getAdminToken() {
  const { data } = await post('/api/admin/login', { username: 'admin', password: 'admin123' });
  assert.equal(data.ok, true, 'admin login should succeed');
  assert.ok(data.token, 'token present');
  return data.token;
}

async function resetWithToken(token) {
  const { data, status } = await post('/api/reset', {}, { 'x-admin-token': token });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
}

const tests = [];

// TC01 login OK → ballot screen (returns voter + candidates)
tests.push(ok('TC01 pupil login OK returns ballot', async () => {
  const token = await getAdminToken();
  await resetWithToken(token);
  const { data } = await post('/api/login', { admissionNumber: 'KP001', pin: '1234' });
  assert.equal(data.ok, true);
  assert.ok(data.voter);
  assert.equal(data.voter.AdmissionNumber, 'KP001');
  assert.ok(Array.isArray(data.candidates) && data.candidates.length >= 10);
}));

// TC02 wrong PIN rejected
tests.push(ok('TC02 wrong PIN rejected', async () => {
  const token = await getAdminToken();
  await resetWithToken(token);
  const { data } = await post('/api/login', { admissionNumber: 'KP001', pin: '9999' });
  assert.equal(data.ok, false);
  assert.match(data.error, /Invalid/i);
}));

// TC03 double vote rejected
tests.push(ok('TC03 double vote rejected', async () => {
  const token = await getAdminToken();
  await resetWithToken(token);
  const { data: login } = await post('/api/login', { admissionNumber: 'KP002', pin: '1234' });
  assert.equal(login.ok, true);
  const selections = {};
  for (const c of login.candidates) if (!selections[c.Position]) selections[c.Position] = c.CandidateID;
  const { data: v1 } = await post('/api/vote', { admissionNumber: 'KP002', selections });
  assert.equal(v1.ok, true);
  const { data: v2 } = await post('/api/vote', { admissionNumber: 'KP002', selections });
  assert.equal(v2.ok, false);
  assert.match(v2.error, /Already voted/i);
}));

// TC04 incomplete ballot rejected
tests.push(ok('TC04 incomplete ballot rejected', async () => {
  const token = await getAdminToken();
  await resetWithToken(token);
  const { data: login } = await post('/api/login', { admissionNumber: 'KP003', pin: '1234' });
  assert.equal(login.ok, true);
  const selections = {};
  // only pick one position
  selections[login.candidates[0].Position] = login.candidates[0].CandidateID;
  const { data } = await post('/api/vote', { admissionNumber: 'KP003', selections });
  assert.equal(data.ok, false);
  assert.match(data.error, /Missing selection/i);
}));

// TC05 valid ballot tallies + % math
tests.push(ok('TC05 valid ballot tallies and percent', async () => {
  const token = await getAdminToken();
  await resetWithToken(token);
  const { data: l1 } = await post('/api/login', { admissionNumber: 'KP004', pin: '1234' });
  const { data: l2 } = await post('/api/login', { admissionNumber: 'KP005', pin: '1234' });
  // Build selections: each voter picks first candidate per position from their login candidate list
  const pick = (candidates) => {
    const s = {};
    for (const c of candidates) if (!s[c.Position]) s[c.Position] = c.CandidateID;
    return s;
  };
  await post('/api/vote', { admissionNumber: 'KP004', selections: pick(l1.candidates) });
  await post('/api/vote', { admissionNumber: 'KP005', selections: pick(l2.candidates) });
  const { data: results, status } = await get('/api/results', { 'x-admin-token': token });
  assert.equal(status, 200);
  assert.equal(results.ok, true);
  // every position should have total votes == 2
  for (const pos of Object.keys(results.byPosition)) {
    const total = results.byPosition[pos].reduce((s, c) => s + c.votes, 0);
    assert.equal(total, 2, `${pos} total should be 2`);
    const sumPct = results.byPosition[pos].reduce((s, c) => s + c.percent, 0);
    // with 2 votes, percents should sum to 100 (or 100 due to rounding)
    assert.ok(sumPct === 100 || sumPct === 0, `${pos} pct sum ${sumPct}`);
  }
  assert.equal(results.votedCount, 2);
  assert.equal(results.turnout, 20); // 2 / 10
}));

// TC06 admin login → dashboard (requires token)
tests.push(ok('TC06 admin login and results require token', async () => {
  // without token should be 401
  const { status: s1, data: d1 } = await get('/api/results');
  assert.equal(s1, 401);
  assert.equal(d1.ok, false);
  const token = await getAdminToken();
  const { status: s2, data: d2 } = await get('/api/results', { 'x-admin-token': token });
  assert.equal(s2, 200);
  assert.equal(d2.ok, true);
  assert.ok(d2.byPosition);
  // wrong password
  const { data: bad } = await post('/api/admin/login', { username: 'admin', password: 'wrong' });
  assert.equal(bad.ok, false);
}));

// TC07 reset → counts back to zero (requires token)
tests.push(ok('TC07 reset clears votes and hasVoted (requires token)', async () => {
  const token = await getAdminToken();
  // cast a vote first
  const { data: login } = await post('/api/login', { admissionNumber: 'KP006', pin: '1234' });
  const selections = {};
  for (const c of login.candidates) if (!selections[c.Position]) selections[c.Position] = c.CandidateID;
  await post('/api/vote', { admissionNumber: 'KP006', selections });
  // reset without token should be 401
  const { status: s1 } = await post('/api/reset', {});
  assert.equal(s1, 401);
  // reset with token
  await resetWithToken(token);
  const { data: results } = await get('/api/results', { 'x-admin-token': token });
  for (const pos of Object.keys(results.byPosition)) {
    for (const c of results.byPosition[pos]) {
      assert.equal(c.votes, 0, `${pos} ${c.name} should be 0 after reset`);
      assert.equal(c.percent, 0);
    }
  }
  assert.equal(results.votedCount, 0);
  assert.equal(results.turnout, 0);
  // after reset, previously voted pupil can vote again
  const { data: relogin } = await post('/api/login', { admissionNumber: 'KP006', pin: '1234' });
  assert.equal(relogin.ok, true, 'should be able to login again after reset');
}));

async function main() {
  console.log(`Smoke tests against ${BASE} — ${tests.length} cases`);
  for (const t of tests) await t();
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
