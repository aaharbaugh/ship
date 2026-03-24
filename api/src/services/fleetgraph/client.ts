import type {
  DocumentType,
  FleetGraphDocumentMetadata,
  FleetGraphTriggerSource,
} from '@ship/shared';

export interface FleetGraphDocumentRecord {
  id: string;
  workspace_id: string;
  document_type: DocumentType | string;
  title: string;
  parent_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  properties: Record<string, unknown>;
  content?: Record<string, unknown> | null;
  belongs_to?: Array<{ id: string; type: string; title?: string; color?: string }>;
}

export interface FleetGraphAssociationRecord {
  document_id: string;
  related_id: string;
  relationship_type: string;
  related_title?: string;
  related_document_type?: string;
}

export interface FleetGraphTriggerRequest {
  workspaceId: string;
  documentId: string;
  source: FleetGraphTriggerSource;
}

export interface FleetGraphReportDraft {
  title: string;
  content: string;
  projectId?: string | null;
  metadata: Record<string, unknown>;
}

export interface FleetGraphListDocumentsParams {
  type?: DocumentType | string;
  parentId?: string | null;
}

export interface FleetGraphShipApiClient {
  listDocuments(params?: FleetGraphListDocumentsParams): Promise<FleetGraphDocumentRecord[]>;
  getDocument(documentId: string): Promise<FleetGraphDocumentRecord>;
  getDocumentAssociations(documentId: string): Promise<FleetGraphAssociationRecord[]>;
  getReverseAssociations(documentId: string): Promise<FleetGraphAssociationRecord[]>;
  updateDocumentMetadata(documentId: string, metadata: FleetGraphDocumentMetadata): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  createQualityReportDraft(draft: FleetGraphReportDraft): Promise<{ id: string }>;
  updateQualityReportDraft(reportId: string, draft: FleetGraphReportDraft): Promise<void>;
}

export interface FleetGraphShipApiClientConfig {
  baseUrl: string;
  authHeaders: Record<string, string>;
}

function buildHeaders(authHeaders: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...authHeaders,
  };
}

async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${context} failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

function toTiptapDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  };
}

export class FleetGraphHttpShipApiClient implements FleetGraphShipApiClient {
  private readonly baseUrl: string;
  private readonly authHeaders: Record<string, string>;

  constructor(config: FleetGraphShipApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authHeaders = config.authHeaders;
  }

  async listDocuments(
    params: FleetGraphListDocumentsParams = {}
  ): Promise<FleetGraphDocumentRecord[]> {
    const search = new URLSearchParams();

    if (params.type) {
      search.set('type', params.type);
    }

    if (params.parentId !== undefined) {
      search.set('parent_id', params.parentId ?? 'null');
    }

    const query = search.toString();
    const response = await fetch(
      `${this.baseUrl}/api/documents${query ? `?${query}` : ''}`,
      {
        headers: buildHeaders(this.authHeaders),
      }
    );

    return parseJsonResponse<FleetGraphDocumentRecord[]>(response, 'listDocuments');
  }

  async getDocument(documentId: string): Promise<FleetGraphDocumentRecord> {
    const response = await fetch(`${this.baseUrl}/api/documents/${documentId}`, {
      headers: buildHeaders(this.authHeaders),
    });

    return parseJsonResponse<FleetGraphDocumentRecord>(response, `getDocument(${documentId})`);
  }

  async getDocumentAssociations(documentId: string): Promise<FleetGraphAssociationRecord[]> {
    const response = await fetch(`${this.baseUrl}/api/documents/${documentId}/associations`, {
      headers: buildHeaders(this.authHeaders),
    });

    return parseJsonResponse<FleetGraphAssociationRecord[]>(response, `getDocumentAssociations(${documentId})`);
  }

  async getReverseAssociations(documentId: string): Promise<FleetGraphAssociationRecord[]> {
    const response = await fetch(`${this.baseUrl}/api/documents/${documentId}/reverse-associations`, {
      headers: buildHeaders(this.authHeaders),
    });

    return parseJsonResponse<FleetGraphAssociationRecord[]>(response, `getReverseAssociations(${documentId})`);
  }

  async updateDocumentMetadata(documentId: string, metadata: FleetGraphDocumentMetadata): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: buildHeaders(this.authHeaders),
      body: JSON.stringify({ properties: metadata }),
    });

    await parseJsonResponse<Record<string, unknown>>(response, `updateDocumentMetadata(${documentId})`);
  }

  async deleteDocument(documentId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/documents/${documentId}`, {
      method: 'DELETE',
      headers: buildHeaders(this.authHeaders),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `deleteDocument(${documentId}) failed (${response.status}): ${text.slice(0, 300)}`
      );
    }
  }

  async createQualityReportDraft(draft: FleetGraphReportDraft): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/api/documents`, {
      method: 'POST',
      headers: buildHeaders(this.authHeaders),
      body: JSON.stringify({
        title: draft.title,
        document_type: 'wiki',
        content: toTiptapDoc(draft.content),
        properties: {
          ...draft.metadata,
          fleetgraph_report_type: 'quality_report',
          project_id: draft.projectId ?? null,
        },
      }),
    });

    return parseJsonResponse<{ id: string }>(response, 'createQualityReportDraft');
  }

  async updateQualityReportDraft(reportId: string, draft: FleetGraphReportDraft): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/documents/${reportId}`, {
      method: 'PATCH',
      headers: buildHeaders(this.authHeaders),
      body: JSON.stringify({
        title: draft.title,
        content: toTiptapDoc(draft.content),
        properties: {
          ...draft.metadata,
          fleetgraph_report_type: 'quality_report',
          project_id: draft.projectId ?? null,
        },
      }),
    });

    await parseJsonResponse<Record<string, unknown>>(response, `updateQualityReportDraft(${reportId})`);
  }
}

export function createFleetGraphBearerClient(baseUrl: string, apiToken: string): FleetGraphShipApiClient {
  return new FleetGraphHttpShipApiClient({
    baseUrl,
    authHeaders: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
}

export function createFleetGraphSessionClient(
  baseUrl: string,
  cookieHeader: string,
  csrfToken?: string | null
): FleetGraphShipApiClient {
  return new FleetGraphHttpShipApiClient({
    baseUrl,
    authHeaders: {
      Cookie: cookieHeader,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
}
