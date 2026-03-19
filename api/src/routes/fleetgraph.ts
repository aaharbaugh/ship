import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  buildInsightsResponse,
  chatHandler,
  createReportDraftHandler,
  deleteReportHandler,
  directorFeedbackHandler,
  getQueueStatusHandler,
  getReadinessHandler,
  getReportDetailHandler,
  getReportsHandler,
  getReviewSessionHandler,
  nightlyScanHandler,
  persistInsightsHandler,
  publishReportHandler,
  type FleetGraphRouteContext,
} from './fleetgraph-handlers.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

function toContext(req: Request): FleetGraphRouteContext {
  return {
    workspaceId: req.workspaceId ? String(req.workspaceId) : null,
    workspaceRole: req.workspaceRole ?? null,
    isApiToken: req.isApiToken ?? false,
    isSuperAdmin: req.isSuperAdmin ?? false,
    headers: req.headers,
    params: Object.fromEntries(
      Object.entries(req.params).map(([key, value]) => [key, value ? String(value) : undefined])
    ),
    body: req.body,
    protocol: req.protocol,
    host: req.get('host') ?? undefined,
  };
}

router.get('/documents/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    return res.json(await buildInsightsResponse(toContext(req)));
  } catch (error) {
    console.error('FleetGraph insights error:', error);
    return res.status(500).json({ error: 'Failed to prepare FleetGraph insights' });
  }
});

router.get('/debug/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    return res.json(await buildInsightsResponse(toContext(req)));
  } catch (error) {
    console.error('FleetGraph debug error:', error);
    return res.status(500).json({ error: 'Failed to prepare FleetGraph run' });
  }
});

router.get('/reports', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getReportsHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph report list error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph reports' });
  }
});

router.get('/reports/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getReportDetailHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph report detail error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph report detail' });
  }
});

router.get('/review-session', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getReviewSessionHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph review session error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph review session' });
  }
});

router.get('/queue-status', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await getQueueStatusHandler();
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph queue status error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph queue status' });
  }
});

router.get('/readiness', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getReadinessHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph readiness error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph readiness' });
  }
});

router.post('/documents/:id/persist', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await persistInsightsHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph persist error:', error);
    return res.status(500).json({ error: 'Failed to persist FleetGraph analysis' });
  }
});

router.post('/debug/:id/persist', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await persistInsightsHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph persist error:', error);
    return res.status(500).json({ error: 'Failed to persist FleetGraph analysis' });
  }
});

router.post('/documents/:id/report-draft', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await createReportDraftHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph report draft error:', error);
    return res.status(500).json({ error: 'Failed to create FleetGraph quality report draft' });
  }
});

router.post('/documents/:id/chat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await chatHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph chat error:', error);
    return res.status(500).json({ error: 'Failed to answer FleetGraph question' });
  }
});

router.post('/debug/:id/report-draft', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await createReportDraftHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph report draft error:', error);
    return res.status(500).json({ error: 'Failed to create FleetGraph quality report draft' });
  }
});

router.post('/reports/:id/publish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await publishReportHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph report publish error:', error);
    return res.status(500).json({ error: 'Failed to publish FleetGraph report' });
  }
});

router.delete('/reports/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await deleteReportHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph report delete error:', error);
    return res.status(500).json({ error: 'Failed to delete FleetGraph report' });
  }
});

router.post('/reports/:id/director-feedback', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await directorFeedbackHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph director feedback error:', error);
    return res.status(500).json({ error: 'Failed to send FleetGraph director feedback' });
  }
});

router.post('/nightly-scan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await nightlyScanHandler(toContext(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('FleetGraph nightly scan error:', error);
    return res.status(500).json({ error: 'Failed to run FleetGraph nightly scan' });
  }
});

export default router;
