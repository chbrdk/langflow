import type { Viewport } from "@xyflow/react";

export type PresenceFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
};

export type PresencePerson = PresenceFrame & {
  id: string;
  user_id: string;
  username: string;
  color: string;
};

/** The rectangle another person can draw, in flow coordinates. */
export function visibleFrame(
  viewport: Pick<Viewport, "x" | "y" | "zoom">,
  paneWidth: number,
  paneHeight: number,
): PresenceFrame | null {
  const { zoom } = viewport;
  if (!Number.isFinite(zoom) || zoom <= 0) return null;
  if (paneWidth <= 0 || paneHeight <= 0) return null;
  return {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width: paneWidth / zoom,
    height: paneHeight / zoom,
    zoom,
  };
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
    const numbers = ["x", "y", "width", "height", "zoom"] as const;
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
        width: person.width as number,
        height: person.height as number,
        zoom: person.zoom as number,
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
