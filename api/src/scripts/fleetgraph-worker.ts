import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../../../.env.local') });
config({ path: join(__dirname, '../../../.env') });

process.env.FLEETGRAPH_WORKER_ENABLED = 'true';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    const { loadProductionSecrets } = await import('../config/ssm.js');
    await loadProductionSecrets();
  }

  const { startFleetGraphWorker } = await import('../services/fleetgraph/triggers.js');
  const intervalMs = Number(process.env.FLEETGRAPH_BATCH_INTERVAL_MS || 4 * 60 * 1000);

  startFleetGraphWorker();

  console.log(`[FleetGraph worker] running with batch interval ${intervalMs}ms`);

  setInterval(() => {}, 60_000);
}

main().catch((error) => {
  console.error('[FleetGraph worker] failed to start', error);
  process.exit(1);
});
