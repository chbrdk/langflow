import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/controllers/API/api";
import CustomModelProviderShare from "../custom-model-provider-share";

jest.mock("@/controllers/API/api", () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const mockedApi = api as unknown as {
  get: jest.Mock;
  put: jest.Mock;
};

describe("CustomModelProviderShare", () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.put.mockReset();
  });

  it("stays hidden when this account cannot share the keys", async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 403 } });

    const { container } = render(<CustomModelProviderShare />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when the share API is not installed", async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 404 } });

    const { container } = render(<CustomModelProviderShare />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows saved field names and never a secret value", async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        owner: "admin",
        share_with_everyone: false,
        credentials: [
          {
            provider: "OpenAI",
            variables: [
              {
                label: "API Key",
                configured: true,
                value: "sk-live-secret",
              },
            ],
          },
          {
            provider: "Amazon Bedrock",
            variables: [{ label: "Access Key", configured: false }],
          },
        ],
      },
    });

    render(<CustomModelProviderShare />);

    expect(await screen.findByText("OpenAI: API Key")).toBeInTheDocument();
    expect(
      screen.getByText("Amazon Bedrock: Nothing saved yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("These credentials stay on admin."),
    ).toBeInTheDocument();
    expect(screen.queryByText("sk-live-secret")).not.toBeInTheDocument();
  });

  it("turns sharing on through the existing API", async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        owner: "admin",
        share_with_everyone: false,
        credentials: [],
      },
    });
    mockedApi.put.mockResolvedValue({
      data: {
        owner: "admin",
        share_with_everyone: true,
        credentials: [],
      },
    });

    render(<CustomModelProviderShare />);
    await screen.findByRole("switch", { name: "Share with every user" });
    await userEvent.click(
      screen.getByRole("switch", { name: "Share with every user" }),
    );

    await waitFor(() =>
      expect(mockedApi.put).toHaveBeenCalledWith(
        "/api/v1/shared-provider-credentials",
        { share_with_everyone: true },
      ),
    );
    expect(
      await screen.findByText("Every user can use these credentials."),
    ).toBeInTheDocument();
  });
});
