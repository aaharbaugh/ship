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

function colorForType(documentType: string): string {
  return NODE_COLORS[documentType] ?? '#334155';
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function FleetGraphViewer({
  rootDocumentId,
  graph,
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
}) {
  const nodes = useMemo<Node[]>(() => (
    graph.nodes.map((node) => {
      const seed = hashId(node.id);
      const x = (seed % 5) * 220;
      const y = Math.floor(seed / 5 % 5) * 140;
      const isRoot = node.id === rootDocumentId;
      const color = colorForType(node.documentType);

      return {
        id: node.id,
        position: { x, y },
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
          border: `2px solid ${isRoot ? color : `${color}66`}`,
          background: isRoot ? `${color}18` : '#ffffff',
          boxShadow: isRoot ? `0 0 0 4px ${color}1f` : '0 1px 2px rgba(15, 23, 42, 0.08)',
          color: '#0f172a',
          padding: 10,
        },
      };
    })
  ), [graph.nodes, rootDocumentId]);

  const edges = useMemo<Edge[]>(() => (
    graph.edges.map((edge, index) => ({
      id: `${edge.from}-${edge.to}-${edge.relationshipType}-${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.relationshipType,
      labelStyle: {
        fontSize: 10,
        fontWeight: 600,
        fill: '#475569',
      },
      style: {
        stroke: '#94a3b8',
        strokeWidth: edge.direction === 'parent' ? 2 : 1.5,
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
      >
        <Background color="#e2e8f0" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
