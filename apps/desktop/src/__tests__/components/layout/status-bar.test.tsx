import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "@/components/layout/status-bar";
import { useEnvironmentStore } from "@/stores/environment-store";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.0.0-test"),
}), { virtual: true });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("StatusBar environment switcher", () => {
  beforeEach(() => {
    useEnvironmentStore.setState({
      globalEnvironment: { name: "Globals", variables: {}, secrets: [], scope: "personal" },
      collectionEnvironments: [],
      environments: [],
      activeCollectionEnvironmentName: null,
      activeEnvironmentName: null,
      activeCollectionPath: null,
      runtimeOverrides: {},
      globalRuntimeOverrides: {},
    });
  });

  it("shows active collection environments and switches the active environment", async () => {
    useEnvironmentStore.setState({
      collectionEnvironments: [
        { name: "development", variables: {}, secrets: [] },
        { name: "production", variables: {}, secrets: [] },
      ],
      environments: [
        { name: "development", variables: {}, secrets: [] },
        { name: "production", variables: {}, secrets: [] },
      ],
      activeCollectionEnvironmentName: "development",
      activeEnvironmentName: "development",
      activeCollectionPath: "/collections/apiark",
    });

    render(<StatusBar />);

    const switcher = screen.getByTitle("Switch collection environment") as HTMLSelectElement;
    expect(switcher).toHaveValue("development");
    expect(screen.getByRole("option", { name: "development" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "production" })).toBeInTheDocument();

    fireEvent.change(switcher, { target: { value: "production" } });

    await waitFor(() => {
      expect(useEnvironmentStore.getState().activeEnvironmentName).toBe("production");
    });
  });

  it("is disabled without an active request collection", () => {
    render(<StatusBar />);

    const switcher = screen.getByTitle("No request collection") as HTMLSelectElement;
    expect(switcher).toBeDisabled();
    expect(screen.getByRole("option", { name: "No request collection" })).toBeInTheDocument();
  });
});
