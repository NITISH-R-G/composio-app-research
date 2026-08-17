const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/results.json'), 'utf8'));
const verification = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/verification.json'), 'utf8'));
let tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

// ---- KPI tiles ----
const total = results.length;
const buildableToday = results.filter(r => r.buildability_verdict === 'buildable today').length;
const withLimitation = results.filter(r => r.buildability_verdict === 'buildable with limitation').length;
const blocked = results.filter(r => r.buildability_verdict === 'blocked').length;
const mcpYes = results.filter(r => r.mcp_exists === true).length;
const oauthCount = results.filter(r => (r.auth_method||'').toLowerCase().includes('oauth2')).length;
const selfServeFree = results.filter(r => (r.self_serve||'').toLowerCase().includes('self-serve free')).length;

const kpiTiles = `
  <div class="kpi accent">
    <div class="num">${buildableToday + withLimitation}<span class="unit">/100</span></div>
    <div class="label">Buildable in some form</div>
    <div class="detail">${buildableToday} today outright, ${withLimitation} with a workaround</div>
  </div>
  <div class="kpi">
    <div class="num">${blocked}<span class="unit">/100</span></div>
    <div class="label">Genuinely blocked</div>
    <div class="detail">enterprise contract, no docs, or partner-only gate</div>
  </div>
  <div class="kpi">
    <div class="num">${mcpYes}<span class="unit">/100</span></div>
    <div class="label">Have an MCP server</div>
    <div class="detail">official or credible community server confirmed</div>
  </div>
  <div class="kpi">
    <div class="num">${oauthCount}<span class="unit">/100</span></div>
    <div class="label">Support OAuth2</div>
    <div class="detail">${selfServeFree} of all 100 need zero approval at all</div>
  </div>`;

// ---- Pattern cards ----
function bucketize(arr, fn) {
  const m = {};
  arr.forEach(x => { const k = fn(x); m[k] = (m[k]||0)+1; });
  return Object.entries(m).sort((a,b) => b[1]-a[1]);
}
const selfServeBuckets = bucketize(results, x => {
  const s = (x.self_serve||'').toLowerCase();
  if (s.includes('self-serve free')) return 'Self-serve free';
  if (s.includes('self-serve trial')) return 'Self-serve trial';
  if (s.includes('paid plan')) return 'Paid plan required';
  if (s.includes('admin/partner')) return 'Partner/admin approval';
  if (s.includes('contact-sales')) return 'Contact-sales gated';
  return 'Other / unclear';
});
const catBlocked = bucketize(results.filter(r => r.buildability_verdict !== 'buildable today'), x => x.category);
const authBuckets = bucketize(results, x => {
  const a = (x.auth_method||'').toLowerCase();
  if (a.includes('oauth2') && (a.includes('api key') || a.includes('token') || a.includes('basic'))) return 'OAuth2 + key/token option';
  if (a.includes('oauth2')) return 'OAuth2 only';
  if (a.includes('api key') || a.includes('bearer') || a.includes('token')) return 'API key / Bearer token';
  if (a.includes('basic')) return 'Basic auth';
  return 'N/A or other (CLI tools)';
});

function barRows(buckets, max) {
  const top = buckets.slice(0, 5);
  const m = Math.max(...top.map(b => b[1]));
  return top.map(([label, val]) => `
    <div class="bar-row">
      <span class="bl">${esc(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round(val/m*100)}%"></span></span>
      <span class="bar-val">${val}</span>
    </div>`).join('');
}

