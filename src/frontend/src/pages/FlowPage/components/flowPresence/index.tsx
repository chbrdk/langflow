import { useOnViewportChange, type Viewport } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { flowPoint, screenPoint } from "@/hooks/flows/presence";
import { useFlowPresence } from "@/hooks/flows/use-flow-presence";
import useFlowStore from "@/stores/flowStore";

/** The other pointers on this canvas, and their saved graph when ours is clean. */
export function FlowPresence() {
  const { t } = useTranslation();
  const flowId = useFlowStore((state) => state.currentFlow?.id);
  const instance = useFlowStore((state) => state.reactFlowInstance);
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const { people, onMove } = useFlowPresence(flowId, () => {
    const camera = instance?.getViewport();
    const pane = document.getElementById("react-flow-id");
    const point = lastClient.current;
    if (!camera || !pane || !point) return null;
    return flowPoint(point.x, point.y, pane.getBoundingClientRect(), camera);
  });

  useOnViewportChange({
    onChange: (next) => {
      setViewport(next);
      onMove();
    },
  });

  useEffect(() => {
    const pane = document.getElementById("react-flow-id");
    if (!pane) return;
    const move = (event: PointerEvent) => {
      lastClient.current = { x: event.clientX, y: event.clientY };
      onMove();
    };
    const leave = () => {
      lastClient.current = null;
      onMove();
    };
    pane.addEventListener("pointermove", move);
    pane.addEventListener("pointerleave", leave);
    return () => {
      pane.removeEventListener("pointermove", move);
      pane.removeEventListener("pointerleave", leave);
    };
  }, [onMove]);

  const names = [...new Set(people.map((person) => person.username))];
  const host = document.getElementById("react-flow-id");
  const camera = viewport ?? instance?.getViewport() ?? null;
  const roster =
    names.length === 0 ? null : (
      <div
        className="pointer-events-none absolute top-16 left-3 z-50 flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
        aria-label={t("presence.alsoHere")}
      >
        <span>{t("presence.alsoHere")}</span>
        {names.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    );
  const cursors =
    camera === null
      ? null
      : people.map((person) => {
          const point = screenPoint(person, camera);
          if (!point) return null;
          return (
            <div
              key={person.id}
              className="pointer-events-none absolute z-50"
              style={{ left: point.x, top: point.y }}
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
        });

  const layer = (
    <>
      {cursors}
      {roster}
    </>
  );

  return host ? createPortal(layer, host) : null;
}
