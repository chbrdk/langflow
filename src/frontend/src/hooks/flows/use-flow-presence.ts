import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import useFlowConflictStore from "@/stores/flowConflictStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { FlowType } from "@/types/flow";
import {
  isRemoteSave,
  type PresenceFrame,
  type PresencePerson,
  peopleFromMessage,
  presenceSocketUrl,
  shouldPullRemoteSave,
} from "./presence";
import { adoptRemoteSave } from "./presence-sync";

const VIEW_INTERVAL_MS = 200;

function pullDecision(flowId: string): boolean {
  return shouldPullRemoteSave({
    flowId,
    currentFlowId: useFlowsManagerStore.getState().currentFlowId,
    edited: useFlowStore.getState().userEditedSinceLoad,
    saveLoading: useFlowsManagerStore.getState().saveLoading,
    conflictFlowId: useFlowConflictStore.getState().conflict?.flowId ?? null,
  });
}

/** The other people in this flow, and a way to tell them the camera moved. */
export function useFlowPresence(
  flowId: string | undefined,
  readFrame: () => PresenceFrame | null,
): { people: PresencePerson[]; onMove: () => void } {
  const readFrameRef = useRef(readFrame);
  readFrameRef.current = readFrame;
  const socketRef = useRef<WebSocket | null>(null);
  const [people, setPeople] = useState<PresencePerson[]>([]);

  const sendView = useCallback(() => {
    const socket = socketRef.current;
    const frame = readFrameRef.current();
    if (!socket || socket.readyState !== 1 || !frame) return;
    socket.send(JSON.stringify({ type: "view", ...frame }));
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
      socket.onopen = () => sendView();
      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const next = peopleFromMessage(message);
        if (next) setPeople(next);
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
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.removeEventListener("langflow-flow-saved", onSaved);
      socket?.close();
      socketRef.current = null;
      setPeople([]);
    };
  }, [flowId, sendView]);

  return { people, onMove };
}
