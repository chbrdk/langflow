import { ProjectShareMenuItem } from "@/customization/components/project-share-dialog";

export type CustomShareResourceType =
  | "deployment"
  | "project"
  | "knowledge_base"
  | "file";

export type CustomShareResourceSubtype = "knowledge_base" | "memory";

export interface CustomResourceShareActionProps {
  resourceId: string;
  resourceType: CustomShareResourceType;
  resourceSubtype?: CustomShareResourceSubtype;
  resourceName?: string;
  /** Compact actions use only an icon; headers may request a text label. */
  display?: "icon" | "label" | "menu";
}

export default function CustomResourceShareAction({
  resourceId,
  resourceType,
  resourceName,
}: CustomResourceShareActionProps) {
  if (resourceType !== "project") return null;
  return (
    <ProjectShareMenuItem projectId={resourceId} resourceName={resourceName} />
  );
}
