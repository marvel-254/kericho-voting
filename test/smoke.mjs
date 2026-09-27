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
  selections[login.candidates[0].Position] = login.candidates[0].CandidateID;
  const { data } = await post('/api/vote', { admissionNumber: 'KP003', selections });
  assert.equal(data.ok, false);
  assert.match(data.error, /Missing selection/i);
}));

// TC05 valid ballot tallies + % math (totalVoters grows as TC10/TC11 approve, so compute turnout dynamically)
tests.push(ok('TC05 valid ballot tallies and percent', async () => {
  const token = await getAdminToken();
  await resetWithToken(token);
  const { data: l1 } = await post('/api/login', { admissionNumber: 'KP004', pin: '1234' });
  const { data: l2 } = await post('/api/login', { admissionNumber: 'KP005', pin: '1234' });
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
  for (const pos of Object.keys(results.byPosition)) {
    const total = results.byPosition[pos].reduce((s, c) => s + c.votes, 0);
    assert.equal(total, 2, `${pos} total should be 2`);
    const sumPct = results.byPosition[pos].reduce((s, c) => s + c.percent, 0);
    assert.ok(sumPct === 100 || sumPct === 0, `${pos} pct sum ${sumPct}`);
  }
  assert.equal(results.votedCount, 2);
  const expectedTurnout = Math.round((2 / results.totalVoters) * 100);
  assert.equal(results.turnout, expectedTurnout, `turnout should be ${expectedTurnout} for 2/${results.totalVoters}`);
}));

// TC06 admin login → dashboard (requires token)
tests.push(ok('TC06 admin login and results require token', async () => {
  const { status: s1, data: d1 } = await get('/api/results');
  assert.equal(s1, 401);
  assert.equal(d1.ok, false);
  const token = await getAdminToken();
  const { status: s2, data: d2 } = await get('/api/results', { 'x-admin-token': token });
  assert.equal(s2, 200);
  assert.equal(d2.ok, true);
  assert.ok(d2.byPosition);
  const { data: bad } = await post('/api/admin/login', { username: 'admin', password: 'wrong' });
  assert.equal(bad.ok, false);
}));

// TC07 reset → counts back to zero (requires token)
tests.push(ok('TC07 reset clears votes and hasVoted (requires token)', async () => {
  const token = await getAdminToken();
  const { data: login } = await post('/api/login', { admissionNumber: 'KP006', pin: '1234' });
  const selections = {};
  for (const c of login.candidates) if (!selections[c.Position]) selections[c.Position] = c.CandidateID;
  await post('/api/vote', { admissionNumber: 'KP006', selections });
  const { status: s1 } = await post('/api/reset', {});
  assert.equal(s1, 401);
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
  const { data: relogin } = await post('/api/login', { admissionNumber: 'KP006', pin: '1234' });
  assert.equal(relogin.ok, true, 'should be able to login again after reset');
}));

// TC08 register new voter → pending, cannot vote before approval
tests.push(ok('TC08 register pending and login blocked until approved', async () => {
  const adm = 'KP099';
  // cleanup if previous run left it: try to approve/reject via token if exists
  const token = await getAdminToken();
  // ensure no leftover voter: reset election does not delete voters, but registrations do. We'll use a fresh adm each run; use timestamp variant if needed
  // ensure pending path
  const { data: reg, status: s1 } = await post('/api/register', { admissionNumber: adm, name: 'Test Pupil', class: 'Grade 5', pin: '9999' });
  assert.equal(s1, 200);
  if (!reg.ok) {
    // if already pending/approved from previous run, fetch its id and reject+re-register logic: just check idempotency message
    // clean: if already voter, try different adm
    const adm2 = `KP${Date.now().toString().slice(-3)}`;
    const { data: reg2 } = await post('/api/register', { admissionNumber: adm2, name: 'Test Pupil', class: 'Grade 5', pin: '9999' });
    assert.equal(reg2.ok, true, 'fallback registration should succeed');
    // pending login blocked
    const { data: bad } = await post('/api/login', { admissionNumber: adm2, pin: '9999' });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Invalid/i);
    return;
  }
  assert.equal(reg.ok, true);
  assert.equal(reg.registration.Status, 'pending');
  const { data: bad } = await post('/api/login', { admissionNumber: adm, pin: '9999' });
  assert.equal(bad.ok, false);
}));

// TC09 registrations require admin token
tests.push(ok('TC09 registrations endpoint requires admin token', async () => {
  const { status: s1 } = await get('/api/admin/registrations');
  assert.equal(s1, 401);
  const token = await getAdminToken();
  const { status: s2, data: d2 } = await get('/api/admin/registrations', { 'x-admin-token': token });
  assert.equal(s2, 200);
  assert.equal(d2.ok, true);
  assert.ok(Array.isArray(d2.registrations));
}));

// TC10 approve → voter can log in and vote
tests.push(ok('TC10 approve registration then voter can log in', async () => {
  const token = await getAdminToken();
  const adm = `KPA${Date.now().toString().slice(-4)}`;
  const { data: reg } = await post('/api/register', { admissionNumber: adm, name: 'Approve Test', class: 'Grade 4', pin: '7777' });
  assert.equal(reg.ok, true);
  const regId = reg.registration.id;
  const listBefore = await get('/api/admin/registrations', { 'x-admin-token': token });
  assert.ok(listBefore.data.registrations.find(r => r.id === regId && r.Status === 'pending'));
  const { data: appr } = await post(`/api/admin/registrations/${regId}/approve`, {}, { 'x-admin-token': token });
  assert.equal(appr.ok, true);
  const { data: login } = await post('/api/login', { admissionNumber: adm, pin: '7777' });
  assert.equal(login.ok, true, 'approved voter should be able to log in');
}));

// TC11 reject → voter still cannot log in, can re-apply
tests.push(ok('TC11 reject registration keeps voter blocked but allows re-apply', async () => {
  const token = await getAdminToken();
  const adm = `KPR${Date.now().toString().slice(-4)}`;
  const { data: reg } = await post('/api/register', { admissionNumber: adm, name: 'Reject Test', class: 'Grade 4', pin: '8888' });
  assert.equal(reg.ok, true);
  const regId = reg.registration.id;
  const { data: rej } = await post(`/api/admin/registrations/${regId}/reject`, {}, { 'x-admin-token': token });
  assert.equal(rej.ok, true);
  const { data: bad } = await post('/api/login', { admissionNumber: adm, pin: '8888' });
  assert.equal(bad.ok, false);
  const { data: reapply } = await post('/api/register', { admissionNumber: adm, name: 'Reject Test', class: 'Grade 4', pin: '8888' });
  assert.equal(reapply.ok, true, 'should allow re-apply after rejection');
  assert.equal(reapply.registration.Status, 'pending');
}));

// TC12 duplicate admission already registered → rejected
tests.push(ok('TC12 duplicate admission already approved is rejected', async () => {
  const { data } = await post('/api/register', { admissionNumber: 'KP001', name: 'Duplicate', class: 'Grade 5', pin: '1234' });
  assert.equal(data.ok, false);
  assert.match(data.error, /already registered/i);
}));

async function main() {
  console.log(`Smoke tests against ${BASE} — ${tests.length} cases`);
  for (const t of tests) await t();
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
