import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { createFleetGraphBearerClient, createFleetGraphSessionClient } from '../services/fleetgraph/client.js';
import { persistFleetGraphAnalysis } from '../services/fleetgraph/persist.js';
import { analyzeFleetGraphWithReasoning } from '../services/fleetgraph/reasoning.js';
import {
  createFleetGraphQualityReportDraft,
  publishFleetGraphQualityReport,
} from '../services/fleetgraph/report.js';
import { listFleetGraphReports } from '../services/fleetgraph/reports.js';
import { prepareFleetGraphRun } from '../services/fleetgraph/runner.js';
import { runFleetGraphWorkspaceScan } from '../services/fleetgraph/scan.js';
import { getFleetGraphQueueStatus } from '../services/fleetgraph/triggers.js';
import { sendFleetGraphDirectorFeedback } from '../services/fleetgraph/feedback.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();
const nightlyScanSchema = z.object({
  createDraftReports: z.boolean().optional(),
});
const directorFeedbackSchema = z.object({
  optionIndex: z.number().int().min(0),
});

function getInternalBaseUrl(req: Request): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/$/, '');
  }

  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

router.get('/documents/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    return res.json(await buildInsightsResponse(req));
  } catch (error) {
    console.error('FleetGraph insights error:', error);
    return res.status(500).json({ error: 'Failed to prepare FleetGraph insights' });
  }
});

router.get('/debug/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    return res.json(await buildInsightsResponse(req));
  } catch (error) {
    console.error('FleetGraph debug error:', error);
    return res.status(500).json({ error: 'Failed to prepare FleetGraph run' });
  }
});

router.get('/reports', authMiddleware, async (req: Request, res: Response) => {
  try {
    const client = createRouteClient(req);
    return res.json({
      reports: await listFleetGraphReports(client),
    });
  } catch (error) {
    console.error('FleetGraph report list error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph reports' });
  }
});

router.get('/queue-status', authMiddleware, async (_req: Request, res: Response) => {
  try {
    return res.json(getFleetGraphQueueStatus());
  } catch (error) {
    console.error('FleetGraph queue status error:', error);
    return res.status(500).json({ error: 'Failed to load FleetGraph queue status' });
  }
});

router.post('/documents/:id/persist', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client, analysis } = await buildInsightsContext(req);
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

router.post('/debug/:id/persist', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client, analysis } = await buildInsightsContext(req);
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

router.post('/documents/:id/report-draft', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client, prepared, analysis } = await buildInsightsContext(req);
    const existingReportId =
      typeof prepared.context.rootDocument.properties.quality_report_id === 'string'
        ? prepared.context.rootDocument.properties.quality_report_id
        : null;

    if (existingReportId) {
      return res.json({
        created: false,
        reportId: existingReportId,
      });
    }

    const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
    for (const document of analysis.documents) {
      await client.updateDocumentMetadata(document.documentId, {
        ...document.metadata,
        quality_report_id: report.reportId,
      });
    }

    return res.json({
      created: true,
      reportId: report.reportId,
    });
  } catch (error) {
    console.error('FleetGraph report draft error:', error);
    return res.status(500).json({ error: 'Failed to create FleetGraph quality report draft' });
  }
});

router.post('/debug/:id/report-draft', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client, prepared, analysis } = await buildInsightsContext(req);
    const existingReportId =
      typeof prepared.context.rootDocument.properties.quality_report_id === 'string'
        ? prepared.context.rootDocument.properties.quality_report_id
        : null;

    if (existingReportId) {
      return res.json({
        created: false,
        reportId: existingReportId,
      });
    }

    const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
    for (const document of analysis.documents) {
      await client.updateDocumentMetadata(document.documentId, {
        ...document.metadata,
        quality_report_id: report.reportId,
      });
    }

    return res.json({
      created: true,
      reportId: report.reportId,
    });
  } catch (error) {
    console.error('FleetGraph report draft error:', error);
    return res.status(500).json({ error: 'Failed to create FleetGraph quality report draft' });
  }
});

router.post('/reports/:id/publish', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.isApiToken && !req.isSuperAdmin && req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'Publishing FleetGraph reports requires workspace admin access' });
    }

    const client = createRouteClient(req);
    return res.json(await publishFleetGraphQualityReport(client, String(req.params.id)));
  } catch (error) {
    console.error('FleetGraph report publish error:', error);
    return res.status(500).json({ error: 'Failed to publish FleetGraph report' });
  }
});

router.post('/reports/:id/director-feedback', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.isApiToken && !req.isSuperAdmin && req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'Sending FleetGraph director feedback requires workspace admin access' });
    }

    const parsed = directorFeedbackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid FleetGraph director feedback payload', details: parsed.error.flatten() });
    }

    const client = createRouteClient(req);
    return res.json(
      await sendFleetGraphDirectorFeedback(client, String(req.params.id), parsed.data.optionIndex)
    );
  } catch (error) {
    console.error('FleetGraph director feedback error:', error);
    return res.status(500).json({ error: 'Failed to send FleetGraph director feedback' });
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

async function buildInsightsResponse(req: Request) {
  const { prepared, analysis } = await buildInsightsContext(req);

  return {
    ...prepared,
    analysis,
  };
}

async function buildInsightsContext(req: Request) {
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
