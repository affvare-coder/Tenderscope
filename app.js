'use strict';
const PROJECT_URL = 'https://agdmlgbfxoqhztiormij.supabase.co';
const API_URL = PROJECT_URL + '/rest/v1';
const KEY = 'sb_publishable_8ZPkgNORB1X60ic5LaRWxw_EevahDkr';
const H = { apikey: KEY };
const $ = id => document.getElementById(id);
const S = { all: [], filtered: [], shown: 40, docs: new Map(), products: new Map(), productsLoading: false, view: 'active', loading: false, loaded: false, lastLoadedAt: null, selected: null, detailRequest: 0, sort: 'deadline' };
const F = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const FD = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const DAY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' });
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEW = {
  active: ['All opportunities', 'Healthcare bids from official GeM sources. Delhi-only bids are in Delhi healthcare. Choose a bid to explore its documents and recorded changes.'],
  new: ['Newly discovered', 'Open healthcare bids first detected by TenderScope within the last 24 hours.'],
  updated: ['Updated opportunities', 'Open bids with a recorded change after their first publication.'],
  extended: ['Extended opportunities', 'Open bids with an extension recorded by the source monitor.'],
  closing: ['Closing soon', 'Open bids with a verified closing time within the next 72 hours.'],
  dgafms: ['DGAFMS opportunities', 'Open bids identified as DG Armed Forces Medical Services.'],
  echs: ['ECHS opportunities', 'Open Ex-Servicemen Contributory Health Scheme opportunities.'],
  dental: ['Dental opportunities', 'Open dental materials, equipment and related healthcare bids.'],
  medical: ['Medical opportunities', 'Open medical, surgical, diagnostic and hospital opportunities.'],
  pharma: ['Pharma opportunities', 'Open medicine and pharmaceutical opportunities.'],
  research: ['Research opportunities', 'Open healthcare research, AFMRC, ANV and Anveshan opportunities.'],
  delhi: ['Delhi healthcare', 'Delhi and multi-location bids that include Delhi. Location evidence and verification status are shown in each bid.'],
  multi: ['Multi-location healthcare', 'One record per bid across all its recorded locations, including Delhi where applicable.'],
  watch: ['Closed · verification watch', 'The recorded deadline has passed. A source check is needed before confirming expiry or an extension. These are not shown as open opportunities.']
};
function date(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  let text = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00+05:30';
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) text = text.replace(' ', 'T') + '+05:30';
  const result = new Date(text);
  return Number.isFinite(result.getTime()) ? result : null;
}
const time = v => date(v)?.getTime() ?? null;
const formatDate = v => date(v) ? FD.format(date(v)) : 'Not available';
const stamp = v => date(v) ? `${F.format(date(v))} IST` : 'Not recorded';
const today = () => DAY.format(new Date());
const isToday = v => !!date(v) && DAY.format(date(v)) === today();
const firstSeen = t => t.first_seen_at || t.first_detected_at || t.created_at;
const recentlyDiscovered = t => time(firstSeen(t)) !== null && time(firstSeen(t)) <= Date.now() && Date.now() - time(firstSeen(t)) < 86400000;
const list = v => Array.isArray(v) ? v : (v ? [String(v)] : []);
const exactDeadline = t => t.closing_time_verified !== false && t.deadline_precision !== 'date_only' && !!date(t.deadline);
function deadlineTime(t) {
  if (!exactDeadline(t) && /^\d{4}-\d{2}-\d{2}$/.test(t.closing_date || '')) return time(`${t.closing_date}T23:59:59.999+05:30`);
  return time(t.deadline);
}
const hrs = t => deadlineTime(t) === null ? null : (deadlineTime(t) - Date.now()) / 36e5;
const money = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : 'Not published';
const haystack = t => [t.bid_number, t.title, t.buyer, t.location, t.category, t.subcategory, t.pvms, ...list(t.matched_keywords),...list(S.products.get(t.id)?.item_names)].filter(Boolean).join(' ').toLowerCase();
const defence = t => !!t.defence || /army|navy|air force|dg armed|defence|military/i.test(`${t.buyer || ''} ${t.title || ''}`);
const deadline = t => exactDeadline(t) ? stamp(t.deadline) : `${formatDate(t.closing_date || t.deadline)} · time pending`;
function officialUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (u.hostname === 'gem.gov.in' || u.hostname.endsWith('.gem.gov.in')) ? u.href : null;
  } catch { return null; }
}
function lifecycle(t) {
  const state = String(t.lifecycle_state || t.lifecycle_status || '').toUpperCase();
  if (['CLOSED_PENDING_VERIFICATION', 'OPENED', 'EXPIRED', 'CANCELLED', 'EXCLUDED'].includes(state)) return state;
  const status = String(t.status || '').toLowerCase();
  if (['cancelled', 'expired', 'opened', 'excluded'].includes(status)) return status.toUpperCase();
  if (status === 'closed_pending_verification') return 'CLOSED_PENDING_VERIFICATION';
  const h = hrs(t);
  if (h !== null && h <= 0) return 'CLOSED_PENDING_VERIFICATION';
  return h !== null && h <= 72 && exactDeadline(t) ? 'CLOSING_SOON' : 'ACTIVE';
}
const lifecycleLabel = t => ({ ACTIVE: 'Active', CLOSING_SOON: 'Closing soon', CLOSED_PENDING_VERIFICATION: 'Closed · verify', OPENED: 'Opened', EXPIRED: 'Expired', CANCELLED: 'Cancelled', EXCLUDED: 'Excluded' }[lifecycle(t)] || 'Status pending');
const active = t => ['ACTIVE', 'CLOSING_SOON'].includes(lifecycle(t));
const eligibleRecord = t => !/\/R\//i.test(t.bid_number || '') && String(t.status).toLowerCase() !== 'excluded' && lifecycle(t) !== 'EXCLUDED';
const extended = t => t.is_extended === true || Number(t.extension_count) > 0;
const eventCode = t => String(t.last_event_code || t.last_event_type || '').toUpperCase();
const updated = t => !!eventCode(t) && !['NEW_BID', 'NEW', 'PUBLISHED', 'DISCOVERED', 'INITIAL_IMPORT', 'IMPORTED', 'UNCHANGED', 'CHECKED'].includes(eventCode(t));
function matchesView(t, view) {
  if (!eligibleRecord(t)) return false;
  if (view === 'delhi') return active(t) && (t.location_class === 'DELHI' || (t.location_class === 'MULTI_LOCATION' && t.location_includes_delhi));
  if (view === 'multi') return active(t) && t.location_class === 'MULTI_LOCATION';
  if (t.location_class === 'DELHI') return false;
  if (view === 'watch') return lifecycle(t) === 'CLOSED_PENDING_VERIFICATION';
  if (!active(t)) return false;
  const text = haystack(t);
  if (view === 'new') return recentlyDiscovered(t);
  if (view === 'updated') return updated(t);
  if (view === 'extended') return extended(t);
  if (view === 'closing') return exactDeadline(t) && hrs(t) !== null && hrs(t) > 0 && hrs(t) <= 72;
  if (view === 'dgafms') return /\bdgafms\b|dg armed|armed forces medical/.test(text);
  if (view === 'echs') return /\bechs\b|ex.servicemen contributory health/.test(text);
  if (view === 'dental') return /\bdental\b|endodont|orthodont|periodont/.test(text);
  if (view === 'medical') return /\bmedical\b|surgic|diagnostic|hospital|\bicu\b|clinical/.test(text);
  if (view === 'pharma') return /pharma|medicin|\bdrug\b|\bdrugs\b|vaccine/.test(text);
  if (view === 'research') return /research|\bafmrc\b|\banv\b|anveshan/.test(text);
  return true;
}
function valueLabel(t) {
  const basis = String(t.value_basis || '').toLowerCase();
  if (t.estimated_value_inr == null || basis === 'unavailable') return 'Bid value';
  if (!basis) return 'Value · basis unverified';
  if (/^(buyer_declared|published|official|buyer|buyer_published|published_value|official_bid_value)$/.test(basis)) return 'Buyer published value';
  return basis === 'indicative' || /estimate|emd|turnover/.test(basis) ? 'TenderScope planning estimate' : 'Value · basis unverified';
}
function changeLabel(code) {
  const labels = { STATUS_CHANGED: 'Status changed', CLOSING_DATE_CHANGED: 'Closing date changed', OPENING_DATE_CHANGED: 'Opening date changed', BID_DOCUMENT_CHANGED: 'Bid document changed', ATC_CHANGED: 'ATC changed', BOQ_CHANGED: 'BOQ changed', SPECIFICATION_CHANGED: 'Specification changed', CORRIGENDUM: 'Corrigendum recorded', NEW_BID: 'New bid detected', BID_UPDATED: 'Bid updated', UPDATED: 'Bid updated', DEADLINE_EXTENDED: 'Deadline extended', EXTENDED: 'Deadline extended', DEADLINE_CHANGED: 'Deadline changed', DEADLINE_SHORTENED: 'Deadline brought forward', DOCUMENT_ADDED: 'Document added', DOCUMENT_CHANGED: 'Document changed', DOCUMENT_UPDATED: 'Document updated', DOCUMENT_REMOVED: 'Document removed', CLOSED_PENDING_VERIFICATION: 'Deadline passed · verify', CANCELLED: 'Bid cancelled', OPENED: 'Bid opened', EXPIRED: 'Expiry confirmed', REOPENED: 'Bid reopened' };
  return labels[String(code || '').toUpperCase()] || String(code || 'No recorded change').replace(/_/g, ' ').toLowerCase();
}
async function api(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(API_URL + path, { headers: H, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (HTTP ${response.status})`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection timed out');
    if (error instanceof TypeError) throw new Error('The data service could not be reached');
    throw error;
  } finally { clearTimeout(timeout); }
}
async function pages(path, size = 500) {
  const rows = [];
  for (let offset = 0; ; offset += size) {
    const page = await api(`${path}&limit=${size}&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error('Unexpected database response');
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}
const SNAPSHOT_KEY = 'tenderscope.public-register.v1';
function restoreRegister() {
  try {
    const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    if (!saved || !Array.isArray(saved.rows) || !saved.rows.length || !time(saved.savedAt) || Date.now() - time(saved.savedAt) > 86400000 || time(saved.savedAt) > Date.now()) return false;
    S.all = saved.rows.filter(t => t && typeof t.id === 'string' && typeof t.bid_number === 'string' && eligibleRecord(t));
    if (!S.all.length) return false;
    S.loaded = true; S.lastLoadedAt = saved.savedAt;
    categories(); kpis(); filter();
    $('errorState').hidden = false;
    $('errorState').textContent = `Showing the last loaded register from ${stamp(saved.savedAt)} while reconnecting. Check each bid’s source timestamp before relying on it.`;
    return true;
  } catch { return false; }
}
function saveRegister() {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({savedAt:S.lastLoadedAt, rows:S.all})); }
  catch { /* Storage may be disabled or full; live loading still works. */ }
}
async function load({ quiet = false } = {}) {
  if (S.loading) return;
  S.loading = true;
  $('refreshBtn').disabled = true;
  if (!S.loaded) restoreRegister();
  if (!quiet && !S.loaded) $('loadingState').hidden = false;
  // Monitoring must not hold the bid list behind a second, slower request.
  api('/rpc/phase1_health').then(value => renderHealth(value), error => renderHealth(null, error.message));
  try {
    const rows = await api('/rpc/public_tender_register?p_limit=200&p_offset=0');
    S.all = [...new Map(rows.map(t => [t.id, t])).values()].filter(eligibleRecord);
    S.docs.clear(); S.loaded = true; S.lastLoadedAt = new Date().toISOString();
    saveRegister();
    $('errorState').hidden = true;
    categories(); kpis(); filter({ preserveShown: quiet });
    loadProductSummaries();
    $('screenRefresh').textContent = `Screen refreshed ${stamp(S.lastLoadedAt)}. Automatic refresh every hour while this page is visible.`;
    if (S.selected && $('bidDialog').open) {
      if (byId(S.selected.id)) await openBid(S.selected.id, {updateLocation:false, preserveView:true});
      else $('detailFeedback').textContent = 'This bid is no longer in the public register. Check the official GeM source for its status.';
    } else await openFromLocation();
  } catch (error) {
    $('errorState').hidden = false;
    $('errorState').textContent = `${S.loaded ? `Refresh failed. Showing the register last loaded ${stamp(S.lastLoadedAt)}; freshness is not confirmed.` : 'Bid data is temporarily unavailable. This does not mean there are no bids.'} ${error.message}. Refresh will retry automatically.`;
    $('screenRefresh').textContent = 'Screen refresh failed. Automatic retries continue while this page is visible.';
    if (!S.loaded) { kpis(); render(); $('resultCount').textContent = 'Bid data unavailable'; }
  } finally {
    $('loadingState').hidden = true;
    $('refreshBtn').disabled = false;
    S.loading = false;
  }
}
function renderHealth(raw, error = '') {
  const health = Array.isArray(raw) ? raw[0] : raw;
  const mappings = { lastGemContact: 'last_gem_contact', lastHourlySync: 'last_hourly_sync', lastDeepSync: 'last_deep_sync', lastDailySync: 'last_daily_sync' };
  Object.entries(mappings).forEach(([id, key]) => $(id).textContent = stamp(health?.[key]));
  const contact = time(health?.last_gem_contact);
  const stale = contact === null || Date.now() - contact > 2 * 36e5;
  const status = String(health?.status || 'unknown').toLowerCase();
  const bad = /fail|error|block|degrad|partial|unavailable/.test(status) || Number(health?.failures) > 0;
  const healthy = health && !bad && !stale;
  const label = !health ? 'Status unavailable' : bad ? 'Source checks need attention' : stale ? 'Fresh check pending' : 'Source contact recorded';
  $('headerStatus').textContent = label;
  $('statusDot').className = `live-dot ${healthy ? '' : 'checking'}`;
  $('syncStatus').textContent = label;
  $('syncStatus').className = `badge ${healthy ? 'verified' : 'pending'}`;
  $('syncMessage').textContent = !health ? `Monitor status could not be loaded. ${error}. No successful source contact is assumed.` : bad ? `Monitor reports ${status.replace(/_/g, ' ')}. Existing records remain available; check official GeM documents for current conditions.` : stale ? 'No successful GeM contact is recorded within the last two hours. Bid freshness is not confirmed.' : 'Source timestamps below are reported by the monitor. A screen refresh alone does not mean GeM was checked.';
  const coverage = health?.coverage ? Object.entries(health.coverage).map(([mode,run])=>`${mode}: ${run.stats?.completed_lanes ?? 0}/${run.stats?.total_lanes || '…'} searches completed${run.stats?.coverage_errors ? `, ${run.stats.coverage_errors} awaiting retry` : ''}`).join(' · ') : '';
  $('coverageProgress').textContent=coverage;
  $('syncCounts').textContent = health ? `Latest reported counts · scanned: ${health.records_scanned ?? '—'} · new: ${health.new_bids ?? '—'} · updated: ${health.updated_bids ?? '—'} · extended: ${health.extended_bids ?? '—'} · failed checks: ${health.failures ?? '—'}` : '';
}
function categories() {
  const current = $('categoryFilter').value;
  const values = [...new Set(S.all.map(t => t.subcategory || t.category).filter(Boolean))].sort();
  $('categoryFilter').innerHTML = '<option value="">All categories</option>' + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if (values.includes(current)) $('categoryFilter').value = current;
}
function kpis() {
  const live = S.all.filter(t => matchesView(t, 'active'));
  $('kpiLive').textContent = S.loaded ? live.length.toLocaleString('en-IN') : '—';
  $('kpiUrgent').textContent = S.loaded ? live.filter(t => matchesView(t, 'closing')).length.toLocaleString('en-IN') : '—';
  $('kpiDefence').textContent = S.loaded ? live.filter(defence).length.toLocaleString('en-IN') : '—';
  $('kpiNewToday').textContent = S.loaded ? live.filter(recentlyDiscovered).length.toLocaleString('en-IN') : '—';
  document.querySelectorAll('[data-view]').forEach(button => {
    button.querySelector('.nav-count').textContent = S.loaded ? S.all.filter(t => matchesView(t, button.dataset.view)).length.toLocaleString('en-IN') : '—';
    button.classList.toggle('active', button.dataset.view === S.view);
    button.setAttribute('aria-pressed', String(button.dataset.view === S.view));
  });
}
function filter({ preserveShown = false } = {}) {
  const q = $('searchInput').value.trim().toLowerCase(), p = $('priorityFilter').value, c = $('categoryFilter').value, u = $('urgencyFilter').value, d = $('defenceFilter').value, tm = $('timeFilter').value;
  S.filtered = S.all.filter(t => {
    const h = hrs(t), df = defence(t), cat = t.subcategory || t.category;
    return matchesView(t, S.view) && (!q || haystack(t).includes(q)) && (!p || String(t.priority || '').startsWith(p)) && (!c || cat === c) && (!u || (exactDeadline(t) && h !== null && h > 0 && ((u === 'critical' && h < 24) || (u === '72' && h <= 72) || (u === '7d' && h <= 168)))) && (!d || (d === 'yes' && df) || (d === 'no' && !df)) && (!tm || (tm === 'verified' && exactDeadline(t)) || (tm === 'pending' && !exactDeadline(t)));
  }).sort((a, b) => S.sort === 'newest' ? (time(firstSeen(b)) || 0) - (time(firstSeen(a)) || 0) : S.sort === 'updated' ? (time(b.latest_change_at) || 0) - (time(a.latest_change_at) || 0) : S.sort === 'value' ? (Number(b.estimated_value_inr) || -1) - (Number(a.estimated_value_inr) || -1) : (deadlineTime(a) ?? Infinity) - (deadlineTime(b) ?? Infinity));
  const count = [p,c,u,d,tm].filter(Boolean).length;
  $('filterCount').hidden = !count; $('filterCount').textContent = count;
  $('filterSummary').hidden = !count && !q;
  $('filterSummary').innerHTML = `${count ? `${count} filter${count === 1 ? '' : 's'} applied` : ''}${count && q ? ' · ' : ''}${q ? `Search: “${esc($('searchInput').value.trim())}”` : ''}<button type="button" data-action="clear-filters">Clear all</button>`;
  if (!preserveShown) S.shown = 40;
  render();
}
function sourceLink(url, label, className = 'btn ghost') {
  const safe = officialUrl(url);
  return safe ? `<a class="${className}" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '<span class="unavailable-link">Official link unavailable</span>';
}
async function loadProductSummaries() {
  if(S.productsLoading)return; S.productsLoading=true;
  try { const rows=await pages('/tender_product_summary?select=*&order=tender_id.asc'); S.products=new Map(rows.map(r=>[r.tender_id,r])); filter({preserveShown:true}); }
  catch { /* Existing bids remain usable if enrichment is unavailable. */ }
  finally { S.productsLoading=false; }
}
function productPreview(t) {
  const summary=S.products.get(t.id);
  if(!summary?.item_names?.length)return '<div class="product-preview pending"><strong>Products required</strong><span>Products processing</span></div>';
  const names=summary.item_names.slice(0,5),remaining=Math.max(0,Number(summary.item_count)-names.length);
  return `<div class="product-preview"><strong>Products required</strong><ul>${names.map(name=>`<li>${esc(name)}</li>`).join('')}</ul>${remaining?`<button class="text-btn" data-action="detail" data-id="${esc(t.id)}">+${remaining} more</button>`:''}<small>Official BOQ · ${Number(summary.item_count)} item rows</small></div>`;
}
function locationPanel(t) {
 const evidence=t.location_evidence||{},verified=evidence.verification==='OFFICIAL_FACT';
 return `<section class="detail-section location-evidence"><h3>Location evidence</h3><p><strong>${esc(t.location||'Not recorded')}</strong> · ${esc((t.location_class||'UNKNOWN').replaceAll('_',' '))}</p><p class="section-note">${verified?'Official location field checked':'UNVERIFIED · Recorded location needs an official source recheck'}${evidence.observed_at?' · '+esc(stamp(evidence.observed_at)):''}</p>${sourceLink(evidence.source_url||t.source_url,'Open location source ↗','timeline-source')}</section>`;
}
function productsPanel(items,documents=[]) {
 const current=items.filter(item=>documents.some(d=>d.official_url===item.source_url && d.availability==='available' && d.content_hash===item.source_hash));
 if(!current.length)return '<p class="section-note">Products processing. Exact quantities, packs and specifications will appear after the official BOQ is read. Open the official documents below in the meantime.</p>';
 current.sort((a,b)=>String(a.item_number||'').localeCompare(String(b.item_number||''),'en',{numeric:true}));
 return `<p class="section-note">OFFICIAL FACT · ${current.length} BOQ rows. Packs and PVMS/NIV remain unverified where the source has no dedicated field. Read the buyer specification for packaging details.</p><div class="products-table-wrap"><table class="products-table"><thead><tr><th>Item / PVMS / NIV</th><th>Qty / unit</th><th>Pack</th><th>Buyer specification</th></tr></thead><tbody>${current.map(item=>`<tr><td><strong>${esc(item.item_number)}. ${esc(item.name)}</strong><small>PVMS: ${esc(item.pvms||'Not specified')} · NIV: ${esc(item.niv||'Not specified')}</small></td><td>${esc(item.quantity??'Not specified')}<small>${esc(item.unit||'Not specified')}</small></td><td>${esc(item.pack||'Not specified')}</td><td>${esc(item.specification||'Not specified')}<small>${sourceLink(item.source_url,'Official BOQ ↗','timeline-source')}</small></td></tr>`).join('')}</tbody></table></div>`;
}
function card(t) {
  const h = hrs(t), risk = list(t.risk_flags)[0], verified = exactDeadline(t), state = lifecycle(t);
  const countdown = state === 'CLOSED_PENDING_VERIFICATION' ? 'Verification pending' : !active(t) ? lifecycleLabel(t) : !verified ? 'Time pending' : h === null ? 'Date pending' : h < 1 ? 'Less than 1h left' : h < 24 ? `${Math.ceil(h)}h remaining` : `${Math.ceil(h / 24)} days remaining`;
  const urgent = active(t) && verified && h !== null && h <= 72;
  const category = t.subcategory || t.category || 'Healthcare';
  return `<article class="tender-card"><div class="card-top"><div><div class="bid-meta"><span class="bid-no">${esc(t.bid_number)}</span><span class="bid-dot" aria-hidden="true"></span><span class="category-label">${esc(category)}</span></div><h3><button class="title-button" data-action="detail" data-id="${esc(t.id)}">${esc(t.title)}</button></h3><div class="buyer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4"/></svg><span>${esc(t.buyer || 'Buyer not recorded')}</span>${t.location ? `<span class="buyer-separator" aria-hidden="true">·</span><span>${esc(t.location)}</span>` : ''}</div></div><div class="deadline ${urgent ? 'urgent' : !active(t) ? 'pending' : ''}"><span class="deadline-label">Closing date</span><strong>${esc(deadline(t))}</strong><small>${urgent ? '<span aria-hidden="true">◷</span>' : ''}${esc(countdown)}</small></div></div><div class="badges"><span class="badge ${active(t) ? 'verified' : 'pending'}">${esc(lifecycleLabel(t))}</span>${defence(t) ? '<span class="badge defence">Defence</span>' : ''}${t.priority ? `<span class="badge ${String(t.priority).startsWith('A1') ? 'a1' : 'a2'}">Priority ${esc(t.priority)}</span>` : ''}<span class="badge ${verified ? 'verified' : 'pending'}">${verified ? 'Exact deadline verified' : 'Closing time pending'}</span>${extended(t) ? `<span class="badge extended">Deadline extended${Number(t.extension_count) > 0 ? ` · ${Number(t.extension_count)}` : ''}</span>` : ''}${recentlyDiscovered(t) ? '<span class="badge">Newly discovered</span>' : ''}</div>${extended(t) ? `<div class="extension-line"><strong>Extension recorded</strong><span>Previous: ${esc(stamp(t.previous_deadline))}</span><span>Current: ${esc(deadline(t))}</span></div>` : ''}${risk ? `<div class="risk-line">${esc(risk)}</div>` : ''}${productPreview(t)}<div class="card-bottom"><div class="card-facts"><div class="mini-fact"><span>${esc(valueLabel(t))}</span><strong class="${t.estimated_value_inr == null ? 'not-published' : ''}">${money(t.estimated_value_inr)}</strong></div><div class="mini-fact"><span>EMD</span><strong class="${t.emd_inr == null ? 'not-published' : ''}">${money(t.emd_inr)}</strong></div><div class="mini-fact"><span>Bid to RA</span><strong>${esc(t.bid_to_ra ?? 'Not verified')}</strong></div></div><div class="card-actions"><button class="btn ai" data-action="ai" data-id="${esc(t.id)}" title="Open ChatGPT with this bid’s details">✦ Ask AI</button>${sourceLink(t.source_url, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg><span class="sr-only">Open official GeM source</span>', 'btn source-mini')}<button class="btn primary" data-action="detail" data-id="${esc(t.id)}">View bid <span aria-hidden="true">↗</span></button></div></div><div class="record-meta"><span>Published ${formatDate(t.published_at)}</span><span>Source checked ${esc(stamp(t.last_source_checked_at || t.last_observed_at))}</span>${updated(t) ? `<span>${esc(changeLabel(eventCode(t)))}</span>` : ''}</div></article>`;
}
function render() {
  $('viewHeading').textContent = VIEW[S.view][0];
  $('viewDescription').textContent = VIEW[S.view][1];
  if (!S.loaded) {
    $('resultCount').textContent = S.loading ? 'Loading the healthcare register…' : 'Bid data unavailable';
    $('tenderList').innerHTML = ''; $('loadMoreBtn').hidden = true; $('exportBtn').disabled = true;
    return;
  }
  const sortLabel = { deadline: 'closing date first', newest: 'newest discovered first', updated: 'latest change first', value: 'highest recorded value first' }[S.sort];
  $('resultCount').textContent = `${S.filtered.length.toLocaleString('en-IN')} ${S.view === 'watch' ? 'bids awaiting verification' : (S.filtered.length === 1 ? 'opportunity' : 'opportunities')} · ${sortLabel}`;
  $('tenderList').innerHTML = S.filtered.slice(0, S.shown).map(card).join('') || `<div class="empty-card"><div class="empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/></svg></div><h3>No opportunities in this view</h3><p>${$('searchInput').value || ['priorityFilter','categoryFilter','urgencyFilter','defenceFilter','timeFilter'].some(id => $(id).value) ? 'Try a wider search or clear your filters to see more healthcare bids.' : 'There are no matching records at the moment. Explore all opportunities or check back after the next source update.'}</p><button type="button" class="btn" data-action="clear-filters">Reset filters</button> <button type="button" class="btn primary" data-action="all-bids">See all opportunities</button></div>`;
  $('loadMoreBtn').hidden = S.shown >= S.filtered.length;
  $('exportBtn').disabled = !S.loaded || !S.filtered.length;
}
async function docs(id) {
  if (S.docs.has(id)) return S.docs.get(id);
  const result = await pages(`/tender_documents?select=*&tender_id=eq.${encodeURIComponent(id)}&order=kind.asc,id.asc`);
  S.docs.set(id, result);
  return result;
}
const byId = id => S.all.find(t => t.id === id) || (S.selected?.id === id ? S.selected : null);
function docPanel(documents) {
  if (!documents.length) return '<div class="detail-summary">No official attachments are recorded for this bid yet. Check the GeM source document for the current attachment list.</div>';
  return `<div class="doc-grid">${documents.map(doc => {
    const safe = officialUrl(doc.official_url), removed = doc.availability === 'removed';
    const state = doc.availability || doc.link_status || 'Not checked';
    return `<article class="doc-record"><div class="doc-title">${esc(doc.title || doc.filename || doc.kind || 'Document')}</div><div class="doc-meta">${esc(doc.kind || 'attachment')} · Version ${esc(doc.version_no ?? 'not recorded')} · ${esc(state)}</div><div class="doc-meta">Checked: ${esc(stamp(doc.last_checked_at || doc.observed_at))}</div>${safe && !removed ? `<div class="doc-actions"><a class="btn ghost" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">Open source ↗</a><button type="button" class="btn download-btn" data-action="download" data-document-id="${esc(doc.id)}" data-filename="${esc(doc.filename || doc.title || doc.kind || 'document')}">${AUTH.session ? 'Download ↓' : 'Log in to download ↓'}</button></div>` : `<p class="doc-meta">${removed ? 'This document was marked as removed at the source.' : 'A valid official GeM link is not available.'}</p>`}</article>`;
  }).join('')}</div><p class="section-note">Member downloads save a copy from the official source. GeM may restrict access or update a document after it was last checked.</p>`;
}
function eventValue(value) {
  if (value == null) return '';
  if (typeof value !== 'object') {
    const text=String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text) && date(text)) return stamp(text);
    return text.replace(/_/g,' ').toLowerCase();
  }
  const hidden=new Set(['id','document_id','tender_id','content_hash','official_url','source_url','document_key']);
  return Object.entries(value).filter(([key])=>!hidden.has(key)).map(([key, val]) => `${key.replace(/_/g, ' ')}: ${val == null ? 'not recorded' : eventValue(val)}`).join(' · ');
}
function timelinePanel(events) {
  if (!events.length) return '<div class="detail-summary">No recorded activity is available yet. A deadline passing does not confirm the tender’s final status.</div>';
  return `<ol class="timeline">${events.map(event => `<li><div><strong>${esc(changeLabel(event.event_code || event.event_type))}</strong><time>${esc(stamp(event.detected_at))}</time></div>${event.previous_value != null ? `<p><span>Previous</span> ${esc(eventValue(event.previous_value))}</p>` : ''}${event.new_value != null ? `<p><span>New</span> ${esc(eventValue(event.new_value))}</p>` : ''}${event.summary || event.description || event.reason ? `<p>${esc(event.summary || event.description || event.reason)}</p>` : ''}${officialUrl(event.source_url) ? sourceLink(event.source_url, 'Source ↗', 'timeline-source') : ''}</li>`).join('')}</ol>`;
}
function versionsPanel(versions) {
  versions = versions.map(v => ({...v.snapshot, ...v}));
  if (!versions.length) return '<p class="section-note">No earlier document versions have been recorded.</p>';
  return `<div class="versions-list">${versions.map(version => `<div><strong>${esc(version.filename || version.title || version.document_key || 'Document')} · v${esc(version.version_no ?? '?')}</strong><span>${esc(stamp(version.detected_at || version.created_at || version.first_detected_at))}${version.content_hash ? ' · Content hash recorded' : ' · Content comparison not recorded'}</span>${officialUrl(version.official_url) ? sourceLink(version.official_url, 'Source URL ↗', 'timeline-source') : ''}</div>`).join('')}</div><p class="section-note">Version records show observed changes. A source URL may now serve the latest file; it is not a stored copy of the earlier document.</p>`;
}
async function openBid(id, { updateLocation = true, preserveView = false } = {}) {
  const t = byId(id);
  if (!t) return;
  const sameBid=preserveView&&S.selected?.id===id;
  const scrollTop=sameBid?$('bidDialog').scrollTop:0;
  const versionsOpen=sameBid&&!!$('detailVersions')?.closest('details')?.open;
  const priorPanels=sameBid?Object.fromEntries(['detailProducts','detailDocuments','detailTimeline','detailVersions'].map(key=>[key,$(key)?.innerHTML||''])):{};
  S.selected = t; S.docs.delete(id);
  const request = ++S.detailRequest;
  $('detailBidNo').textContent = t.bid_number;
  $('detailTitle').textContent = t.title;
  const isEstimate = valueLabel(t) === 'TenderScope planning estimate';
  $('detailBody').innerHTML = `<div class="detail-actions"><button type="button" class="btn ghost" data-action="refresh-detail" data-id="${esc(t.id)}">Refresh bid</button><button type="button" class="btn ghost" data-action="copy-link" data-id="${esc(t.id)}">Copy bid link</button>${sourceLink(t.source_url, 'Official GeM source ↗')}</div><p id="detailFeedback" class="section-note" role="status"></p><section class="detail-section"><h3>Bid intelligence snapshot</h3><div class="detail-summary">${esc(t.analysis_summary || 'Analysis pending direct specification review.')}</div></section><section class="detail-section"><h3>Products required</h3><div id="detailProducts" aria-live="polite"><p class="section-note">Products processing…</p></div></section>${locationPanel(t)}<section class="detail-section"><h3>Closing & source verification</h3><div class="card-grid"><div class="fact"><span>Status</span><strong>${esc(lifecycleLabel(t))}</strong></div><div class="fact"><span>Closing</span><strong>${esc(deadline(t))}</strong></div><div class="fact"><span>Bid to RA</span><strong>${esc(t.bid_to_ra ?? 'Not verified')}</strong></div><div class="fact"><span>${esc(valueLabel(t))}</span><strong>${money(t.estimated_value_inr)}</strong></div><div class="fact"><span>EMD</span><strong>${money(t.emd_inr)}</strong></div><div class="fact"><span>Last source check</span><strong>${esc(stamp(t.last_source_checked_at))}</strong></div><div class="fact"><span>Priority</span><strong>${esc(t.priority || 'Not assigned')}</strong></div><div class="fact"><span>PVMS</span><strong>${esc(t.pvms || 'Not specified')}</strong></div></div>${isEstimate ? '<p class="section-note">TenderScope planning estimates are not buyer-declared contract values.</p>' : ''}${extended(t) ? `<div class="extension-line"><strong>${Number(t.extension_count) || 1} recorded extension(s)</strong><span>Previous deadline: ${esc(stamp(t.previous_deadline))}</span><span>Current deadline: ${esc(deadline(t))}</span></div>` : ''}${lifecycle(t) === 'CLOSED_PENDING_VERIFICATION' ? '<div class="risk-line">The recorded deadline has passed. This bid remains on verification watch until a source check confirms its status.</div>' : ''}</section>${list(t.risk_flags).length ? `<section class="detail-section"><h3>Risk flags</h3><div class="detail-risk">${list(t.risk_flags).map(risk => `<span class="badge pending">${esc(risk)}</span>`).join('')}</div></section>` : ''}${t.recommended_action ? `<section class="detail-section"><h3>Next action</h3><div class="detail-summary">${esc(t.recommended_action)}</div></section>` : ''}<section class="detail-section"><h3>Official documents</h3><div id="detailDocuments" aria-live="polite"><p class="section-note">Loading document records…</p></div></section><section class="detail-section"><h3>Activity timeline</h3><div id="detailTimeline" aria-live="polite"><p class="section-note">Loading recorded changes…</p></div></section><section class="detail-section"><details><summary>Document version history</summary><div id="detailVersions"><p class="section-note">Loading version records…</p></div></details></section><p class="private-channel"><strong>Seller updates:</strong> Private buyer messages and seller representations are not connected. Check your GeM seller account for account-specific communications.</p><section class="ai-panel"><h3>Read this bid with ChatGPT</h3><p>Open ChatGPT with this bid’s details and recorded official links. Ask it to read the sources before assessing compliance.</p><button class="btn" data-action="ai" data-id="${esc(t.id)}">✦ Ask about this bid</button></section>`;
  Object.entries(priorPanels).forEach(([key,html])=>{if(html)$(key).innerHTML=html;});
  if(versionsOpen)$('detailVersions').closest('details').open=true;
  if (!$('bidDialog').open) $('bidDialog').showModal();
  $('bidDialog').scrollTop=scrollTop;
  if (updateLocation) history.replaceState(null, '', `${location.pathname}${location.search}#bid=${encodeURIComponent(t.bid_number)}`);
  const responses = await Promise.allSettled([
    docs(id),
    pages(`/tender_events?select=*&tender_id=eq.${encodeURIComponent(id)}&order=detected_at.desc,id.desc`),
    pages(`/tender_document_versions?select=*&tender_id=eq.${encodeURIComponent(id)}&order=version_no.desc,id.desc`),
    pages(`/tender_items?select=*&tender_id=eq.${encodeURIComponent(id)}&is_current=eq.true&order=item_key.asc`)
  ]);
  if (request !== S.detailRequest || S.selected?.id !== id) return;
  $('detailProducts').innerHTML=responses[3].status==='fulfilled'&&responses[0].status==='fulfilled'?productsPanel(responses[3].value,responses[0].value):'<p class="section-note">Product rows could not load. Reopen the bid to retry; official documents remain available.</p>';
  $('detailFeedback').textContent = `Refreshed ${stamp(new Date())}. Bid details and documents update automatically every minute.`;
  [['detailDocuments', docPanel], ['detailTimeline', timelinePanel], ['detailVersions', versionsPanel]].forEach(([target, renderer], index) => {
    const result = responses[index];
    $(target).innerHTML = result.status === 'fulfilled' ? renderer(result.value) : `<div class="error-card">${['Document records', 'Activity timeline', 'Document version history'][index]} could not be loaded. ${esc(result.reason.message)}. Close and reopen this bid to retry.</div>`;
  });
}
function askBid(id) {
  const t = byId(id); if (!t) return;
  const documents = S.docs.get(id) || [];
  const links = [...new Set([t.source_url, ...documents.map(doc => doc.official_url)].map(officialUrl).filter(Boolean))];
  const productContext=S.products.get(id);
  const text = `First provide a BID INTELLIGENCE SNAPSHOT using verified sources. Products in stored official BOQ: ${productContext?.item_names?.join('; ')||'Products processing'} (${productContext?.item_count??'unknown'} rows). Location: ${t.location||'Unknown'}; location verification: ${t.location_evidence?.verification||'UNVERIFIED'}.\nRead and analyze GeM Bid ${t.bid_number}: ${t.title}. Buyer: ${t.buyer || 'not recorded'}. Closing: ${deadline(t)}. Recorded lifecycle: ${lifecycleLabel(t)}. Last source check: ${stamp(t.last_source_checked_at)}. Read the official links and current bid conditions before answering. Do not invent missing facts. Explain eligibility, turnover/experience, MSME relaxations, EMD/ePBG, OEM authorization, Make in India, Bid-to-RA, specifications, required documents, restrictive clauses, risks, possible OEM matches and next actions. Official links:\n${links.join('\n') || 'No verified official links available; request the bid document.'}${!S.docs.has(id) ? '\nThe attachment index has not been loaded in this view. Retrieve attachments from the official bid document.' : ''}`;
  window.open('https://chatgpt.com/?q=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
}
async function openFromLocation() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const requested = hash.get('bid') || new URLSearchParams(location.search).get('bid');
  if (!requested) return;
  let t = S.all.find(row => row.bid_number === requested || row.id === requested);
  if (!t && /^GEM\/\d{4}\/B\/\d+$/i.test(requested)) {
    try {
      const rows = await api(`/tenders?select=*&bid_number=eq.${encodeURIComponent(requested)}&limit=1`);
      if (rows[0] && eligibleRecord(rows[0])) { t = rows[0]; S.all.push(t); }
    } catch {
      $('errorState').hidden = false;
      $('errorState').textContent = 'This bid link could not be loaded. Refresh to retry.';
      return;
    }
  }
  if (t) await openBid(t.id, { updateLocation: false });
  else { $('errorState').hidden = false; $('errorState').textContent = 'The linked bid is not available in the current public register.'; }
}
async function handleAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'detail') await openBid(id);
  else if (button.dataset.action === 'refresh-detail') await load({quiet:true});
  else if (button.dataset.action === 'ai') askBid(id);
  else if (button.dataset.action === 'download') await requestMemberAction({kind:'download',document_id:button.dataset.documentId,filename:button.dataset.filename});
  else if (button.dataset.action === 'clear-filters') resetFilters();
  else if (button.dataset.action === 'all-bids') { resetFilters(); selectView('active'); }
  else if (button.dataset.action === 'copy-link') {
    const bid = byId(id); if (!bid) return;
    const link = `${location.origin}${location.pathname}#bid=${encodeURIComponent(bid.bid_number)}`;
    try { await navigator.clipboard.writeText(link); $('detailFeedback').textContent = 'Bid link copied.'; }
    catch { $('detailFeedback').textContent = `Copy this bid link: ${link}`; }
  }
}
function selectView(view) {
  S.view = VIEW[view] ? view : 'active';
  S.sort = ['updated','extended'].includes(S.view) ? 'updated' : S.view === 'new' ? 'newest' : 'deadline';
  $('sortOrder').value = S.sort;
  kpis(); filter(); closeSidebar();
}
function resetFilters() {
  $('searchInput').value = '';
  ['priorityFilter', 'categoryFilter', 'urgencyFilter', 'defenceFilter', 'timeFilter'].forEach(id => $(id).value = '');
  filter();
}
function closeSidebar() {
  $('sidebar').classList.remove('is-open'); $('sidebarBackdrop').hidden = true;
  $('menuToggle').setAttribute('aria-expanded','false');
}
$('searchInput').addEventListener('input', () => filter());
['priorityFilter', 'categoryFilter', 'urgencyFilter', 'defenceFilter', 'timeFilter'].forEach(id => $(id).addEventListener('change', () => filter()));
$('clearFilters').onclick = resetFilters;
$('sortOrder').onchange = () => { S.sort = $('sortOrder').value; filter(); };
$('filtersToggle').onclick = () => { const open = $('filterPanel').hidden; $('filterPanel').hidden = !open; $('filtersToggle').setAttribute('aria-expanded',String(open)); };
$('filterSummary').addEventListener('click', handleAction);
$('viewTabs').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) selectView(button.dataset.view); });
document.querySelectorAll('[data-quick-view]').forEach(button => button.onclick = () => { resetFilters(); selectView(button.dataset.quickView); $('opportunities').scrollIntoView({behavior:'smooth'}); });
document.querySelector('[data-quick-defence]').onclick = () => { resetFilters(); selectView('active'); $('defenceFilter').value = 'yes'; filter(); $('opportunities').scrollIntoView({behavior:'smooth'}); };
$('menuToggle').onclick = () => { const open = !$('sidebar').classList.contains('is-open'); $('sidebar').classList.toggle('is-open',open); $('sidebarBackdrop').hidden = !open; $('menuToggle').setAttribute('aria-expanded',String(open)); };
$('sidebarBackdrop').onclick = closeSidebar;
$('tenderList').addEventListener('click', handleAction);
$('detailBody').addEventListener('click', handleAction);
$('loadMoreBtn').onclick = () => { S.shown += 40; render(); };
$('refreshBtn').onclick = () => load();
$('closeDialog').onclick = () => $('bidDialog').close();
$('bidDialog').addEventListener('close', () => { S.selected = null; S.detailRequest++; if (location.hash.startsWith('#bid=')) history.replaceState(null, '', location.pathname + location.search); });
window.addEventListener('hashchange', () => openFromLocation());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSidebar();
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable && !$('bidDialog').open && !$('authDialog').open) { event.preventDefault(); $('searchInput').focus(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { load({ quiet: true }); sessionToken().catch(() => {}); } });
setInterval(() => { if (!document.hidden) load({ quiet: true }); }, 3600000);

