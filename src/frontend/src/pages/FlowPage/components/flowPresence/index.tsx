import { useViewport, ViewportPortal } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { flowPoint } from "@/hooks/flows/presence";
import { useFlowPresence } from "@/hooks/flows/use-flow-presence";
import useFlowStore from "@/stores/flowStore";

/** The other pointers on this canvas, and their saved graph when ours is clean. */
export function FlowPresence() {
  const { t } = useTranslation();
  const flowId = useFlowStore((state) => state.currentFlow?.id);
  const instance = useFlowStore((state) => state.reactFlowInstance);
  const viewport = useViewport();
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { people, onMove } = useFlowPresence(flowId, () => {
    const camera = instance?.getViewport() ?? viewport;
    const pane = document.getElementById("react-flow-id");
    const point = lastClient.current;
    if (!camera || !pane || !point) return null;
    return flowPoint(point.x, point.y, pane.getBoundingClientRect(), camera);
  });

  useEffect(() => {
    setHost(document.getElementById("react-flow-id"));
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const pane = document.getElementById("react-flow-id");
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        if (lastClient.current === null) return;
        lastClient.current = null;
        onMove();
        return;
      }
      lastClient.current = { x: event.clientX, y: event.clientY };
      onMove();
    };
    window.addEventListener("pointermove", move, true);
    return () => window.removeEventListener("pointermove", move, true);
  }, [onMove]);

  useEffect(() => {
    onMove();
  }, [viewport.x, viewport.y, viewport.zoom, onMove]);

  const names = [...new Set(people.map((person) => person.username))];
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  const roster =
    names.length === 0 ? null : (
      <div
        className="pointer-events-none absolute top-16 left-3 z-[80] flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
        aria-label={t("presence.alsoHere")}
      >
        <span>{t("presence.alsoHere")}</span>
        {names.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    );

  return (
    <>
      <ViewportPortal>
        {people.map((person) => {
          if (typeof person.x !== "number" || typeof person.y !== "number") {
            return null;
          }
          return (
            <div
              key={person.id}
              className="pointer-events-none absolute"
              style={{
                left: person.x,
                top: person.y,
                transform: `scale(${1 / zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 18 18"
                aria-hidden="true"
                style={{ color: person.color }}
              >
                <path
                  d="M1 1 L1 15 L5.2 11.2 L8.4 17 L10.6 16 L7.4 10.2 L13 10 Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>
              <span
                className="absolute top-4 left-3 whitespace-nowrap rounded px-1 text-[11px] text-white"
                style={{ background: person.color }}
              >
                {person.username}
              </span>
            </div>
          );
        })}
      </ViewportPortal>
      {host && roster ? createPortal(roster, host) : null}
    </>
  );
}
