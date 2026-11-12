import { render, screen, waitFor } from "@testing-library/react";
import { api } from "@/controllers/API/api";
import { adoptRemoteSave } from "../presence-sync";
import { useFlowPresence } from "../use-flow-presence";

const gate = {
  edited: false,
  saveLoading: false,
  conflictFlowId: null as string | null,
};

jest.mock("@/controllers/API/api", () => ({
  api: { get: jest.fn() },
}));

jest.mock("@/controllers/API/helpers/constants", () => ({
  getURL: () => "/api/v1/flows",
}));

jest.mock("../presence-sync", () => ({
  adoptRemoteSave: jest.fn(),
  applyRemoteGraph: jest.fn(),
  adoptGraphRevision: jest.fn(),
}));

jest.mock("@/stores/flowStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({ userEditedSinceLoad: gate.edited, nodes: [] }),
    subscribe: () => () => undefined,
  },
}));

jest.mock("@/stores/flowsManagerStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      saveLoading: gate.saveLoading,
      currentFlowId: "flow-1",
    }),
  },
}));

jest.mock("@/stores/flowConflictStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      conflict: gate.conflictFlowId ? { flowId: gate.conflictFlowId } : null,
    }),
  },
}));

class FakeSocket {
  static latest: FakeSocket | null = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.latest = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }
}

function Probe() {
  const { people } = useFlowPresence("flow-1", () => ({ x: 1, y: 2 }));
  return <div>{people.map((person) => person.username).join(",")}</div>;
}

describe("useFlowPresence", () => {
  beforeEach(() => {
    gate.edited = false;
    gate.saveLoading = false;
    gate.conflictFlowId = null;
    FakeSocket.latest = null;
    (api.get as jest.Mock).mockReset();
    (adoptRemoteSave as jest.Mock).mockReset();
    (globalThis as { WebSocket: typeof FakeSocket }).WebSocket =
      FakeSocket as never;
  });

  it("shows the other person and pulls a save only while this canvas is clean", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { id: "flow-1" } });
    render(<Probe />);
    await waitFor(() =>
      expect(FakeSocket.latest?.sent[0]).toBe('{"type":"view","x":1,"y":2}'),
    );
    expect(FakeSocket.latest?.url).toBe(
      "ws://localhost/api/v1/flows/flow-1/presence",
    );

    FakeSocket.latest?.onmessage?.({
      data: JSON.stringify({
        type: "present",
        people: [
          {
            id: "c1",
            user_id: "u1",
            username: "bea",
            color: "#1d4ed8",
            x: 1,
            y: 2,
            width: 3,
            height: 4,
            zoom: 1,
          },
        ],
      }),
    });
    expect(await screen.findByText("bea")).toBeInTheDocument();

    gate.edited = true;
    FakeSocket.latest?.onmessage?.({ data: JSON.stringify({ type: "saved" }) });
    await Promise.resolve();
    expect(api.get).not.toHaveBeenCalled();

    gate.edited = false;
    FakeSocket.latest?.onmessage?.({ data: JSON.stringify({ type: "saved" }) });
    await waitFor(() =>
      expect(adoptRemoteSave).toHaveBeenCalledWith({ id: "flow-1" }),
    );
  });
});
