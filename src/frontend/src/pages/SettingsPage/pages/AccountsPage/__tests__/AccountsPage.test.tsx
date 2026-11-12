import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/controllers/API/api";
import AccountsPage from "../index";

let mockSuperuser = true;

jest.mock("@/controllers/API/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/stores/authStore", () => ({
  __esModule: true,
  default: (
    selector: (state: {
      userData: { id: string; is_superuser: boolean };
    }) => unknown,
  ) => selector({ userData: { id: "me", is_superuser: mockSuperuser } }),
}));

const mockedApi = api as unknown as {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

const accounts = {
  users: [
    {
      id: "me",
      username: "admin",
      is_active: true,
      is_superuser: true,
      last_login_at: null,
      store_api_key: "sk-live-secret",
    },
    {
      id: "user-2",
      username: "maria",
      is_active: true,
      is_superuser: false,
      last_login_at: null,
    },
  ],
};

describe("AccountsPage", () => {
  beforeEach(() => {
    mockSuperuser = true;
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.patch.mockReset();
    mockedApi.delete.mockReset();
    mockedApi.get.mockResolvedValue({ data: accounts });
  });

  it("hides the page from an account that is not a superuser", () => {
    mockSuperuser = false;
    render(<AccountsPage />);
    expect(
      screen.getByText("Only a superuser can manage accounts."),
    ).toBeInTheDocument();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("lists accounts without showing a stored key", async () => {
    render(<AccountsPage />);
    expect(
      await screen.findByRole("button", { name: "admin (You)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "maria" })).toBeInTheDocument();
    expect(screen.queryByText("sk-live-secret")).not.toBeInTheDocument();
  });

  it("creates an account and then sets its role", async () => {
    const user = userEvent.setup();
    mockedApi.post.mockResolvedValue({
      data: {
        id: "user-3",
        username: "noah",
        is_active: false,
        is_superuser: false,
      },
    });
    mockedApi.patch.mockResolvedValue({ data: {} });

    render(<AccountsPage />);
    await screen.findByRole("button", { name: "maria" });
    await user.type(screen.getByLabelText("Username"), "noah");
    await user.type(screen.getByLabelText("Password"), "a-long-password");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith("/api/v1/users/", {
        username: "noah",
        password: "a-long-password",
      }),
    );
    expect(mockedApi.patch).toHaveBeenCalledWith("/api/v1/users/user-3", {
      is_active: true,
      is_superuser: false,
    });
  });

  it("does not offer to delete the signed-in account", async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click(
      await screen.findByRole("button", { name: "admin (You)" }),
    );
    expect(
      screen.queryByRole("button", { name: "Delete Account" }),
    ).not.toBeInTheDocument();
  });

  it("changes another account to superuser", async () => {
    const user = userEvent.setup();
    mockedApi.patch.mockResolvedValue({ data: {} });
    render(<AccountsPage />);
    await user.click(await screen.findByRole("button", { name: "maria" }));
    const role = screen.getAllByRole("checkbox", { name: "Superuser" }).at(-1);
    await user.click(role!);
    await waitFor(() =>
      expect(mockedApi.patch).toHaveBeenCalledWith("/api/v1/users/user-2", {
        is_superuser: true,
      }),
    );
  });

  it("deletes another account after a second confirmation", async () => {
    const user = userEvent.setup();
    mockedApi.delete.mockResolvedValue({ data: {} });
    render(<AccountsPage />);
    await user.click(await screen.findByRole("button", { name: "maria" }));
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.click(screen.getByRole("button", { name: /delete maria/i }));
    await waitFor(() =>
      expect(mockedApi.delete).toHaveBeenCalledWith("/api/v1/users/user-2"),
    );
  });
});
