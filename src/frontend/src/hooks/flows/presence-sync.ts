import { cloneDeep } from "lodash";
import type { FlowType } from "@/types/flow";
import { processFlows } from "@/utils/reactflowUtils";
import useFlowStore from "../../stores/flowStore";
import useFlowsManagerStore from "../../stores/flowsManagerStore";
import { runAsRemote } from "./graph-channel";
import {
  applyGraphOps,
  type GraphEdge,
  type GraphNode,
  type GraphOp,
  protectDraggedNodes,
} from "./graph-ops";

function patchBaseline(ops: GraphOp[], versionToken?: string | null): void {
  const manager = useFlowsManagerStore.getState();
  const current = manager.currentFlow;
  if (!current?.data) return;
  const patched = applyGraphOps(
    (current.data.nodes ?? []) as GraphNode[],
    (current.data.edges ?? []) as GraphEdge[],
    ops,
  );
  const data = {
    ...current.data,
    nodes: patched.nodes,
    edges: patched.edges,
  };
  const token = versionToken
    ? { version_token: versionToken }
    : { version_token: current.version_token };
  useFlowsManagerStore.setState({
    currentFlow: { ...current, data, ...token },
    flows: manager.flows?.map((flow) =>
      flow.id === current.id ? { ...flow, data, ...token } : flow,
    ),
  });
}

/** Someone else's node edits, without taking over a node this person is holding. */
export function applyRemoteGraph(
  ops: GraphOp[],
  versionToken?: string | null,
): void {
  const visible = protectDraggedNodes(
    ops,
    useFlowStore.getState().nodes as GraphNode[],
  );
  runAsRemote(() => {
    if (visible.length > 0) {
      const state = useFlowStore.getState();
      const applied = applyGraphOps(
        state.nodes as GraphNode[],
        state.edges as GraphEdge[],
        visible,
      );
      useFlowStore.setState({
        nodes: applied.nodes,
        edges: applied.edges,
      });
      state.updateCurrentFlow({
        nodes: applied.nodes,
        edges: applied.edges,
      });
    }
    if (versionToken) patchBaseline(visible, versionToken);
  });
}

/** This client's own write landed. The canvas already shows it; the baseline follows. */
export function adoptGraphRevision(
  ops: GraphOp[],
  versionToken?: string | null,
): void {
  patchBaseline(ops, versionToken);
}

/** The graph someone else just saved, without moving this person's camera. */
export function adoptRemoteSave(serverFlow: FlowType): void {
  const adopted = cloneDeep(serverFlow);
  processFlows([adopted]);
  const manager = useFlowsManagerStore.getState();
  useFlowsManagerStore.setState({
    currentFlow:
      manager.currentFlow?.id === adopted.id ? adopted : manager.currentFlow,
    flows: manager.flows?.map((flow) =>
      flow.id === adopted.id ? adopted : flow,
    ),
  });
  if (useFlowStore.getState().currentFlow?.id === adopted.id) {
    runAsRemote(() => useFlowStore.getState().resetFlow(adopted));
  }
}

export function notifyFlowSaved(flowId: string): void {
  window.dispatchEvent(
    new CustomEvent("langflow-flow-saved", { detail: { flowId } }),
  );
}
