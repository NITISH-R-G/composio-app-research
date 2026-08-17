const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/results.json'), 'utf8'));
const verification = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/verification.json'), 'utf8'));
let tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = s => (s || '').toLowerCase();

/* ---------------- Access ladder (derived, monotonic) ---------------- */
const r1 = results.filter(x => {
  const a = L(x.api_surface);
  return !(a.includes('unknown') || a.startsWith('none') || a.includes('not a rest service') || a.includes('local cli'));
});
const r2 = r1.filter(x => {
  const a = L(x.auth_method);
  return !(a.includes('unknown') || a.includes('unclear') || a.startsWith('n/a'));
});
const r3 = r2.filter(x => {
  const s = L(x.self_serve);
  return s.includes('self-serve free') || s.includes('self-serve trial');
});
const r5 = results.filter(x => x.buildability_verdict === 'buildable today');

const rungs = [
  [r1.length, 'A documented public API exists'],
  [r2.length, 'Auth method is known and usable'],
  [r3.length, 'A developer can self-issue credentials'],
  [r5.length, 'Shippable toolkit today'],
];
const ladder = rungs.map((rung, i) => {
  const isLast = i === rungs.length - 1;
  const isMajorDropNext = i === rungs.length - 2;
  let html = `<div class="rung${isLast ? ' is-final' : ''}">
      <div class="rv num">${rung[0]}</div>
      <div class="rk">${esc(rung[1])}</div>
    </div>`;
  if (!isLast) {
    html += isMajorDropNext
      ? `<div class="drop major"><div class="note"><b>The largest drop is non-technical.</b> Eighteen apps fall out here for business verification, developer-token approval, sandbox provisioning, access review, or a commercial contract &mdash; not for anything about the API itself.</div></div>`
      : `<div class="drop"></div>`;
  }
  return html;
}).join('\n');

/* ---------------- Build-order tiers ---------------- */
const isFree = x => L(x.self_serve).includes('self-serve free');
const isToday = x => x.buildability_verdict === 'buildable today';
const isLow = x => x.confidence === 'low';

const T0 = results.filter(x => isToday(x) && isFree(x) && x.mcp_exists === true && !isLow(x));
const T1 = results.filter(x => isToday(x) && !isLow(x) && !(isFree(x) && x.mcp_exists === true));
const T2 = results.filter(x => x.buildability_verdict === 'buildable with limitation' && !isLow(x));
const T3 = results.filter(x => x.buildability_verdict === 'blocked' && !isLow(x));
const T4 = results.filter(isLow);
const eg = a => a.slice(0, 5).map(x => x.app).join(', ') + (a.length > 5 ? `, and ${a.length - 5} more` : '');

const tierDefs = [
  ['P0', 'Build first', T0, 'Self-serve free, buildable today, and an MCP server already exists. Lowest integration cost, and the vendor has already signalled it wants agent access.'],
  ['P1', 'Fast follow', T1, 'Buildable today, but needs a trial or paid account, or has no MCP yet. Straightforward engineering with no outreach required.'],
  ['P2', 'Build on demand', T2, 'A real limitation sits in the way — a paid tier, tight rate limits, a narrow surface, or an approval before production. Worth building when a customer asks.'],
  ['P3', 'Customer-led only', T3, 'Enterprise contract, partner review, or no self-serve path at all. The gate is commercial rather than technical, so build only with a named customer pulling.'],
  ['P4', 'Human validation first', T4, 'The agent could not verify these from public sources. Someone needs to sign up, email sales, or open a gated portal before any build decision is possible.'],
];
const tiers = tierDefs.map(([code, name, arr, why], i) => `
  <div class="tier${i === 0 ? ' is-first' : ''}">
    <div class="code">${code}</div>
    <div>
      <div class="name">${esc(name)}</div>
      <p class="why">${esc(why)}</p>
      <p class="eg">${esc(eg(arr))}</p>
    </div>
    <div class="count num">${arr.length}<small>apps</small></div>
  </div>`).join('');

/* ---------------- Dataset rows (server-rendered; JS only filters) ---------------- */
const mcpLabel = v => (v === true ? 'Yes' : v === false ? '<span class="muted">No</span>' : '<span class="muted">Unclear</span>');
const rows = results.map(r => {
  const search = `${r.app} ${r.category}`.toLowerCase();
  const blocked = r.buildability_verdict === 'blocked';
  const verdict = r.buildability_verdict.replace(/^b/, 'B');
  return `<tr data-verdict="${esc(r.buildability_verdict)}" data-search="${esc(search)}">
    <td><span class="app">${esc(r.app)}</span><span class="cat">${esc(r.category)}</span></td>
    <td>${esc(r.auth_method)}</td>
    <td>${esc(r.self_serve)}</td>
    <td>${mcpLabel(r.mcp_exists)}</td>
    <td class="${blocked ? 'verdict-blocked' : ''}">${esc(verdict)}</td>
    <td>${(r.evidence || []).slice(0, 1).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">Source</a>`).join('')}</td>
  </tr>`;
}).join('\n');

/* ---------------- Corrections, grouped by field ---------------- */
const blurbs = {
  Zendesk: 'A first-party MCP endpoint had shipped since the claim was written.',
  Harvest: 'Recorded as having no MCP server; several community servers already existed.',
  Ahrefs: 'Documentation and real access requirements differed — lower tiers do get limited API access.',
  Ramp: 'Sandbox provisioning turned out to require an account manager, not self-signup.',
  fanbasis: 'A public API reference and SDK existed outside the login-gated portal.',
};
const order = ['mcp_exists', 'self_serve', 'api_surface'];
const wrongs = verification.filter(v => v.verdict !== 'CONFIRMED')
  .sort((a, b) => order.indexOf(String(a.field).split(' ')[0]) - order.indexOf(String(b.field).split(' ')[0]));
const corrections = wrongs.map(v => `
  <div class="correction">
    <div class="capp">${esc(v.app)}</div>
    <div class="cfield">${esc(String(v.field).split(' ')[0])}</div>
    <div class="cwhat">${esc(blurbs[v.app] || v.notes)}</div>
  </div>`).join('');

/* ---------------- Low-confidence records ---------------- */
const lowconf = T4.map(r => `
  <div class="low">
    <div class="lapp">${esc(r.app)}</div>
    <div class="lwhy">${esc(r.blocker)}</div>
  </div>`).join('');

/* ---------------- Assemble ---------------- */
tpl = tpl
  .replace('__LADDER__', ladder)
  .replace('__TIERS__', tiers)
  .replace('__ROWS__', rows)
  .replace('__CORRECTIONS__', corrections)
  .replace('__LOWCONF__', lowconf);

fs.writeFileSync(path.join(__dirname, 'case_study.html'), tpl);

console.log('Built site/case_study.html');
console.log('ladder :', rungs.map(r => r[0]).join(' -> '));
console.log('tiers  :', tierDefs.map(t => `${t[0]}=${t[2].length}`).join(' '), '| sum',
  tierDefs.reduce((n, t) => n + t[2].length, 0));
console.log('rows   :', results.length, '| corrections:', wrongs.length, '| low-conf:', T4.length);
