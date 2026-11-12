import { useOnViewportChange, ViewportPortal } from "@xyflow/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { visibleFrame } from "@/hooks/flows/presence";
import { useFlowPresence } from "@/hooks/flows/use-flow-presence";
import useFlowStore from "@/stores/flowStore";

/** Where the other people are looking, and their saved graph when ours is clean. */
export function FlowPresence() {
  const { t } = useTranslation();
  const flowId = useFlowStore((state) => state.currentFlow?.id);
  const instance = useFlowStore((state) => state.reactFlowInstance);
  const { people, onMove } = useFlowPresence(flowId, () => {
    const viewport = instance?.getViewport();
    const pane = document.getElementById("react-flow-id");
    if (!viewport || !pane) return null;
    return visibleFrame(viewport, pane.clientWidth, pane.clientHeight);
  });

  useOnViewportChange({ onChange: onMove });

  useEffect(() => {
    const pane = document.getElementById("react-flow-id");
    if (!pane || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => onMove());
    observer.observe(pane);
    return () => observer.disconnect();
  }, [onMove]);

  const names = [...new Set(people.map((person) => person.username))];
  const host = document.getElementById("react-flow-id");
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

  return (
    <>
      <ViewportPortal>
        {people.map((person) => (
          <div
            key={person.id}
            className="pointer-events-none absolute"
            style={{
              left: person.x,
              top: person.y,
              width: person.width,
              height: person.height,
              outline: `2px solid ${person.color}`,
              outlineOffset: "-2px",
            }}
          >
            <span
              className="absolute top-1 left-1 rounded px-1 text-[11px] text-white"
              style={{ background: person.color }}
            >
              {person.username}
            </span>
          </div>
        ))}
      </ViewportPortal>
      {host && roster ? createPortal(roster, host) : roster}
    </>
  );
}
