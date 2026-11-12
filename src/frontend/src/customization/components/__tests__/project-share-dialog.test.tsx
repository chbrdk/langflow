import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { api } from "@/controllers/API/api";
import CustomFlowShareAction from "../custom-flow-share-action";
import CustomResourceShareAction from "../custom-resource-share-action";

jest.mock("@/controllers/API/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApi = api as unknown as {
  get: jest.Mock;
  post: jest.Mock;
  delete: jest.Mock;
};

function renderInMenu(node: ReactNode) {
  return render(
    <DropdownMenu open>
      <DropdownMenuContent>{node}</DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("project sharing in the menus", () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.delete.mockReset();
    mockedApi.get.mockResolvedValue({ data: [] });
  });

  it("leaves files, deployments, and knowledge bases without a share action", () => {
    const { container } = render(
      <CustomResourceShareAction
        resourceId="file-1"
        resourceType="file"
        resourceName="notes.txt"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("adds a project share action that invites a person onto the project", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/authz/shares/"))
        return Promise.resolve({ data: [] });
      if (url === "/api/v1/project-shares/lookup") {
        return Promise.resolve({ data: { id: "user-2", username: "maria" } });
      }
      return Promise.reject(new Error(url));
    });
    mockedApi.post.mockResolvedValue({ data: { id: "share-1" } });

    renderInMenu(
      <CustomResourceShareAction
        resourceId="project-1"
        resourceType="project"
        resourceName="Campaign"
        display="menu"
      />,
    );

    await userEvent.click(screen.getByTestId("btn-share-project"));
    expect(await screen.findByText("Share project")).toBeInTheDocument();
    expect(screen.getByText(/Campaign/)).toBeInTheDocument();
    expect(screen.queryByText("sk-live-secret")).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox"), "maria");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith("/api/v1/authz/shares/", {
        resource_type: "project",
        resource_id: "project-1",
        scope: "user",
        target_id: "user-2",
        permission_level: "write",
      }),
    );
  });

  it("shares the flow's project instead of the flow alone", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/api/v1/flows/flow-1") {
        return Promise.resolve({ data: { folder_id: "project-9" } });
      }
      if (url.startsWith("/api/v1/authz/shares/"))
        return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { id: "user-2" } });
    });
    mockedApi.post.mockResolvedValue({ data: {} });

    renderInMenu(
      <CustomFlowShareAction
        resourceId="flow-1"
        resourceType="flow"
        resourceName="Welcome"
      />,
    );
    await userEvent.click(screen.getByTestId("btn-share-project"));
    expect(
      await screen.findByText("Share this flow's project"),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "maria");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/v1/authz/shares/",
        expect.objectContaining({
          resource_type: "project",
          resource_id: "project-9",
        }),
      ),
    );
  });
});
