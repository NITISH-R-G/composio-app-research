const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/results.json'), 'utf8'));
const verification = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/verification.json'), 'utf8'));
let tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = s => (s || '').toLowerCase();

/* ---------------- Access measures (each stricter than the last) ---------------- */
const m1 = results.filter(x => {
  const a = L(x.api_surface);
  return !(a.includes('unknown') || a.startsWith('none') || a.includes('not a rest service') || a.includes('local cli'));
});
const m2 = m1.filter(x => {
  const a = L(x.auth_method);
  return !(a.includes('unknown') || a.includes('unclear') || a.startsWith('n/a'));
});
const m3 = m2.filter(x => {
  const s = L(x.self_serve);
  return s.includes('self-serve free') || s.includes('self-serve trial');
});
const m4 = results.filter(x => x.buildability_verdict === 'buildable today');

const measures = [
  ['Documented public API', m1.length, 'Public developer documentation exists.'],
  ['Known usable auth', m2.length, 'An authentication path could be established from the documentation.'],
  ['Self-issued credentials', m3.length, 'A developer can obtain credentials without contacting sales, under the research definition.'],
  ['Shippable today', m4.length, 'The research agent judged a toolkit feasible with no material access blocker.'],
];
const ladder = measures.map(([name, n, meaning]) => `
  <tr>
    <td class="strong">${esc(name)}</td>
    <td class="n">${n}</td>
    <td>${esc(meaning)}</td>
  </tr>`).join('');

/* ---------------- Build-order tiers ---------------- */
const isFree = x => L(x.self_serve).includes('self-serve free');
const isToday = x => x.buildability_verdict === 'buildable today';
const isLow = x => x.confidence === 'low';

const T0 = results.filter(x => isToday(x) && isFree(x) && x.mcp_exists === true && !isLow(x));
const T1 = results.filter(x => isToday(x) && !isLow(x) && !(isFree(x) && x.mcp_exists === true));
const T2 = results.filter(x => x.buildability_verdict === 'buildable with limitation' && !isLow(x));
const T3 = results.filter(x => x.buildability_verdict === 'blocked' && !isLow(x));
const T4 = results.filter(isLow);
const eg = a => a.slice(0, 3).map(x => x.app).join(', ');

const tierDefs = [
  ['P0: Build first', T0, 'Free to start, buildable today, MCP server already exists.'],
  ['P1: Fast follow', T1, 'Buildable today, needs a trial or paid account, or has no MCP yet.'],
  ['P2: Build on demand', T2, 'A paid tier, rate limit, narrow API, or approval step gets in the way.'],
  ['P3: Customer-led only', T3, 'Needs an enterprise contract or approval. The barrier is commercial.'],
  ['P4: Human validation first', T4, 'Could not be confirmed from public sources.'],
];
const tiers = tierDefs.map(([name, arr, why]) => `
  <tr>
    <td class="tier">${esc(name)}</td>
    <td class="n">${arr.length}</td>
    <td>${esc(why)}</td>
    <td class="eg">${esc(eg(arr))}</td>
  </tr>`).join('');