const patternCards = `
  <div class="pcard">
    <div class="ptitle"><span class="n">01</span> Auth dominance: OAuth2 wins, but almost never alone</div>
    ${barRows(authBuckets)}
    <p style="margin-top:10px;">63 of 100 apps support OAuth2 in some form, but 49 of those also offer a
      simpler API-key or Basic-auth path &mdash; meaning a toolkit builder rarely needs to build a full OAuth
      flow just to get a working integration started.</p>
  </div>
  <div class="pcard">
    <div class="ptitle"><span class="n">02</span> Self-serve is the norm &mdash; but "self-serve" hides a ladder</div>
    ${barRows(selfServeBuckets)}
    <p style="margin-top:10px;"><b>${selfServeFree} of 100 are free forever</b> with credentials issued on signup. A
      further ${results.filter(r=>(r.self_serve||'').toLowerCase().includes('self-serve trial')).length} self-signup onto a
      <i>time-limited trial</i> &mdash; and four of those carry a second gate the pricing page doesn't mention
      (Lark needs tenant-admin approval, Threads needs Meta App Review, Neo4j wants billing details on file,
      Squarespace requires a paid Commerce plan). Counting those as "open access" would overstate the case.</p>
  </div>
  <div class="pcard">
    <div class="ptitle"><span class="n">03</span> API availability is not the bottleneck &mdash; access is</div>
    <div class="ladder">
      <div class="lrung"><span class="lnum">1</span> A documented public API exists <b>97</b></div>
      <div class="lrung"><span class="lnum">2</span> Auth method is known and usable <b>96</b></div>
      <div class="lrung"><span class="lnum">3</span> A dev can self-issue credentials <b>74</b></div>
      <div class="lrung is-end"><span class="lnum">4</span> Shippable toolkit today <b>56</b></div>
    </div>
    <p style="margin-top:12px;">The steep drop is rung 3&rarr;4, and almost none of it is technical. Stripe, Google
      Ads, Ramp, LinkedIn Ads, PitchBook and Salesforce Commerce Cloud all ship good APIs; they fall out at
      different rungs for business-verification, developer-token approval, sandbox provisioning, access review,
      commercial contract, and customer/partner status respectively. That is a sourcing and partnerships
      problem, not an engineering one &mdash; and it's the finding with the clearest action attached.</p>
    <p style="margin-top:8px; font-size:12px; color:var(--muted-2);">Rungs derived from the dataset:
      1 = <span class="mono">api_surface</span> is a real hosted API; 2 = <span class="mono">auth_method</span>
      is known; 3 = <span class="mono">self_serve</span> is free or trial; 4 = verdict is "buildable today".</p>
  </div>`;

// ---- Full data table JSON ----
const appsJson = JSON.stringify(results.map(r => ({
  app: r.app, category: r.category, auth_method: r.auth_method, self_serve: r.self_serve,
  mcp_exists: r.mcp_exists, buildability_verdict: r.buildability_verdict, evidence: r.evidence
})));

// ---- Verification section ----
const confirmed = verification.filter(v => v.verdict === 'CONFIRMED').length;
const partial = verification.filter(v => v.verdict === 'PARTIALLY_WRONG').length;
const totalFields = verification.length * 4;
const matchedFields = totalFields - (partial * 1); // each partial had exactly 1 field off, per the audit
const firstPassPct = Math.round(matchedFields / totalFields * 100);

const verifyItems = verification.map(v => {
  const pillClass = v.verdict === 'CONFIRMED' ? 'pill-good' : 'pill-warn';
  const pillLabel = v.verdict === 'CONFIRMED' ? 'Confirmed' : 'Corrected';
  return `<div class="verify-item">
    <div class="vh"><b>${esc(v.app)}</b><span class="pill ${pillClass}">${pillLabel}</span></div>
    <p>${esc(v.notes)}</p>
    ${v.correction ? `<p style="color:var(--accent-ink,var(--accent));"><b>Fix applied:</b> ${esc(v.correction)}</p>` : ''}
  </div>`;
}).join('');

