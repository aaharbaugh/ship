import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bulkMutate = vi.fn();

vi.mock('@/hooks/useFleetGraphReportsQuery', () => ({
  useFleetGraphReviewSessionQuery: () => ({
    isLoading: false,
    error: null,
    data: {
      generatedAt: '2026-03-18T03:00:00.000Z',
      totalReports: 2,
      totalFindings: 3,
      redFindings: 1,
      yellowFindings: 1,
      draftReports: 1,
      publishedReports: 1,
      findings: [
        {
          reportId: 'report-draft',
          reportTitle: 'Draft Report',
          reportState: 'draft',
          reportQualityStatus: 'red',
          rootDocumentId: 'project-1',
          rootDocumentTitle: 'Project Alpha',
          rootDocumentType: 'project',
          focusDocumentId: 'issue-1',
          focusDocumentTitle: 'Issue Missing Acceptance Criteria',
          focusDocumentType: 'issue',
          focusQualityStatus: 'red',
          focusQualityScore: 0.31,
          focusQualitySummary: 'Acceptance criteria are missing.',
          directorFeedbackSentAt: null,
          directorResponseOptionsCount: 2,
        },
        {
          reportId: 'report-published',
          reportTitle: 'Published Report',
          reportState: 'published',
          reportQualityStatus: 'yellow',
          rootDocumentId: 'project-2',
          rootDocumentTitle: 'Project Beta',
          rootDocumentType: 'project',
          focusDocumentId: 'week-1',
          focusDocumentTitle: 'Week 12',
          focusDocumentType: 'sprint',
          focusQualityStatus: 'yellow',
          focusQualityScore: 0.64,
          focusQualitySummary: 'Standup signal is thin.',
          directorFeedbackSentAt: null,
          directorResponseOptionsCount: 1,
        },
        {
          reportId: 'report-published',
          reportTitle: 'Published Report',
          reportState: 'published',
          reportQualityStatus: 'green',
          rootDocumentId: 'project-2',
          rootDocumentTitle: 'Project Beta',
          rootDocumentType: 'project',
          focusDocumentId: 'doc-3',
          focusDocumentTitle: 'Project Beta',
          focusDocumentType: 'project',
          focusQualityStatus: 'green',
          focusQualityScore: 0.9,
          focusQualitySummary: 'Healthy graph.',
          directorFeedbackSentAt: null,
          directorResponseOptionsCount: 0,
        },
      ],
    },
  }),
  useFleetGraphBulkPublishReportsMutation: () => ({
    mutate: bulkMutate,
    isPending: false,
  }),
}));

import { FleetGraphReviewSessionPage } from './FleetGraphReviewSessionPage';

function renderPage() {
  return render(
    <BrowserRouter>
      <FleetGraphReviewSessionPage />
    </BrowserRouter>
  );
}

describe('FleetGraphReviewSessionPage', () => {
  beforeEach(() => {
    bulkMutate.mockReset();
  });

  it('renders lane content from the FleetGraph session payload', () => {
    renderPage();

    expect(screen.getByText('Review Session')).toBeInTheDocument();
    expect(screen.getByText('Red Findings')).toBeInTheDocument();
    expect(screen.getByText('Yellow Findings')).toBeInTheDocument();
    expect(screen.getByText('Other Findings')).toBeInTheDocument();
    expect(screen.getByText('Issue Missing Acceptance Criteria')).toBeInTheDocument();
    expect(screen.getByText('Week 12')).toBeInTheDocument();
  });

  it('selects draft reports and bulk publishes the selected ids', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Select Drafts' }));
    expect(screen.getByRole('button', { name: 'Publish Selected (1)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Publish Selected (1)' }));
    expect(bulkMutate).toHaveBeenCalledWith(['report-draft']);
  });
});
