import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import useFlowConflictStore from "@/stores/flowConflictStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { FlowType } from "@/types/flow";
import {
  bindGraphChannel,
  isApplyingRemote,
  noteGraphRejected,
  publishGraphOps,
} from "./graph-channel";
import {
  diffGraph,
  type GraphEdge,
  type GraphNode,
  isRejectedMessage,
  opsFromMessage,
} from "./graph-ops";
import {
  isRemoteSave,
  type PresencePerson,
  type PresencePointer,
  peopleFromMessage,
  presenceSocketUrl,
  shouldPullRemoteSave,
} from "./presence";
import {
  adoptGraphRevision,
  adoptRemoteSave,
  applyRemoteGraph,
} from "./presence-sync";

const VIEW_INTERVAL_MS = 50;

function pullDecision(flowId: string): boolean {
  return shouldPullRemoteSave({
    flowId,
    currentFlowId: useFlowsManagerStore.getState().currentFlowId,
    edited: useFlowStore.getState().userEditedSinceLoad,
    saveLoading: useFlowsManagerStore.getState().saveLoading,
    dragging: useFlowStore.getState().nodes.some((node) => node.dragging),
    conflictFlowId: useFlowConflictStore.getState().conflict?.flowId ?? null,
  });
}

/** The other people in this flow, and a way to tell them where the pointer is. */
export function useFlowPresence(
  flowId: string | undefined,
  readPointer: () => PresencePointer | null,
): { people: PresencePerson[]; onMove: () => void } {
  const readPointerRef = useRef(readPointer);
  readPointerRef.current = readPointer;
  const socketRef = useRef<WebSocket | null>(null);
  const lastSent = useRef("");
  const [people, setPeople] = useState<PresencePerson[]>([]);

  const sendView = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== 1) return;
    const pointer = readPointerRef.current();
    const payload = pointer
      ? { type: "view", x: pointer.x, y: pointer.y }
      : { type: "view" };
    const encoded = JSON.stringify(payload);
    if (encoded === lastSent.current) return;
    lastSent.current = encoded;
    socket.send(encoded);
  }, []);

  const onMove = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== 1) return;
    const waiting = socket as WebSocket & { presenceTimer?: number };
    if (waiting.presenceTimer !== undefined) return;
    waiting.presenceTimer = window.setTimeout(() => {
      waiting.presenceTimer = undefined;
      sendView();
    }, VIEW_INTERVAL_MS);
  }, [sendView]);

  useEffect(() => {
    if (!flowId) {
      setPeople([]);
      return;
    }
    let stopped = false;
    let retry: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (stopped) return;
      const url = presenceSocketUrl(
        `${getURL("FLOWS")}/${flowId}/presence`,
        window.location,
      );
      socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        lastSent.current = "";
        sendView();
      };
      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const next = peopleFromMessage(message);
        if (next) setPeople(next);
        if (isRejectedMessage(message)) {
          noteGraphRejected();
          return;
        }
        const ops = opsFromMessage(message);
        if (ops?.kind === "ops") {
          applyRemoteGraph(ops.ops, ops.versionToken);
          return;
        }
        if (ops?.kind === "revision") {
          adoptGraphRevision(ops.ops, ops.versionToken);
          return;
        }
        if (!isRemoteSave(message) || !pullDecision(flowId)) return;
        api
          .get<FlowType>(`${getURL("FLOWS")}/${flowId}`)
          .then((response) => {
            if (!stopped && pullDecision(flowId))
              adoptRemoteSave(response.data);
          })
          .catch(() => undefined);
      };
      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped || event.code === 1008) return;
        retry = window.setTimeout(connect, 2000);
      };
    };

    const onSaved = (event: Event) => {
      const savedId = (event as CustomEvent<{ flowId?: string }>).detail
        ?.flowId;
      const current = socketRef.current;
      if (savedId !== flowId || !current || current.readyState !== 1) return;
      current.send(JSON.stringify({ type: "saved" }));
    };

    connect();
    window.addEventListener("langflow-flow-saved", onSaved);
    const previous = {
      nodes: useFlowStore.getState().nodes as GraphNode[],
      edges: useFlowStore.getState().edges as GraphEdge[],
    };
    const unbind = bindGraphChannel((payload) => {
      const current = socketRef.current;
      if (!current || current.readyState !== 1) return false;
      current.send(JSON.stringify(payload));
      return true;
    });
    const unsubscribe = useFlowStore.subscribe((state) => {
      const before = {
        nodes: previous.nodes,
        edges: previous.edges,
      };
      previous.nodes = state.nodes as GraphNode[];
      previous.edges = state.edges as GraphEdge[];
      if (isApplyingRemote()) return;
      const diff = diffGraph(
        before.nodes,
        before.edges,
        state.nodes as GraphNode[],
        state.edges as GraphEdge[],
      );
      publishGraphOps(diff.ephemeral, diff.persisted);
    });
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.removeEventListener("langflow-flow-saved", onSaved);
      unsubscribe();
      unbind();
      socket?.close();
      socketRef.current = null;
      setPeople([]);
    };
  }, [flowId, sendView]);

  return { people, onMove };
}