// The supported Auth client owns PKCE, callback exchange and refresh-token rotation.
const AUTH = {session:null,mode:'login',pending:null,busy:false,access:null,otpPhone:null,otpKind:null,nextOtpAt:0};
const authClient = window.supabase?.createClient(PROJECT_URL, KEY, {auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let toastTimer;
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
function authFeedback(message,error=false){$('authFeedback').textContent=message;$('authFeedback').classList.toggle('error',error);}
function setAuthMode(mode){
 AUTH.mode=mode;authFeedback('');
 const phone=mode==='phone'||mode==='otp';
 $('phoneAccessPanel').hidden=!phone;
 const account=mode==='account'&&AUTH.session;
 $('accountPanel').hidden=!account;$('authFormPanel').hidden=!!account||phone;
 if(phone){$('phoneAccessTitle').textContent=AUTH.session?'Verify your mobile number':'Continue with mobile';$('phoneCodeLabel').hidden=mode!=='otp';$('phoneCode').required=mode==='otp';$('phoneNumber').readOnly=mode==='otp';$('phoneSubmit').textContent=mode==='otp'?'Verify code':'Send code';return;}
 if(account){$('accountEmail').textContent=AUTH.session.user.email||AUTH.session.user.phone||'';$('accountPlan').textContent=AUTH.access?.reason==='subscription'?'Active subscriber':AUTH.access?.reason==='trial'?'Member · premium trial':'Free member';loadAlertPreferences();return;}
 const signup=mode==='signup',recover=mode==='recover',reset=mode==='reset';
 $('authTitle').textContent=signup?'Your next opportunity starts here.':recover?'Reset your password.':reset?'Choose a new password.':'Welcome back.';
 $('authDescription').textContent=signup?'Create a free account to download official bid documents and export your shortlist.':recover?'We’ll email a secure link if an account exists for this address.':reset?'Set a password with at least 8 characters.':'Log in to download bid documents and export opportunities.';
 $('authTabs').hidden=recover||reset;$('googleLogin').hidden=recover||reset;$('phoneLogin').hidden=recover||reset;$('authDivider').hidden=recover||reset;
 $('authNameLabel').hidden=!signup;$('authName').required=false;
 $('authEmailLabel').hidden=reset;$('authEmail').required=!reset;
 $('authPasswordLabel').hidden=recover;$('authPassword').required=!recover;
 $('authPassword').minLength=signup||reset?8:1;
 $('authPassword').autocomplete=signup||reset?'new-password':'current-password';
 $('passwordHint').hidden=!signup&&!reset;$('forgotPassword').hidden=signup||recover||reset;
 $('authBack').hidden=!recover;$('authSubmit').textContent=signup?'Create account':recover?'Send reset link':reset?'Save new password':'Log in';
 document.querySelectorAll('[data-auth-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.authMode===mode);b.setAttribute('aria-pressed',String(b.dataset.authMode===mode));});
}
async function refreshPhoneAvailability(){
 try { const response=await fetch(PROJECT_URL+'/auth/v1/settings',{headers:H,signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('settings_unavailable');const settings=await response.json();const available=settings.external?.phone===true;
  for(const id of ['phoneLogin','verifyAlertPhone'])$(id).disabled=!available;
  $('phoneLogin').textContent=available?'Continue with mobile':'Mobile sign-in · setup pending';
  $('verifyAlertPhone').textContent=available?'Verify mobile number':'Mobile verification · setup pending';
 }catch{ for(const id of ['phoneLogin','verifyAlertPhone'])$(id).disabled=true; $('phoneLogin').textContent='Mobile sign-in · temporarily unavailable'; }
}
function openAuth(mode='login'){
 if(!authClient){toast('Account access could not load. Refresh this page to retry.');return;}
 setAuthMode(AUTH.session&&mode!=='reset'?'account':mode);
 $('authPurpose').hidden=!AUTH.pending;
 $('authPurpose').textContent=AUTH.pending?.kind==='export'?'Log in to export these opportunities.':'Log in to download this official document.';
 if(!$('authDialog').open)$('authDialog').showModal();
}
function renderAccount(){
 const user=AUTH.session?.user;
 $('memberInvite').hidden=!!user;$('sidebarAccount').hidden=!user;$('joinBtn').hidden=!!user;
 $('loginLabel').textContent=user?'My account':'Log in';
 const name=user?.user_metadata?.full_name||user?.email?.split('@')[0]||'Member';
 $('sidebarMemberName').textContent=name;$('sidebarAvatar').textContent=name.slice(0,1).toUpperCase();
 $('sidebarMemberPlan').textContent=AUTH.access?.reason==='subscription'?'Subscriber':'Free member';
 $('exportBtn').setAttribute('title',user?'Export the currently filtered bids as CSV':'Log in to export the currently filtered bids');
 if(S.selected&&S.docs.has(S.selected.id)&&$('detailDocuments'))$('detailDocuments').innerHTML=docPanel(S.docs.get(S.selected.id));
}
async function sessionToken(){
 if(!authClient)return null;
 const {data,error}=await authClient.auth.getSession();
 if(error)throw error;AUTH.session=data.session;return data.session?.access_token||null;
}
async function readAccess(){
 const token=await sessionToken();if(!token){AUTH.access=null;renderAccount();return;}
 try{const r=await fetch(API_URL+'/rpc/my_access',{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});AUTH.access=r.ok?await r.json():null;}catch{AUTH.access=null;}
 renderAccount();
}
async function requestMemberAction(action){
 AUTH.pending=action;
 let token;try{token=await sessionToken();}catch{token=null;}
 if(!token){openAuth('login');return;}
 if(!AUTH.session.user.email_confirmed_at&&!AUTH.session.user.phone_confirmed_at){openAuth('account');authFeedback('Verify your email or mobile number before downloading.',true);return;}
 if(AUTH.busy)return;AUTH.busy=true;
 toast(action.kind==='export'?'Preparing your bid export…':'Retrieving the official document…');
 try{
  const payload=action.kind==='export'?{bid_ids:action.bid_ids}:{document_id:action.document_id};
  const response=await fetch(`${PROJECT_URL}/functions/v1/tenderscope-${action.kind}`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===401){AUTH.session=null;renderAccount();openAuth('login');}throw new Error(data.error||'The download could not be completed. Please retry.');}
  const blob=await response.blob();
  const filename=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||(action.kind==='export'?'TenderScope_Healthcare_Bids.csv':'GeM_document.pdf');
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  AUTH.pending=null;toast('Your download is ready.');
 }catch(error){toast(error.message||'The download is temporarily unavailable.');}
 finally{AUTH.busy=false;}
}
document.querySelectorAll('[data-auth-open]').forEach(b=>b.onclick=()=>openAuth(b.dataset.authOpen));
$('authTabs').onclick=e=>{const b=e.target.closest('[data-auth-mode]');if(b)setAuthMode(b.dataset.authMode);};
$('closeAuthDialog').onclick=()=>$('authDialog').close();
$('forgotPassword').onclick=()=>setAuthMode('recover');$('authBack').onclick=()=>setAuthMode('login');
$('togglePassword').onclick=()=>{const show=$('authPassword').type==='password';$('authPassword').type=show?'text':'password';$('togglePassword').textContent=show?'Hide':'Show';$('togglePassword').setAttribute('aria-label',show?'Hide password':'Show password');};
$('exportBtn').onclick=()=>S.filtered.length?requestMemberAction({kind:'export',bid_ids:S.filtered.map(t=>t.id)}):toast('There are no bids in this view to export.');
$('googleLogin').onclick=async()=>{
 authFeedback('Opening Google sign-in…');
 try{
  if(AUTH.pending)sessionStorage.setItem('tenderscope-pending',JSON.stringify(AUTH.pending));
  const {error}=await authClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/?auth=callback'}});
  if(error)throw error;
 }catch(error){authFeedback(error.message,true);}
};
$('authForm').onsubmit=async event=>{
 event.preventDefault();if(!authClient||AUTH.busy)return;
 AUTH.busy=true;$('authSubmit').disabled=true;authFeedback('Please wait…');
 const email=$('authEmail').value.trim(),password=$('authPassword').value,mode=AUTH.mode;
 try{
  let result;
  if(mode==='signup')result=await authClient.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/?auth=callback',data:{full_name:$('authName').value.trim()}}});
  else if(mode==='recover')result=await authClient.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/?auth=recovery'});
  else if(mode==='reset')result=await authClient.auth.updateUser({password});
  else result=await authClient.auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  $('authPassword').value='';
  if(mode==='signup'&&!result.data.session){authFeedback('Check your email to verify your account, then return here to log in.');return;}
  if(mode==='recover'){authFeedback('If your account is eligible, a reset link has been sent. Check your inbox and spam folder.');return;}
  AUTH.session=result.data.session||AUTH.session;await readAccess();$('authDialog').close();toast(mode==='reset'?'Password updated.':'You’re logged in.');
  if(AUTH.pending){const next=AUTH.pending;AUTH.busy=false;await requestMemberAction(next);}
 }catch(error){authFeedback(error.message||'Account access is temporarily unavailable. Please retry.',true);}
 finally{AUTH.busy=false;$('authSubmit').disabled=false;}
};
$('logoutBtn').onclick=async()=>{
 const {error}=await authClient.auth.signOut({scope:'local'});
 if(error){authFeedback('Logout could not be completed. Please retry.',true);return;}
 AUTH.session=null;AUTH.access=null;AUTH.pending=null;renderAccount();$('authDialog').close();toast('You’re logged out.');
};
if(authClient){
 authClient.auth.onAuthStateChange((event,session)=>{
  AUTH.session=session;
  if(event==='PASSWORD_RECOVERY')setTimeout(()=>openAuth('reset'),0);
  else setTimeout(()=>readAccess().catch(()=>{}),0);
 });
 (async()=>{
  try{
   const {data,error}=await authClient.auth.getSession();if(error)throw error;AUTH.session=data.session;
   if(new URLSearchParams(location.search).has('auth')){
    const recovery=new URLSearchParams(location.search).get('auth')==='recovery';
    history.replaceState(null,'',location.pathname+location.hash);
    if(recovery&&AUTH.session)openAuth('reset');
    else if(AUTH.session){const next=sessionStorage.getItem('tenderscope-pending');sessionStorage.removeItem('tenderscope-pending');if(next)await requestMemberAction(JSON.parse(next));}
   }
   await readAccess();
  }catch(error){toast('Sign-in could not finish. Open Log in to try again.');}
 })();
}
load();
refreshPhoneAvailability();

// Phone OTP uses the existing Auth provider. Never simulate verification locally.
$('phoneLogin').onclick=()=>setAuthMode('phone');
$('verifyAlertPhone').onclick=()=>{$('phoneNumber').value=AUTH.session?.user.phone?'+'+AUTH.session.user.phone.replace(/^\+/,''):'';setAuthMode('phone');};
$('phoneBack').onclick=()=>{AUTH.otpPhone=null;$('phoneCode').value='';setAuthMode(AUTH.session?'account':'login');};
$('phoneForm').onsubmit=async event=>{
 event.preventDefault();if(AUTH.busy)return;AUTH.busy=true;$('phoneSubmit').disabled=true;
 try{
  if(AUTH.mode==='otp'){
   const token=$('phoneCode').value.trim();if(!/^\d{6}$/.test(token)||!AUTH.otpPhone)throw new Error('Enter the six-digit code sent to your number.');
   const {data,error}=await authClient.auth.verifyOtp({phone:AUTH.otpPhone,token,type:AUTH.otpKind});if(error)throw error;
   AUTH.session=data.session||AUTH.session;AUTH.otpPhone=null;$('phoneCode').value='';await readAccess();setAuthMode('account');authFeedback('Mobile number verified. You can now save your alert preferences.');
   if(AUTH.pending){AUTH.busy=false;await requestMemberAction(AUTH.pending);}
  }else{
   let phone=$('phoneNumber').value.replace(/[\s()-]/g,'');if(/^[6-9]\d{9}$/.test(phone))phone='+91'+phone;
   if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('Enter your mobile number with country code, for example +91 followed by 10 digits.');
   if(Date.now()<AUTH.nextOtpAt)throw new Error('Please wait a minute before requesting another code.');
   const response=await fetch(PROJECT_URL+'/auth/v1/settings',{headers:H,signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw new Error('Phone verification is temporarily unavailable. Please use email or Google.');
   const settings=await response.json();if(settings.external?.phone!==true)throw new Error('Phone verification is not available yet. You can still sign in with email or Google.');
   const changing=!!AUTH.session;
   const result=changing?await authClient.auth.updateUser({phone}):await authClient.auth.signInWithOtp({phone});
   if(result.error)throw result.error;
   AUTH.otpPhone=phone;AUTH.otpKind=changing?'phone_change':'sms';AUTH.nextOtpAt=Date.now()+60000;$('phoneNumber').value=phone;setAuthMode('otp');authFeedback('Enter the code sent by SMS.');$('phoneCode').focus();
  }
 }catch(error){authFeedback(error.message||'Phone verification could not complete.',true);}
 finally{AUTH.busy=false;$('phoneSubmit').disabled=false;}
};
async function loadAlertPreferences(){
 const user=AUTH.session?.user;if(!user)return;
 $('alertFeedback').textContent='';$('alertConsent').checked=false;
 $('alertPhoneStatus').textContent=user.phone_confirmed_at&&user.phone?'Verified mobile: +'+user.phone.replace(/^\+/,''):'Verify your mobile number to save WhatsApp preferences.';
 try{
  const {data,error}=await authClient.from('tender_alert_subscriptions').select('categories,event_types,locations,enabled').eq('user_id',user.id).maybeSingle();if(error)throw error;
  if(AUTH.session?.user.id!==user.id)return;
  document.querySelectorAll('[name=alertCategory]').forEach(input=>input.checked=(data?.categories||['all']).includes(input.value));
  document.querySelectorAll('[name=alertLocation]').forEach(input=>input.checked=(data?.locations||['NON_DELHI','MULTI_LOCATION','UNKNOWN']).includes(input.value));
  document.querySelectorAll('[name=alertEvent]').forEach(input=>input.checked=(data?.event_types||['new','extended','changed','closing']).includes(input.value));
  $('alertFeedback').textContent=data?(data.enabled?'Preferences saved. WhatsApp delivery is awaiting setup.':'Alerts are paused.'):'';
 }catch{$('alertFeedback').textContent='Preferences could not load. Please reopen your account to retry.';}
}
document.querySelectorAll('[name=alertCategory]').forEach(input=>input.onchange=()=>{
 if(input.checked)document.querySelectorAll('[name=alertCategory]').forEach(other=>{if(input.value==='all'&&other!==input||input.value!=='all'&&other.value==='all')other.checked=false;});
});
async function saveAlertPreferences(enabled){
 if(AUTH.busy)return;AUTH.busy=true;$('saveAlerts').disabled=true;$('pauseAlerts').disabled=true;
 try{
  const categories=[...document.querySelectorAll('[name=alertCategory]:checked')].map(i=>i.value);
  const events=[...document.querySelectorAll('[name=alertEvent]:checked')].map(i=>i.value);
  const locations=[...document.querySelectorAll('[name=alertLocation]:checked')].map(i=>i.value);
  if(enabled&&(!categories.length||!events.length||!locations.length))throw new Error('Choose at least one category, location and alert type.');
  if(enabled&&!$('alertConsent').checked)throw new Error('Please agree to WhatsApp alerts before saving.');
  const {error}=await authClient.rpc('save_my_location_alert_preferences',{p_categories:categories,p_event_types:events,p_locations:locations,p_enabled:enabled,p_consent:$('alertConsent').checked});if(error)throw error;
  $('alertFeedback').classList.remove('error');$('alertFeedback').textContent=enabled?'Saved. Messages will begin only after WhatsApp delivery is connected.':'Alerts paused.';
 }catch(error){$('alertFeedback').classList.add('error');$('alertFeedback').textContent=error.message||'Preferences could not be saved.';}
 finally{AUTH.busy=false;$('saveAlerts').disabled=false;$('pauseAlerts').disabled=false;}
}
$('alertPreferences').onsubmit=event=>{event.preventDefault();saveAlertPreferences(true);};
$('pauseAlerts').onclick=()=>saveAlertPreferences(false);