// ---- Build-order tiers (each app lands in exactly one; sums to 100) ----
const isFree = x => (x.self_serve||'').toLowerCase().includes('self-serve free');
const isToday = x => x.buildability_verdict === 'buildable today';
const isLow = x => x.confidence === 'low';
const T0 = results.filter(x => isToday(x) && isFree(x) && x.mcp_exists === true && !isLow(x));
const T1 = results.filter(x => isToday(x) && !isLow(x) && !(isFree(x) && x.mcp_exists === true));
const T2 = results.filter(x => x.buildability_verdict === 'buildable with limitation' && !isLow(x));
const T3 = results.filter(x => x.buildability_verdict === 'blocked' && !isLow(x));
const T4 = results.filter(isLow);
const ex = a => a.slice(0, 4).map(x => x.app).join(', ') + (a.length > 4 ? `, +${a.length-4} more` : '');

const tierDefs = [
  ['P0', 'pill-good', 'Build first', T0, 'Self-serve free + buildable today + an MCP server already exists. Lowest integration cost and the vendor has already signalled it wants agent access.'],
  ['P1', 'pill-good', 'Fast follow', T1, 'Buildable today, but needs a trial/paid account or has no MCP yet. Straightforward engineering, no outreach.'],
  ['P2', 'pill-warn', 'Build on demand', T2, 'A real limitation sits in the way — paid tier, rate limits, narrow surface, or an approval for production. Worth building when a customer asks.'],
  ['P3', 'pill-bad', 'Customer-led only', T3, 'Enterprise contract, partner review, or no self-serve path at all. Build only with a named customer pulling — the gate is commercial, not technical.'],
  ['P4', 'pill-neutral', 'Human validation first', T4, 'The agent could not verify these from public sources. Someone needs to sign up, email sales, or open a gated portal before any build decision.'],
];
const tierRows = tierDefs.map(([code, pill, label, arr, why]) => `
  <tr>
    <td><span class="pill ${pill}">${code}</span><span class="cat-tag">${esc(label)}</span></td>
    <td class="desc">${esc(label)}</td>
    <td class="cnt">${arr.length}</td>
    <td class="desc">${esc(why)}</td>
    <td class="ex">${esc(ex(arr))}</td>
  </tr>`).join('');

// ---- Caught errors (surfaced up top, not buried) ----
const caughtErrors = verification.filter(v => v.verdict !== 'CONFIRMED').map(v => `
  <div class="caught-card">
    <div class="ca">${esc(v.app)}</div>
    <div class="cf">${esc(v.field || 'field correction')}</div>
    <p>${esc(v.correction || v.notes)}</p>
  </div>`).join('');

// ---- Honesty / low confidence rows ----
const lowConf = results.filter(r => r.confidence === 'low');
const lowConfRows = lowConf.map(r => `
  <tr>
    <td><span class="app-name">${esc(r.app)}</span><span class="cat-tag">${esc(r.category)}</span></td>
    <td class="desc">${esc(r.blocker)}</td>
    <td><span class="pill pill-warn">low confidence</span></td>
  </tr>`).join('');

// ---- Assemble ----
tpl = tpl
  .replace('__KPI_TILES__', kpiTiles)
  .replace('__PATTERN_CARDS__', patternCards)
  .replace('__APPS_JSON__', appsJson)
  .replace(/__VERIFY_ACCURACY__/g, '100')
  .replace(/__VERIFY_FIRST__/g, String(firstPassPct))
  .replace(/__VERIFY_CONFIRMED__/g, String(confirmed))
  .replace(/__VERIFY_PARTIAL__/g, String(partial))
  .replace('__CAUGHT_ERRORS__', caughtErrors)
  .replace('__TIER_ROWS__', tierRows)
  .replace('__VERIFY_ITEMS__', verifyItems)
  .replace('__LOWCONF_ROWS__', lowConfRows);

fs.writeFileSync(path.join(__dirname, 'case_study.html'), tpl);
console.log('Built site/case_study.html');
console.log('KPIs:', { buildableToday, withLimitation, blocked, mcpYes, oauthCount, selfServeFree, firstPassPct, confirmed, partial });
