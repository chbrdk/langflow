import { ProjectShareMenuItem } from "@/customization/components/project-share-dialog";

interface CustomFlowShareActionProps {
  resourceId: string;
  resourceType: string;
  resourceName?: string;
  menuContext?: "card" | "editor";
}

export default function CustomFlowShareAction({
  resourceId,
  resourceType,
  resourceName,
}: CustomFlowShareActionProps) {
  if (resourceType !== "flow") return null;
  return (
    <ProjectShareMenuItem flowId={resourceId} resourceName={resourceName} />
  );
}
