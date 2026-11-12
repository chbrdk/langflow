import {
  flowPoint,
  peopleFromMessage,
  presenceSocketUrl,
  screenPoint,
  shouldPullRemoteSave,
} from "../presence";

describe("presence", () => {
  it("turns the mouse into a flow point and back into a fixed-size cursor", () => {
    const pane = { left: 10, top: 20, right: 410, bottom: 220 };
    const viewport = { x: -100, y: -50, zoom: 2 };
    const pointer = flowPoint(110, 70, pane, viewport);
    expect(pointer).toEqual({ x: 100, y: 50 });
    expect(screenPoint(pointer!, viewport)).toEqual({ x: 100, y: 50 });
    expect(flowPoint(0, 70, pane, viewport)).toBeNull();
    expect(flowPoint(110, 70, pane, { x: 0, y: 0, zoom: 0 })).toBeNull();
  });

  it("keeps a local edit and an open conflict on this canvas", () => {
    const clean = {
      flowId: "flow-1",
      currentFlowId: "flow-1",
      edited: false,
      saveLoading: false,
      dragging: false,
      conflictFlowId: null,
    };
    expect(shouldPullRemoteSave(clean)).toBe(true);
    expect(shouldPullRemoteSave({ ...clean, edited: true })).toBe(false);
    expect(shouldPullRemoteSave({ ...clean, saveLoading: true })).toBe(false);
    expect(shouldPullRemoteSave({ ...clean, conflictFlowId: "flow-1" })).toBe(
      false,
    );
    expect(shouldPullRemoteSave({ ...clean, currentFlowId: "other" })).toBe(
      false,
    );
  });

  it("keeps the cookie on this host and drops a forged person", () => {
    expect(
      presenceSocketUrl("/api/v1/flows/flow-1/presence", {
        protocol: "https:",
        host: "langflow.projects-a.plygrnd.tech",
      }),
    ).toBe(
      "wss://langflow.projects-a.plygrnd.tech/api/v1/flows/flow-1/presence",
    );
    expect(
      peopleFromMessage({ type: "present", people: [{ username: "ada" }] }),
    ).toEqual([]);
    expect(
      peopleFromMessage({
        type: "present",
        people: [{ id: "c1", username: "ada" }],
      })?.[0].username,
    ).toBe("ada");
    expect(
      peopleFromMessage({
        type: "present",
        people: [
          {
            id: "c1",
            user_id: "u1",
            username: "ada",
            color: "#0f766e",
            x: 1,
            y: 2,
            width: 3,
            height: 4,
            zoom: 1,
          },
        ],
      })?.[0].username,
    ).toBe("ada");
  });
});
