import { Navigate, useParams } from 'react-router-dom';
import { useFleetGraphReportDetailQuery } from '@/hooks/useFleetGraphReportsQuery';

export function FleetGraphReportDetailPage() {
  const { id } = useParams();
  const detailQuery = useFleetGraphReportDetailQuery(id);

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="text-sm text-slate-400">Loading FleetGraph report...</div>
      </div>
    );
  }

  const rootDocumentId = detailQuery.data?.rootDocument?.id ?? detailQuery.data?.report.rootDocumentId ?? null;
  if (rootDocumentId) {
    return <Navigate to={`/documents/${rootDocumentId}`} replace />;
  }

  return (
    <Navigate to="/team/reviews/fleetgraph" replace />
  );
}
