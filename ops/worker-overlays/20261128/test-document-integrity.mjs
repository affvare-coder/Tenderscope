import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

// Set DOCUMENTS_MODULE to the tested bundle's absolute worker/documents.mjs path.
const {fetchOfficialDocument} = await import(process.env.DOCUMENTS_MODULE
  ? pathToFileURL(process.env.DOCUMENTS_MODULE).href
  : './worker/documents.mjs');
const csvUrl = 'https://bidplus.gem.gov.in/uploaded_documents/schedule.csv';
const body = 'Item,Quantity\nA,4\n';
const expectedHash = createHash('sha256').update(body).digest('hex');

function download(response, options = {}) {
  return fetchOfficialDocument(csvUrl, {fetchImpl: async () => response, ...options});
}

test('rejects a partial HTTP response before hashing', async () => {
  await assert.rejects(download(new Response(body, {status: 206})),
    /document_partial_response/);
});

test('rejects a Content-Range even with HTTP 200', async () => {
  await assert.rejects(download(new Response(body, {
    headers: {'Content-Range': 'bytes 0-17/100'}
  })), /document_partial_response/);
});

test('rejects a truncated identity body before hashing', async () => {
  await assert.rejects(download(new Response(body, {
    headers: {'Content-Length': String(body.length + 10), 'Content-Encoding': 'identity'}
  })), /document_length_mismatch/);
});

test('rejects an oversized identity body against its declared length', async () => {
  await assert.rejects(download(new Response(body, {
    headers: {'Content-Length': String(body.length - 1)}
  })), /document_length_mismatch/);
});

test('rejects an invalid identity Content-Length', async () => {
  await assert.rejects(download(new Response(body, {
    headers: {'Content-Length': 'invalid'}
  })), /document_length_mismatch/);
});

test('hashes complete downloads with a matching or absent Content-Length', async () => {
  const withLength = await download(new Response(body, {
    headers: {'Content-Length': String(body.length)}
  }));
  const withoutLength = await download(new Response(body));
  assert.equal(withLength.content_hash, expectedHash);
  assert.equal(withoutLength.content_hash, expectedHash);
});

test('does not compare decoded bytes to a compressed wire length', async () => {
  const result = await download(new Response(body, {
    headers: {'Content-Length': String(body.length + 12), 'Content-Encoding': 'gzip'}
  }));
  assert.equal(result.content_hash, expectedHash);
});

test('still applies the maximum decoded size with nonidentity encoding', async () => {
  await assert.rejects(download(new Response(body, {
    headers: {'Content-Length': '5', 'Content-Encoding': 'gzip'}
  }), {maxBytes: 12}), /document_too_large/);
});

test('304 requires a previous hash and keeps the conditional source guard', async () => {
  await assert.rejects(download(new Response(null, {status: 304})),
    /document_unverifiable_304/);
  const result = await fetchOfficialDocument(csvUrl, {
    previous: {content_hash: expectedHash, etag: '"prior"'},
    fetchImpl: async (url, options) => {
      assert.equal(url, csvUrl);
      assert.equal(options.headers['If-None-Match'], '"prior"');
      return new Response(null, {status: 304});
    }
  });
  assert.equal(result.content_hash, expectedHash);
  assert.equal(result.not_modified, true);
  assert.equal(result.bytes, null);
});

test('still rejects source URL and redirect destinations outside GeM', async () => {
  await assert.rejects(fetchOfficialDocument('https://example.com/download', {
    fetchImpl: async () => assert.fail('Unapproved URL reached fetch')
  }), /unapproved_document_url/);
  await assert.rejects(download(new Response(null, {
    status: 302, headers: {Location: 'https://example.com/download'}
  })), /unapproved_document_redirect/);
});

test('still rejects HTML masquerading as an attachment', async () => {
  await assert.rejects(download(new Response('<html>Sign in</html>')),
    /document_not_downloadable/);
});
