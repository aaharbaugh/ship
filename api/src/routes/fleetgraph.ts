import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { createFleetGraphBearerClient, createFleetGraphSessionClient } from '../services/fleetgraph/client.js';
import { persistFleetGraphAnalysis } from '../services/fleetgraph/persist.js';
import { analyzeFleetGraphWithReasoning } from '../services/fleetgraph/reasoning.js';
import { prepareFleetGraphRun } from '../services/fleetgraph/runner.js';
import { runFleetGraphWorkspaceScan } from '../services/fleetgraph/scan.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();
const nightlyScanSchema = z.object({
  createDraftReports: z.boolean().optional(),
});

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

router.post('/nightly-scan', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.isApiToken && !req.isSuperAdmin && req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'FleetGraph nightly scans require workspace admin access' });
    }

    const parsed = nightlyScanSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid nightly scan payload', details: parsed.error.flatten() });
    }

    const client = createRouteClient(req);
    const result = await runFleetGraphWorkspaceScan(client, String(req.workspaceId), parsed.data);
    return res.json(result);
  } catch (error) {
    console.error('FleetGraph nightly scan error:', error);
    return res.status(500).json({ error: 'Failed to run FleetGraph nightly scan' });
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
  const client = createRouteClient(req);
  const prepared = await prepareFleetGraphRun(client, {
    workspaceId: String(req.workspaceId),
    documentId: String(req.params.id),
    source: 'manual',
  });
  const analysis = await analyzeFleetGraphWithReasoning(prepared.scoringPayload);

  return { client, prepared, analysis };
}

function createRouteClient(req: Request) {
  const baseUrl = getInternalBaseUrl(req);
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    return createFleetGraphBearerClient(baseUrl, authHeader.slice(7));
  }

  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    throw new Error('Session cookie required for FleetGraph access');
  }

  return createFleetGraphSessionClient(baseUrl, cookieHeader);
}

export default router;
