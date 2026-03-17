import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { analyzeFleetGraphPayload } from '../services/fleetgraph/analyze.js';
import { createFleetGraphSessionClient } from '../services/fleetgraph/client.js';
import { persistFleetGraphAnalysis } from '../services/fleetgraph/persist.js';
import { prepareFleetGraphRun } from '../services/fleetgraph/runner.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

function getInternalBaseUrl(req: Request): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/$/, '');
  }

  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

router.get('/debug/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    return res.json(await buildDebugResponse(req));
  } catch (error) {
    console.error('FleetGraph debug error:', error);
    return res.status(500).json({ error: 'Failed to prepare FleetGraph run' });
  }
});

router.post('/debug/:id/persist', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client, analysis } = await buildDebugContext(req);
    await persistFleetGraphAnalysis(client, analysis);

    return res.json({
      persisted: analysis.documents.length,
      analysis,
    });
  } catch (error) {
    console.error('FleetGraph persist error:', error);
    return res.status(500).json({ error: 'Failed to persist FleetGraph analysis' });
  }
});

async function buildDebugResponse(req: Request) {
  const { prepared, analysis } = await buildDebugContext(req);

  return {
    ...prepared,
    analysis,
  };
}

async function buildDebugContext(req: Request) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    throw new Error('Session cookie required for FleetGraph debug access');
  }

  const client = createFleetGraphSessionClient(getInternalBaseUrl(req), cookieHeader);
  const prepared = await prepareFleetGraphRun(client, {
    workspaceId: String(req.workspaceId),
    documentId: String(req.params.id),
    source: 'manual',
  });
  const analysis = analyzeFleetGraphPayload(prepared.scoringPayload);

  return { client, prepared, analysis };
}

export default router;
