import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../.env.local') });
config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Expected api/.env.local to point at the benchmark DB.');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const idsResult = await pool.query(`
      SELECT id
      FROM documents
      WHERE workspace_id = (
        SELECT workspace_id
        FROM sessions
        WHERE workspace_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      )
        AND document_type = 'issue'
        AND archived_at IS NULL
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 100
    `);

    const documentIds = idsResult.rows.map((row) => row.id as string);
    if (documentIds.length === 0) {
      throw new Error('No issue IDs found in the benchmark database.');
    }

    const explainResult = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT da.document_id, da.related_id as id, da.relationship_type as type,
              d.title, d.properties->>'color' as color
       FROM document_associations da
       LEFT JOIN documents d ON da.related_id = d.id
       WHERE da.document_id = ANY($1)
       ORDER BY da.document_id, da.relationship_type, da.created_at`,
      [documentIds]
    );

    console.log(explainResult.rows.map((row) => row['QUERY PLAN']).join('\n'));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
