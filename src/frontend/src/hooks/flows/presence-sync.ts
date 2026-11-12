import { cloneDeep } from "lodash";
import type { FlowType } from "@/types/flow";
import { processFlows } from "@/utils/reactflowUtils";
import useFlowStore from "../../stores/flowStore";
import useFlowsManagerStore from "../../stores/flowsManagerStore";

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
    useFlowStore.getState().resetFlow(adopted);
  }
}

export function notifyFlowSaved(flowId: string): void {
  window.dispatchEvent(
    new CustomEvent("langflow-flow-saved", { detail: { flowId } }),
  );
}
