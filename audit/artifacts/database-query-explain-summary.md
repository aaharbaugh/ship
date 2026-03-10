# Database Query EXPLAIN Summary

Generated: March 10, 2026

## dashboard_weekly_plan_lookup
- Planning time: `0.592 ms`
- Execution time: `0.043 ms`
- Top plan: `Limit`
- Main scan: `Bitmap Heap Scan` on `documents`
- Index usage: `Bitmap Index Scan` on `idx_documents_document_type`
- Key observation: `workspace_id`, `person_id`, and `week_number` are applied as filters after the broad document-type index

## issues_batch_associations
- Planning time: `0.373 ms`
- Execution time: `0.277 ms`
- Top plan: `Sort`
- Main scan: `Seq Scan` on `document_associations`
- Join strategy: `Nested Loop` to `documents_pkey` with `Memoize`
- Key observation: the batched association load avoids N+1, but large `document_id = ANY(...)` lookups still scan the association table sequentially

## search_mentions_documents
- Planning time: `0.144 ms`
- Execution time: `0.250 ms`
- Top plan: `Limit`
- Main scan: `Seq Scan` on `documents`
- Key observation: `title ILIKE '%Audit%'` currently scans `documents` sequentially

## my_week_project_lookup
- Planning time: `0.226 ms`
- Execution time: `0.103 ms`
- Top plan: `Unique`
- Main scan: `Bitmap Heap Scan` on `documents`
- Index usage: `Bitmap Index Scan` on `idx_documents_document_type`
- Key observation: JSONB filters on `assignee_ids` and `sprint_number` are evaluated after the broad type index
