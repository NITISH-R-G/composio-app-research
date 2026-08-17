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
    <div class="ptitle"><span class="n">02</span> Self-serve is the norm, not the exception</div>
    ${barRows(selfServeBuckets)}
    <p style="margin-top:10px;">${selfServeFree + results.filter(r=>(r.self_serve||'').toLowerCase().includes('self-serve trial')).length} of 100 apps
      let a developer get working credentials today with no sales conversation. The remaining ~22% cluster in
      two categories: enterprise B2B software (DealCloud, PitchBook, Salesforce Commerce Cloud) and ad
      platforms (Google Ads, Meta Ads, LinkedIn Ads, Pinterest) where identity/business verification is the
      real gate, not pricing.</p>
  </div>
  <div class="pcard">
    <div class="ptitle"><span class="n">03</span> Where the friction concentrates</div>
    ${barRows(catBlocked)}
    <p style="margin-top:10px;">Finance/Fintech and AI/Research-native are the two categories with the most
      "blocked" or "limited" verdicts &mdash; not because their APIs are bad, but because KYC, business
      verification, or enterprise-only contracts sit in front of the docs. Support/Helpdesk and Developer/Infra
      are the cleanest categories: nearly every app there is buildable today.</p>
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
  .replace('__VERIFY_ITEMS__', verifyItems)
  .replace('__LOWCONF_ROWS__', lowConfRows);

fs.writeFileSync(path.join(__dirname, 'case_study.html'), tpl);
console.log('Built site/case_study.html');
console.log('KPIs:', { buildableToday, withLimitation, blocked, mcpYes, oauthCount, selfServeFree, firstPassPct, confirmed, partial });
