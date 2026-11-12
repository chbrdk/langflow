import useFlowStore from "@/stores/flowStore";
import type { GraphOp } from "./graph-ops";

type Send = (message: object) => boolean;

let sender: Send | null = null;
let applying = false;
let lastPersistSent = false;
const pendingMoves = new Map<string, GraphOp>();
let moveTimer: number | undefined;

export function isApplyingRemote(): boolean {
  return applying;
}

export function runAsRemote(apply: () => void): void {
  applying = true;
  try {
    apply();
  } finally {
    applying = false;
  }
}

export function bindGraphChannel(send: Send): () => void {
  sender = send;
  return () => {
    if (sender === send) sender = null;
  };
}

/** True once, after a change was handed to the channel instead of a full save. */
export function consumePersistSent(): boolean {
  const sent = lastPersistSent;
  lastPersistSent = false;
  return sent;
}

export function publishGraphOps(
  ephemeral: GraphOp[],
  persisted: GraphOp[],
): void {
  if (!sender || applying) return;
  if (ephemeral.length > 0) {
    for (const op of ephemeral) {
      if (op.op === "move") pendingMoves.set(op.id, op);
    }
    if (moveTimer === undefined) {
      moveTimer = window.setTimeout(() => {
        moveTimer = undefined;
        const ops = [...pendingMoves.values()];
        pendingMoves.clear();
        if (ops.length > 0) sender?.({ type: "ops", persist: false, ops });
      }, 50);
    }
  }
  if (persisted.length === 0) return;
  for (const op of persisted) {
    if (op.op === "move") pendingMoves.delete(op.id);
  }
  if (sender({ type: "ops", persist: true, ops: persisted })) {
    lastPersistSent = true;
  }
}

export function noteGraphRejected(): void {
  pendingMoves.clear();
  window.clearTimeout(moveTimer);
  moveTimer = undefined;
  void useFlowStore.getState().autoSaveFlow?.flush();
}
