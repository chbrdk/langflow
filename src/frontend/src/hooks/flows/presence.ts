import type { Viewport } from "@xyflow/react";

export type PresencePointer = {
  x: number;
  y: number;
};

export type PresencePerson = PresencePointer & {
  id: string;
  user_id: string;
  username: string;
  color: string;
};

type PaneBox = { left: number; top: number; right: number; bottom: number };

/** Where the mouse is on the canvas, in flow coordinates. */
export function flowPoint(
  clientX: number,
  clientY: number,
  pane: PaneBox,
  viewport: Pick<Viewport, "x" | "y" | "zoom">,
): PresencePointer | null {
  const { zoom } = viewport;
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  if (
    clientX < pane.left ||
    clientX > pane.right ||
    clientY < pane.top ||
    clientY > pane.bottom
  ) {
    return null;
  }
  const x = (clientX - pane.left - viewport.x) / zoom;
  const y = (clientY - pane.top - viewport.y) / zoom;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** The same point in pixels inside the pane, so the cursor stays one size. */
export function screenPoint(
  pointer: PresencePointer,
  viewport: Pick<Viewport, "x" | "y" | "zoom">,
): PresencePointer | null {
  const { zoom } = viewport;
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  const x = pointer.x * zoom + viewport.x;
  const y = pointer.y * zoom + viewport.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * A saved graph from someone else replaces the canvas only while this person
 * has nothing of their own waiting to be saved.
 */
export function shouldPullRemoteSave(state: {
  flowId: string;
  currentFlowId: string | undefined;
  edited: boolean;
  saveLoading: boolean;
  dragging: boolean;
  conflictFlowId: string | null;
}): boolean {
  if (!state.flowId || state.currentFlowId !== state.flowId) return false;
  if (state.edited || state.saveLoading || state.dragging) return false;
  return state.conflictFlowId !== state.flowId;
}

export function peopleFromMessage(message: unknown): PresencePerson[] | null {
  if (message === null || typeof message !== "object") return null;
  const row = message as { type?: unknown; people?: unknown };
  if (row.type !== "present" || !Array.isArray(row.people)) return null;
  return row.people.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const person = item as Record<string, unknown>;
    const numbers = ["x", "y"] as const;
    if (numbers.some((key) => typeof person[key] !== "number")) return [];
    if (typeof person.id !== "string" || typeof person.username !== "string") {
      return [];
    }
    return [
      {
        id: person.id,
        user_id:
          typeof person.user_id === "string" ? person.user_id : person.id,
        username: person.username,
        color: typeof person.color === "string" ? person.color : "#0f766e",
        x: person.x as number,
        y: person.y as number,
      },
    ];
  });
}

export function isRemoteSave(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "saved"
  );
}

/** Same host as the page, so the session cookie goes with the socket. */
export function presenceSocketUrl(
  flowPath: string,
  page: { protocol: string; host: string },
): string {
  const url = new URL(flowPath, `${page.protocol}//${page.host}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
