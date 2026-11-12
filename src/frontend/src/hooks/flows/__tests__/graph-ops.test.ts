import { applyGraphOps, diffGraph, protectDraggedNodes } from "../graph-ops";

const node = (id: string, x: number, y: number, dragging = false) => ({
  id,
  position: { x, y },
  dragging,
  data: { kind: id },
});

describe("graph ops", () => {
  it("keeps both nodes when two people move different ones", () => {
    const merged = applyGraphOps(
      [node("a", 0, 0), node("b", 5, 5)],
      [],
      [
        { op: "move", id: "a", x: 10, y: 20 },
        { op: "move", id: "b", x: 30, y: 40 },
      ],
    );
    expect(merged.nodes.map((item) => item.position)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(merged.nodes[0].data).toEqual({ kind: "a" });
  });

  it("sends a live move while a node is held and a saved move when it is released", () => {
    const start = [node("a", 0, 0)];
    const held = diffGraph(start, [], [node("a", 4, 5, true)], []);
    expect(held.ephemeral).toEqual([{ op: "move", id: "a", x: 4, y: 5 }]);
    expect(held.persisted).toEqual([]);
    const released = diffGraph(start, [], [node("a", 4, 5, false)], []);
    expect(released.persisted).toEqual([{ op: "move", id: "a", x: 4, y: 5 }]);
  });

  it("does not pull a held node out of this person's hand", () => {
    const ops = protectDraggedNodes(
      [
        { op: "move", id: "a", x: 9, y: 9 },
        { op: "move", id: "b", x: 1, y: 1 },
      ],
      [node("a", 0, 0, true), node("b", 0, 0)],
    );
    expect(ops).toEqual([{ op: "move", id: "b", x: 1, y: 1 }]);
  });
});
