import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {fetchOfficialDocument, sha256} from '../../../worker/documents.mjs';
import {parseBoqCsv, PRODUCT_PARSER_VERSION} from '../../../worker/products.mjs';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [0-9a-f]{64}$/.test(authorization)) return new Response('Unauthorized', {status: 401});

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  try {
    const auth = await db.rpc('tenderscope_verify_boq_runner_v1', {
      p_token_sha256: await sha256(new TextEncoder().encode(authorization.slice(7))),
    });
    if (auth.error || !auth.data) return new Response('Unauthorized', {status: 401});

    const {data: work, error: claimError} = await db.rpc('tenderscope_claim_boq_v1');
    if (claimError) return Response.json({status: 'claim_failed'}, {status: 503});
    if (!work) return Response.json({status: 'idle'});
    if (work.parser_version !== PRODUCT_PARSER_VERSION) return Response.json({status: 'parser_version_mismatch'});

    const source = await fetchOfficialDocument(work.source_url, {timeoutMs: 12000, maxBytes: 262144});
    if (source.content_hash !== work.source_sha256) return Response.json({status: 'source_changed'});
    const {items, parser_version} = parseBoqCsv(source.bytes, work.source_url, source.content_hash);
    const {data: status, error: finishError} = await db.rpc('tenderscope_finish_boq_v1', {
      p_work_id: work.work_id,
      p_revision: work.revision,
      p_generation: work.generation,
      p_source_sha256: source.content_hash,
      p_result: {items, parser_version},
    });
    if (finishError) return Response.json({status: 'finish_failed'}, {status: 503});
    return Response.json({status, extracted_rows: items.length}, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({status: 'source_unavailable_or_unreadable'}, {status: 503});
  }
});
