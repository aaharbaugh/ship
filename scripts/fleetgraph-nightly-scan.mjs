const baseUrl = normalizeUrl(
  process.env.FLEETGRAPH_BASE_URL ??
    process.env.APP_BASE_URL ??
    process.env.INTERNAL_API_URL ??
    null
);
const token = process.env.SHIP_API_TOKEN ?? null;
const createDraftReports = (process.env.FLEETGRAPH_CREATE_DRAFT_REPORTS ?? 'true') !== 'false';

if (!baseUrl) {
  console.error('Missing FleetGraph base URL. Set FLEETGRAPH_BASE_URL or APP_BASE_URL.');
  process.exit(1);
}

if (!token) {
  console.error('Missing SHIP_API_TOKEN. FleetGraph nightly scan requires Bearer auth.');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/fleetgraph/nightly-scan`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ createDraftReports }),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`FleetGraph nightly scan failed (${response.status}): ${text.slice(0, 500)}`);
  process.exit(1);
}

const result = await response.json();
console.log(
  JSON.stringify(
    {
      source: 'fleetgraph-nightly-scan',
      workspaceId: result.workspaceId,
      totalProjects: result.totalProjects,
      redProjects: result.redProjects,
      yellowProjects: result.yellowProjects,
      greenProjects: result.greenProjects,
      scannedAt: result.scannedAt,
      createDraftReports,
    },
    null,
    2
  )
);

function normalizeUrl(url) {
  return url ? String(url).replace(/\/$/, '') : null;
}