/* ---------------- Dataset rows ---------------- */
function credentialAccess(x) {
  const s = L(x.self_serve);
  const detail = (x.self_serve || '').split(/\s[-—]\s/).slice(1).join(' - ').trim();
  let label = 'Unclear';
  if (s.includes('self-serve free')) label = 'Free';
  else if (s.includes('self-serve trial')) label = 'Free trial';
  else if (s.includes('paid plan')) label = 'Paid plan';
  else if (s.includes('admin/partner')) label = 'Needs approval';
  else if (s.includes('contact-sales')) label = 'Contact sales';
  return { label, detail };
}
function apiMcp(x) {
  const a = L(x.api_surface);
  let proto = '';
  const hasRest = a.includes('rest'), hasGql = a.includes('graphql');
  if (hasRest && hasGql) proto = 'REST + GraphQL';
  else if (hasGql) proto = 'GraphQL';
  else if (hasRest) proto = 'REST';
  else if (a.includes('cli')) proto = 'CLI';
  let breadth = '';
  if (a.includes('very broad')) breadth = 'Very broad ';
  else if (a.includes('broad')) breadth = 'Broad ';
  else if (a.includes('moderate')) breadth = 'Moderate ';
  else if (a.includes('narrow')) breadth = 'Narrow ';
  const api = (breadth + proto).trim() || 'Not established';
  const mcp = x.mcp_exists === true ? 'MCP available'
            : x.mcp_exists === false ? 'No MCP found'
            : 'MCP unclear';
  return { api, mcp };
}
const rows = results.map(r => {
  const cred = credentialAccess(r);
  const am = apiMcp(r);
  const verdict = r.buildability_verdict.charAt(0).toUpperCase() + r.buildability_verdict.slice(1);
  return `<tr data-verdict="${esc(r.buildability_verdict)}" data-search="${esc(L(r.app + ' ' + r.category))}">
    <td class="strong">${esc(r.app)}</td>
    <td>${esc(r.category)}</td>
    <td>${esc(r.auth_method)}</td>
    <td>${esc(cred.label)}${cred.detail ? `<span class="sub">${esc(cred.detail)}</span>` : ''}</td>
    <td>${esc(am.api)}<span class="sub">${esc(am.mcp)}</span></td>
    <td>${esc(verdict)}</td>
    <td>${(r.evidence || []).slice(0, 1).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">Source</a>`).join('')}</td>
  </tr>`;
}).join('\n');

/* ---------------- Corrections found by the second pass ---------------- */
const detail = {
  Zendesk:  ['Recorded as having no official MCP server.', 'A first-party MCP endpoint had shipped since.'],
  Harvest:  ['Recorded as having no MCP server.', 'Several community MCP servers already existed.'],
  Ahrefs:   ['Described as Enterprise-only at $1,499/mo.', 'Lower tiers get limited API access; Enterprise is about $1,249/mo.'],
  Ramp:     ['Sandbox described as self-serve.', 'Sandbox provisioning requires an account manager.'],
  fanbasis: ['Described as having no public documentation.', 'A public API reference and SDK exist outside the gated portal.'],
};
const order = ['mcp_exists', 'self_serve', 'api_surface'];
const wrongs = verification.filter(v => v.verdict !== 'CONFIRMED')
  .sort((a, b) => order.indexOf(String(a.field).split(' ')[0]) - order.indexOf(String(b.field).split(' ')[0]));
const corrections = wrongs.map(v => {
  const d = detail[v.app] || [v.notes, v.correction || ''];
  return `<tr>
    <td class="strong">${esc(v.app)}</td>
    <td><span class="ident">${esc(String(v.field).split(' ')[0])}</span></td>
    <td>${esc(d[0])}</td>
    <td>${esc(d[1])}</td>
  </tr>`;
}).join('');

/* ---------------- Low-confidence records: a human work queue ---------------- */
const why = {
  'Pumble': ['API documentation is hosted in a marketplace add-on rather than a developer portal, so coverage could not be confirmed.', 'Direct vendor confirmation'],
  'fanbasis': ['The main developer portal requires a login, and no self-serve signup path was found.', 'Account access or vendor outreach'],
  'MrScraper': ['Documentation is thin and fragmented, and pricing and free-tier limits could not be confirmed.', 'Vendor pricing confirmation'],
  'Waterfall.io': ['Pricing and rate limits are documented mainly by third parties rather than the vendor.', 'Vendor pricing confirmation'],
  'Paygent Connect': ['No public developer documentation could be located for this product.', 'Direct vendor outreach'],
  'higgsfield': ['The underlying API is documented only through the CLI, with no published pricing or limits.', 'Vendor documentation request'],
};
const lowconf = T4.map(r => {
  const w = why[r.app] || [r.blocker, 'Direct vendor outreach'];
  return `<tr>
    <td class="strong">${esc(r.app)}</td>
    <td>${esc(w[0])}</td>
    <td>${esc(w[1])}</td>
  </tr>`;
}).join('');

/* ---------------- Assemble ---------------- */
tpl = tpl
  .replace('__LADDER__', ladder)
  .replace('__TIERS__', tiers)
  .replace('__ROWS__', rows)
  .replace('__CORRECTIONS__', corrections)
  .replace('__LOWCONF__', lowconf);

fs.writeFileSync(path.join(__dirname, 'case_study.html'), tpl);

console.log('Built site/case_study.html');
console.log('measures :', measures.map(m => `${m[0]}=${m[1]}`).join(' | '));
console.log('tiers    :', tierDefs.map(t => `${t[0].split(' ')[0]}=${t[1].length}`).join(' '),
  '| sum', tierDefs.reduce((n, t) => n + t[1].length, 0));
console.log('rows     :', results.length, '| corrections:', wrongs.length, '| low-confidence:', T4.length);
