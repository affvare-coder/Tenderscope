import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {fetchOfficialDocument} from '../../../worker/documents.mjs';
import {parseBoqCsv, PRODUCT_PARSER_VERSION} from '../../../worker/products.mjs';

const headers = {'Cache-Control': 'no-store'};
const sha256 = /^[0-9a-f]{64}$/;

async function readEnvelope(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(8192);
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (length + chunk.value.length > bytes.length) {
      await reader.cancel();
      return null;
    }
    bytes.set(chunk.value, length);
    length += chunk.value.length;
  }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, length)));
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response(null, {status: 405, headers});
  const signature = request.headers.get('x-tenderscope-signature') ?? '';
  const timestamp = request.headers.get('x-tenderscope-timestamp') ?? '';
  if (!sha256.test(signature) || !/^\d{10}$/.test(timestamp)) {
    return new Response(null, {status: 401, headers});
  }
  try {
    const envelope = await readEnvelope(request);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return new Response(null, {status: 400, headers});
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    const auth = await db.rpc('tenderscope_verify_boq_bridge_v1', {
      p_timestamp: Number(timestamp), p_signature: signature, p_envelope: envelope,
    });
    if (auth.error || auth.data !== true) return new Response(null, {status: 401, headers});
    const {document_id, work_id, tender_id, bid_number, revision, manifest_sha256,
      source_url, deadline, dispatch_expires_at, result_sha256, operation} = envelope;
    const identity = {p_work_id: work_id, p_revision: revision};
    if (operation === 'ack' && sha256.test(result_sha256)) {
      const ack = await db.rpc('tenderscope_ack_boq_bridge_v1', {...identity, p_result_sha256: result_sha256});
      if (ack.error) return Response.json({status: 'unavailable'}, {status: 503, headers});
      return Response.json({status: ack.data, work_id, revision}, {headers});
    }
    if (operation !== 'run' || !/^https:\/\/mkp\.gem\.gov\.in\/uploaded_documents\/[^?#\s]+\.csv$/.test(source_url)) {
      return new Response(null, {status: 400, headers});
    }
    const admitted = await db.rpc('tenderscope_admit_boq_v1', {
      ...identity, p_document_id: document_id, p_tender_id: tender_id, p_bid_number: bid_number,
      p_manifest_sha256: manifest_sha256, p_source_url: source_url, p_source_sha256: null,
      p_parser_version: PRODUCT_PARSER_VERSION, p_rules_version: 'boq-first-fetch-v1',
      p_deadline: deadline, p_dispatch_expires_at: dispatch_expires_at,
    });
    if (admitted.error) return Response.json({status: 'unavailable'}, {status: 503, headers});
    if (!['admitted', 'replay'].includes(admitted.data)) {
      return Response.json({status: admitted.data}, {headers});
    }

    const {data: work, error: claimError} = await db.rpc('tenderscope_claim_boq_bridge_v1', identity);
    if (claimError) return Response.json({status: 'unavailable'}, {status: 503, headers});
    if (work) {
      const source = await fetchOfficialDocument(work.source_url, {timeoutMs: 12000, maxBytes: 262144});
      let result;
      try {
        const {items, parser_version} = parseBoqCsv(source.bytes, work.source_url, source.content_hash);
        result = {items, parser_version};
      } catch {
        return Response.json({status: 'needs_review'}, {headers});
      }
      const finished = await db.rpc('tenderscope_finish_boq_v1', {
        ...identity, p_generation: work.generation, p_source_sha256: source.content_hash, p_result: result,
      });
      if (finished.error) return Response.json({status: 'unavailable'}, {status: 503, headers});
      if (!['ready', 'replay'].includes(finished.data)) {
        return Response.json({status: finished.data}, {headers});
      }
    }
    const ready = await db.rpc('tenderscope_read_boq_bridge_v1', identity);
    if (ready.error) return Response.json({status: 'unavailable'}, {status: 503, headers});
    return Response.json(ready.data ?? {status: 'pending'}, {headers});
  } catch {
    return Response.json({status: 'source_unavailable'}, {status: 503, headers});
  }
});
