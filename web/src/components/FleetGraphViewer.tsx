import { useMemo } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_COLORS: Record<string, string> = {
  project: '#0f766e',
  issue: '#b45309',
  sprint: '#1d4ed8',
  standup: '#7c3aed',
  program: '#be123c',
  wiki: '#475569',
  weekly_plan: '#15803d',
  weekly_retro: '#9333ea',
  weekly_review: '#c2410c',
  person: '#374151',
};
const COLUMN_X_SPACING = 320;
const INNER_COLUMN_X_SPACING = 210;
const ROW_Y_SPACING = 140;
const MAX_ROWS_PER_COLUMN = 6;
const EDGE_LABEL_THRESHOLD = 18;

function colorForType(documentType: string): string {
  return NODE_COLORS[documentType] ?? '#334155';
}

export function FleetGraphViewer({
  rootDocumentId,
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  rootDocumentId: string;
  graph: {
    nodes: Array<{
      id: string;
      documentType: string;
      title: string;
      parentId: string | null;
    }>;
    edges: Array<{
      from: string;
      to: string;
      relationshipType: string;
      direction: string;
    }>;
  };
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
}) {
  const layoutPositions = useMemo(
    () => buildFleetGraphLayout(rootDocumentId, graph),
    [rootDocumentId, graph]
  );

  const nodes = useMemo<Node[]>(() => (
    graph.nodes.map((node) => {
      const position = layoutPositions.get(node.id) ?? { x: 0, y: 0 };
      const isRoot = node.id === rootDocumentId;
      const isSelected = node.id === selectedNodeId;
      const color = colorForType(node.documentType);

      return {
        id: node.id,
        position,
        data: {
          label: (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide opacity-70">
                {node.documentType}
              </div>
              <div className="text-sm font-medium leading-tight">
                {node.title}
              </div>
            </div>
          ),
        },
        style: {
          width: 180,
          borderRadius: 14,
          border: `2px solid ${isSelected || isRoot ? color : `${color}66`}`,
          background: isSelected ? `${color}20` : isRoot ? `${color}18` : '#ffffff',
          boxShadow: isSelected
            ? `0 0 0 4px ${color}24`
            : isRoot
              ? `0 0 0 4px ${color}1f`
              : '0 1px 2px rgba(15, 23, 42, 0.08)',
          color: '#0f172a',
          padding: 10,
        },
      };
    })
  ), [graph.nodes, layoutPositions, rootDocumentId, selectedNodeId]);

  const edges = useMemo<Edge[]>(() => (
    graph.edges.map((edge, index) => ({
      id: `${edge.from}-${edge.to}-${edge.relationshipType}-${index}`,
      source: edge.from,
      target: edge.to,
      label: graph.edges.length <= EDGE_LABEL_THRESHOLD ? edge.relationshipType : undefined,
      labelStyle: graph.edges.length <= EDGE_LABEL_THRESHOLD ? {
        fontSize: 10,
        fontWeight: 600,
        fill: '#475569',
      } : undefined,
      style: {
        stroke: '#94a3b8',
        strokeWidth: edge.direction === 'parent' ? 2 : 1.5,
      },
      type: 'smoothstep',
      pathOptions: {
        borderRadius: 18,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: '#94a3b8',
      },
    }))
  ), [graph.edges]);

  return (
    <div className="h-[380px] overflow-hidden rounded-xl border border-border bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.3}
        onNodeClick={(_event, node) => onSelectNode?.(node.id)}
      >
        <Background color="#e2e8f0" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function buildFleetGraphLayout(
  rootDocumentId: string,
  graph: {
    nodes: Array<{
      id: string;
      documentType: string;
      title: string;
      parentId: string | null;
    }>;
    edges: Array<{
      from: string;
      to: string;
      relationshipType: string;
      direction: string;
    }>;
  }
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const columnByNode = new Map<string, number>([[rootDocumentId, 0]]);
  const adjacency = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);

    if (edge.from === rootDocumentId && !columnByNode.has(edge.to)) {
      columnByNode.set(edge.to, -1);
    }
    if (edge.to === rootDocumentId && !columnByNode.has(edge.from)) {
      columnByNode.set(edge.from, 1);
    }
  }

  const queue = [...columnByNode.keys()];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentColumn = columnByNode.get(current) ?? 0;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (columnByNode.has(neighbor)) continue;
      columnByNode.set(
        neighbor,
        currentColumn === 0 ? 1 : currentColumn + Math.sign(currentColumn)
      );
      queue.push(neighbor);
    }
  }

  const columns = new Map<number, Array<{ id: string; documentType: string; title: string }>>();
  for (const node of graph.nodes) {
    const column = columnByNode.get(node.id) ?? 1;
    const bucket = columns.get(column) ?? [];
    bucket.push({ id: node.id, documentType: node.documentType, title: node.title });
    columns.set(column, bucket);
  }

  const orderedColumns = [...columns.keys()].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  const orderByNode = new Map<string, number>([[rootDocumentId, 0]]);

  for (const column of orderedColumns) {
    const bucket = columns.get(column);
    if (!bucket) {
      continue;
    }

    const referenceColumn = column === 0
      ? null
      : column > 0
        ? column - 1
        : column + 1;

    bucket.sort((left, right) => {
      const leftScore = computeNodeSortScore(left.id, referenceColumn, columnByNode, adjacency, orderByNode);
      const rightScore = computeNodeSortScore(right.id, referenceColumn, columnByNode, adjacency, orderByNode);

      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      return left.documentType === right.documentType
        ? left.title.localeCompare(right.title)
        : left.documentType.localeCompare(right.documentType);
    });

    bucket.forEach((node, index) => {
      const subColumnCount = Math.ceil(bucket.length / MAX_ROWS_PER_COLUMN);
      const subColumnIndex = Math.floor(index / MAX_ROWS_PER_COLUMN);
      const rowIndex = index % MAX_ROWS_PER_COLUMN;
      const rowsInSubColumn =
        subColumnIndex === subColumnCount - 1
          ? bucket.length - subColumnIndex * MAX_ROWS_PER_COLUMN
          : MAX_ROWS_PER_COLUMN;
      const subColumnOffset =
        (subColumnIndex - (subColumnCount - 1) / 2) * INNER_COLUMN_X_SPACING;
      const totalHeight = (rowsInSubColumn - 1) * ROW_Y_SPACING;

      positions.set(node.id, {
        x: (column + 2) * COLUMN_X_SPACING + subColumnOffset,
        y: rowIndex * ROW_Y_SPACING - totalHeight / 2 + 160,
      });
      orderByNode.set(node.id, index);
    });
  }

  return positions;
}

function computeNodeSortScore(
  nodeId: string,
  referenceColumn: number | null,
  columnByNode: Map<string, number>,
  adjacency: Map<string, Set<string>>,
  orderByNode: Map<string, number>
): number {
  if (referenceColumn === null) {
    return 0;
  }

  const neighborOrders = [...(adjacency.get(nodeId) ?? [])]
    .filter((neighborId) => columnByNode.get(neighborId) === referenceColumn)
    .map((neighborId) => orderByNode.get(neighborId))
    .filter((value): value is number => typeof value === 'number');

  if (neighborOrders.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return neighborOrders.reduce((sum, value) => sum + value, 0) / neighborOrders.length;
}
