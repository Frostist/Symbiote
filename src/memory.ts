import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface MemoryNode {
  id: string;
  type: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEdge {
  id: string;
  fromId: string;
  toId: string;
  relation: string;
  createdAt: string;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

const MEMORY_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.symbiote'
);

function getMemoryPath(sandboxPath: string): string {
  const safe = sandboxPath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return path.join(MEMORY_DIR, `memory_${safe}.json`);
}

export function loadGraph(sandboxPath: string): MemoryGraph {
  const filePath = getMemoryPath(sandboxPath);
  if (!fs.existsSync(filePath)) return { nodes: [], edges: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MemoryGraph;
  } catch {
    return { nodes: [], edges: [] };
  }
}

function saveGraph(sandboxPath: string, graph: MemoryGraph): void {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(getMemoryPath(sandboxPath), JSON.stringify(graph, null, 2), 'utf-8');
}

export function storeNode(
  sandboxPath: string,
  type: string,
  content: string,
  tags: string[]
): MemoryNode {
  const graph = loadGraph(sandboxPath);
  const now = new Date().toISOString();

  const existing = graph.nodes.find(
    (n) => n.content.toLowerCase() === content.toLowerCase()
  );
  if (existing) {
    existing.type = type;
    existing.tags = Array.from(new Set([...existing.tags, ...tags]));
    existing.updatedAt = now;
    saveGraph(sandboxPath, graph);
    return existing;
  }

  const node: MemoryNode = {
    id: randomUUID(),
    type,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
  };
  graph.nodes.push(node);
  saveGraph(sandboxPath, graph);
  return node;
}

export function connectNodes(
  sandboxPath: string,
  fromId: string,
  toId: string,
  relation: string
): MemoryEdge {
  const graph = loadGraph(sandboxPath);
  const existing = graph.edges.find(
    (e) => e.fromId === fromId && e.toId === toId && e.relation === relation
  );
  if (existing) return existing;

  const edge: MemoryEdge = {
    id: randomUUID(),
    fromId,
    toId,
    relation,
    createdAt: new Date().toISOString(),
  };
  graph.edges.push(edge);
  saveGraph(sandboxPath, graph);
  return edge;
}

export function searchNodes(
  sandboxPath: string,
  query: string
): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
  const graph = loadGraph(sandboxPath);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) {
    return { nodes: graph.nodes.slice(-10), edges: graph.edges };
  }

  const scored = graph.nodes.map((node) => {
    const haystack =
      `${node.content} ${node.tags.join(' ')} ${node.type}`.toLowerCase();
    const score = terms.filter((t) => haystack.includes(t)).length;
    return { node, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => s.node);

  const matchedIds = new Set(matched.map((n) => n.id));
  const relatedEdges = graph.edges.filter(
    (e) => matchedIds.has(e.fromId) || matchedIds.has(e.toId)
  );

  const allIds = new Set([
    ...matched.map((n) => n.id),
    ...relatedEdges.map((e) => e.fromId),
    ...relatedEdges.map((e) => e.toId),
  ]);
  const allNodes = graph.nodes.filter((n) => allIds.has(n.id));

  return { nodes: allNodes, edges: relatedEdges };
}

export function buildMemoryContext(sandboxPath: string, userMessage: string): string {
  const { nodes, edges } = searchNodes(sandboxPath, userMessage);
  if (nodes.length === 0) return '';

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const lines = nodes.map((node) => {
    const date = node.updatedAt.slice(0, 10);
    const tagStr = node.tags.length > 0 ? ` (tags: ${node.tags.join(', ')})` : '';
    let line = `[${node.type}] ${node.content}${tagStr} [${date}]`;

    const outEdges = edges.filter((e) => e.fromId === node.id);
    for (const edge of outEdges) {
      const target = nodeMap.get(edge.toId);
      if (target) {
        line += `\n  → ${edge.relation}: "${target.content}"`;
      }
    }
    return line;
  });

  return `--- Relevant Memories ---\n${lines.join('\n')}\n--- End Memories ---`;
}
