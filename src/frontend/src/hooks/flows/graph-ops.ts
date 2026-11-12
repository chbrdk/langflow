const UI_KEYS = [
  "selected",
  "dragging",
  "resizing",
  "positionAbsolute",
  "measured",
  "width",
  "height",
] as const;

export type GraphNode = {
  id: string;
  position: { x: number; y: number };
  dragging?: boolean;
  [key: string]: unknown;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
};

export type GraphOp =
  | { op: "move"; id: string; x: number; y: number }
  | { op: "remove"; id: string }
  | { op: "disconnect"; id: string }
  | { op: "upsert"; node: GraphNode }
  | { op: "connect"; edge: GraphEdge };

export function cleanNode(node: GraphNode): GraphNode {
  const copy: GraphNode = { ...node, position: { ...node.position } };
  for (const key of UI_KEYS) delete copy[key];
  return copy;
}

function cleanEdge(edge: GraphEdge): GraphEdge {
  const copy: GraphEdge = { ...edge };
  for (const key of UI_KEYS) delete copy[key];
  return copy;
}

function moved(left: GraphNode, right: GraphNode): boolean {
  return (
    Math.abs(left.position.x - right.position.x) > 0.01 ||
    Math.abs(left.position.y - right.position.y) > 0.01
  );
}

/** What changed between two canvases, split into live motion and saved structure. */
export function diffGraph(
  prevNodes: GraphNode[],
  prevEdges: GraphEdge[],
  nextNodes: GraphNode[],
  nextEdges: GraphEdge[],
): { ephemeral: GraphOp[]; persisted: GraphOp[] } {
  const ephemeral: GraphOp[] = [];
  const persisted: GraphOp[] = [];
  const prevById = new Map(prevNodes.map((node) => [node.id, node]));
  const nextById = new Map(nextNodes.map((node) => [node.id, node]));

  for (const node of prevNodes) {
    if (!nextById.has(node.id)) persisted.push({ op: "remove", id: node.id });
  }
  for (const node of nextNodes) {
    const previous = prevById.get(node.id);
    if (!previous) {
      persisted.push({ op: "upsert", node: cleanNode(node) });
      continue;
    }
    if (!moved(previous, node)) continue;
    const move: GraphOp = {
      op: "move",
      id: node.id,
      x: node.position.x,
      y: node.position.y,
    };
    if (node.dragging) ephemeral.push(move);
    else persisted.push(move);
  }

  const prevEdgeIds = new Set(prevEdges.map((edge) => edge.id));
  const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));
  for (const edge of prevEdges) {
    if (!nextEdgeIds.has(edge.id))
      persisted.push({ op: "disconnect", id: edge.id });
  }
  for (const edge of nextEdges) {
    const previous = prevEdges.find((item) => item.id === edge.id);
    if (!previous) {
      persisted.push({ op: "connect", edge: cleanEdge(edge) });
      continue;
    }
    if (!prevEdgeIds.has(edge.id)) continue;
    const before = JSON.stringify(cleanEdge(previous));
    const after = JSON.stringify(cleanEdge(edge));
    if (before !== after)
      persisted.push({ op: "connect", edge: cleanEdge(edge) });
  }

  return { ephemeral, persisted };
}

export function applyGraphOps(
  nodes: GraphNode[],
  edges: GraphEdge[],
  ops: GraphOp[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  let nextNodes = nodes;
  let nextEdges = edges;
  for (const op of ops) {
    if (op.op === "move") {
      nextNodes = nextNodes.map((node) =>
        node.id === op.id ? { ...node, position: { x: op.x, y: op.y } } : node,
      );
    } else if (op.op === "remove") {
      nextNodes = nextNodes.filter((node) => node.id !== op.id);
      nextEdges = nextEdges.filter(
        (edge) => edge.source !== op.id && edge.target !== op.id,
      );
    } else if (op.op === "disconnect") {
      nextEdges = nextEdges.filter((edge) => edge.id !== op.id);
    } else if (op.op === "upsert") {
      const cleaned = cleanNode(op.node);
      const exists = nextNodes.some((node) => node.id === cleaned.id);
      nextNodes = exists
        ? nextNodes.map((node) => (node.id === cleaned.id ? cleaned : node))
        : [...nextNodes, cleaned];
    } else if (op.op === "connect") {
      const cleaned = cleanEdge(op.edge);
      const exists = nextEdges.some((edge) => edge.id === cleaned.id);
      nextEdges = exists
        ? nextEdges.map((edge) => (edge.id === cleaned.id ? cleaned : edge))
        : [...nextEdges, cleaned];
    }
  }
  return { nodes: nextNodes, edges: nextEdges };
}

/** Keep a node where this person is still holding it. */
export function protectDraggedNodes(
  ops: GraphOp[],
  nodes: GraphNode[],
): GraphOp[] {
  const dragging = new Set(
    nodes.filter((node) => node.dragging).map((node) => node.id),
  );
  if (dragging.size === 0) return ops;
  return ops.flatMap((op) => {
    if (op.op === "move" && dragging.has(op.id)) return [];
    if (op.op === "upsert" && dragging.has(String(op.node.id))) {
      const local = nodes.find((node) => node.id === op.node.id);
      if (!local) return [op];
      return [{ ...op, node: { ...op.node, position: { ...local.position } } }];
    }
    return [op];
  });
}

export function opsFromMessage(message: unknown): {
  kind: "ops" | "revision";
  ops: GraphOp[];
  versionToken: string | null;
} | null {
  if (message === null || typeof message !== "object") return null;
  const row = message as {
    type?: unknown;
    ops?: unknown;
    version_token?: unknown;
  };
  if (row.type !== "ops" && row.type !== "revision") return null;
  if (!Array.isArray(row.ops)) return null;
  const ops = row.ops.filter(isGraphOp);
  if (ops.length === 0 || ops.length !== row.ops.length) return null;
  return {
    kind: row.type,
    ops,
    versionToken:
      typeof row.version_token === "string" ? row.version_token : null,
  };
}

export function isRejectedMessage(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "rejected"
  );
}

function isGraphOp(value: unknown): value is GraphOp {
  if (value === null || typeof value !== "object") return false;
  const op = value as {
    op?: unknown;
    id?: unknown;
    x?: unknown;
    y?: unknown;
    node?: { id?: unknown };
    edge?: { id?: unknown };
  };
  if (op.op === "move") {
    return (
      typeof op.id === "string" &&
      typeof op.x === "number" &&
      typeof op.y === "number"
    );
  }
  if (op.op === "remove" || op.op === "disconnect") {
    return typeof op.id === "string";
  }
  if (op.op === "upsert") return typeof op.node?.id === "string";
  if (op.op === "connect") return typeof op.edge?.id === "string";
  return false;
}
