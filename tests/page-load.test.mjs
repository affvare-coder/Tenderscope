import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const app = read('app.js');
const between = (first, next) => app.slice(app.indexOf(first), app.indexOf(next));

function documentTools() {
  const scripts = [], opened = [], messages = [];
  const nodes = {bidDialog: {open: true}, detailFeedback: {}};
  const scope = vm.createContext({
    window: {},
    document: {
      createElement() {return {remove() {this.removed = true;}};},
      head: {append(script) {scripts.push(script);}},
    },
    setTimeout: () => 1,
    clearTimeout() {},
    $: id => nodes[id],
    byId: () => ({}),
    S: {selected: {id: 'bid'}, detailRequest: 1},
    AUTH: {session: {user: {id: 'member'}}},
    authClient: {},
    currentPackSource: async () => ({bid: {bid_number: 'GEM/2026/B/1'}, documents: [], items: []}),
    packHistoryKey: () => 'current-pack',
    previousPackWarning: () => '',
    toast: msg => messages.push(msg),
  });
  vm.runInContext(between('let studioLoad;', 'async function openFromLocation()'), scope);
  const ready = script => {
    scope.window.TenderScopeDocs = {
      verifiedItems: items => items,
      open: async options => opened.push(options),
    };
    script.onload();
  };
  return {scope, scripts, opened, messages, ready};
}

test('the first page loads the versioned app and requests document tools on demand', async () => {
  const page = read('index.html');
  const script = /<script src="(\/app\.js\?v=\d+)" defer>/.exec(page)?.[1];
  assert.ok(script);
  assert.ok(read('sw.js').includes(JSON.stringify(script)));
  assert.doesNotMatch(page, /<script[^>]+\/document-studio\.js/);

  const tools = documentTools();
  assert.equal(tools.scripts.length, 0);
  const first = tools.scope.openDocumentStudio('bid', 'compliance');
  const latest = tools.scope.openDocumentStudio('bid', 'annexure');
  assert.equal(tools.scripts.length, 1);
  assert.equal(tools.scripts[0].src, '/document-studio.js');
  tools.ready(tools.scripts[0]);
  await Promise.all([first, latest]);
  assert.deepEqual(tools.opened.map(options => options.tab), ['annexure']);
  await tools.scope.openDocumentStudio('bid', 'overview');
  assert.equal(tools.scripts.length, 1);
});

test('document tools can retry a failed load and respect detail and account changes', async () => {
  const tools = documentTools();
  const first = tools.scope.openDocumentStudio('bid', 'compliance');
  tools.scripts[0].onerror();
  await first;
  assert.equal(tools.scripts[0].removed, true);
  assert.equal(tools.messages.length, 1);

  const second = tools.scope.openDocumentStudio('bid', 'compliance');
  assert.equal(tools.scripts.length, 2);
  tools.scope.AUTH.session = {user: {id: 'new-account'}};
  tools.scope.S.detailRequest++;
  tools.ready(tools.scripts[1]);
  await second;
  assert.equal(tools.opened.length, 0);
});

test('a new public feed query aborts the old request without showing a failure', async () => {
  const requests = [], rendered = [], fields = {};
  let search = 'dental';
  const scope = vm.createContext({
    AbortController,
    setTimeout: () => 1,
    clearTimeout() {},
    feedParams: () => new URLSearchParams({p_search: search}),
    verifiedSearch: () => false,
    API_URL: '/api/public',
    H: {},
    S: {requestId: 0, docs: new Map(), itemRows: new Map()},
    $: id => fields[id] ??= {},
    fetch: (path, {signal}) => new Promise((resolve, reject) => {
      requests.push({path, signal, resolve});
      signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    }),
    restoreRegister() {}, render() {}, saveRegister() {},
    loadProductSummaries() {}, loadBuyerReviews() {}, openFromLocation() {},
    applyFeed: data => rendered.push(data),
  });
  vm.runInContext(
    between('async function api(', 'async function pages(') +
    between('let feedController;', 'function categories()'),
    scope,
  );
  const previous = scope.load();
  search = 'pharma';
  const current = scope.load();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal.aborted, true);
  assert.match(requests[1].path, /p_search=pharma/);
  requests[1].resolve({ok: true, json: async () => ({rows: ['latest'], total: 1})});
  await Promise.all([previous, current]);
  assert.deepEqual(rendered, [{rows: ['latest'], total: 1}]);
  assert.equal(fields.errorState.hidden, true);
  assert.equal(fields.errorState.textContent, undefined);
});
