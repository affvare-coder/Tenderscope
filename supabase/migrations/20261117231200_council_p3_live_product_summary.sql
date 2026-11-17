-- Exact live pg_get_viewdef() from production: security_invoker preserves RLS;
-- summary requires verified official URL, content-hash and document availability.
CREATE OR REPLACE VIEW public.tender_product_summary WITH (security_invoker=true) AS
SELECT t.id AS tender_id,
    summary.item_count,
    summary.item_names,
    summary.updated_at
   FROM tenders t
     CROSS JOIN LATERAL ( SELECT count(*)::integer AS item_count,
            (array_agg(i.name ORDER BY (length(i.item_number)), i.item_number, i.item_key))[1:5] AS item_names,
            max(i.observed_at) AS updated_at
           FROM tender_items i
          WHERE i.tender_id = t.id AND i.is_current AND (EXISTS ( SELECT 1
                   FROM tender_documents d
                  WHERE d.tender_id = i.tender_id AND d.official_url = i.source_url AND d.content_hash = i.source_hash AND d.availability = 'available'::text))) summary
  WHERE summary.item_count > 0;
