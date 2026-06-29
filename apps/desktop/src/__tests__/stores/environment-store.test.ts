import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEnvironmentStore } from "@/stores/environment-store";
import { loadEnvironments, saveEnvironment } from "@/lib/tauri-api";

// Mock the Tauri API
vi.mock("@/lib/tauri-api", () => ({
  loadEnvironments: vi.fn().mockResolvedValue([
    { name: "development", variables: { baseUrl: "http://localhost:3000", apiKey: "dev-key" }, secrets: [] },
    { name: "production", variables: { baseUrl: "https://api.prod.com" }, secrets: ["apiKey"] },
  ]),
  getResolvedVariables: vi.fn().mockResolvedValue({
    baseUrl: "http://localhost:3000",
    apiKey: "dev-key",
  }),
  loadRootDotenv: vi.fn().mockResolvedValue({}),
  saveEnvironment: vi.fn().mockResolvedValue(undefined),
}));

describe("Environment Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnvironmentStore.setState({
      environments: [],
      activeEnvironmentName: null,
      activeCollectionPath: null,
      runtimeOverrides: {},
    });
  });

  it("loads environments from collection", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");
    const state = useEnvironmentStore.getState();
    expect(state.environments).toHaveLength(2);
    expect(state.environments[0].name).toBe("development");
    expect(state.environments[1].name).toBe("production");
    expect(state.activeCollectionPath).toBe("/test/collection");
  });

  it("auto-selects first environment", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");
    expect(useEnvironmentStore.getState().activeEnvironmentName).toBe("development");
  });

  it("keeps restored active environment when loading environments", async () => {
    useEnvironmentStore.getState().setActiveEnvironment("production");

    await useEnvironmentStore.getState().loadEnvironments("/test/collection");

    expect(useEnvironmentStore.getState().activeEnvironmentName).toBe("production");
  });

  it("sets active environment", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");
    useEnvironmentStore.getState().setActiveEnvironment("production");
    expect(useEnvironmentStore.getState().activeEnvironmentName).toBe("production");
  });

  it("applies mutations as runtime overrides only", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");

    useEnvironmentStore.getState().applyMutations({
      token: "abc",
    });

    expect(useEnvironmentStore.getState().runtimeOverrides.token).toBe("abc");
    expect(saveEnvironment).not.toHaveBeenCalled();
    expect(loadEnvironments).toHaveBeenCalledTimes(1);
  });

  it("persists mutations to the active environment when requested", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");

    await useEnvironmentStore.getState().persistMutations({
      token: "abc",
    });

    expect(saveEnvironment).toHaveBeenCalledWith(
      "/test/collection",
      expect.objectContaining({
        name: "development",
        variables: expect.objectContaining({
          baseUrl: "http://localhost:3000",
          apiKey: "dev-key",
          token: "abc",
        }),
      }),
    );
    expect(loadEnvironments).toHaveBeenCalledTimes(2);
  });

  it("persists environment variables sorted by key", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");

    await useEnvironmentStore.getState().persistMutations({
      zToken: "last",
      alpha: "first",
    });

    const savedEnv = vi.mocked(saveEnvironment).mock.calls[0][1];
    expect(Object.keys(savedEnv.variables)).toEqual(["alpha", "apiKey", "baseUrl", "zToken"]);
  });

  it("removes persisted environment variables for unset mutations", async () => {
    await useEnvironmentStore.getState().loadEnvironments("/test/collection");

    await useEnvironmentStore.getState().persistMutations({
      apiKey: null,
    });

    expect(saveEnvironment).toHaveBeenCalledWith(
      "/test/collection",
      expect.objectContaining({
        name: "development",
        variables: {
          baseUrl: "http://localhost:3000",
        },
      }),
    );
  });

  it("keeps persistent mutations runtime-free without an active environment", async () => {
    await useEnvironmentStore.getState().persistMutations({
      newVar: "newValue",
      deleteVar: null,
    });

    expect(useEnvironmentStore.getState().runtimeOverrides).toEqual({});
    expect(saveEnvironment).not.toHaveBeenCalled();
  });
});
