import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedState, RequestFile } from "@apiark/types";

vi.mock("@/lib/tauri-api", () => ({
  readRequestFile: vi.fn(),
  loadPersistedState: vi.fn(),
  savePersistedState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/stores/environment-store", () => ({
  useEnvironmentStore: { getState: () => ({
    setActiveEnvironment: vi.fn(),
    activeEnvironmentName: null,
  }) },
}));

vi.mock("@/stores/collection-store", () => {
  const state = { collections: [], openCollection: vi.fn().mockResolvedValue(undefined) };
  return { useCollectionStore: { getState: () => state } };
});

vi.mock("@/stores/toast-store", () => ({
  useToastStore: { getState: () => ({ showWarning: vi.fn(), showError: vi.fn() }) },
}));

import { useTabStore } from "@/stores/tab-store";
import { loadPersistedState, readRequestFile, savePersistedState } from "@/lib/tauri-api";
import { useCollectionStore } from "@/stores/collection-store";

const first = { filePath: "/collection/first.yaml", collectionPath: "/collection" };
const second = { filePath: "/collection/second.yaml", collectionPath: "/collection" };
const request: RequestFile = { name: "Request", method: "GET", url: "https://example.com" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("Tab persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabStore.setState({ tabs: [], activeTabId: null });
    vi.mocked(readRequestFile).mockReset().mockResolvedValue(request);
    vi.mocked(loadPersistedState).mockReset().mockResolvedValue({
      tabs: [first, second], activeTabIndex: 1,
    });
  });

  it("restores a session only once when startup runs concurrently", async () => {
    await Promise.all([
      useTabStore.getState().restoreTabs(),
      useTabStore.getState().restoreTabs(),
    ]);

    const { tabs, activeTabId } = useTabStore.getState();
    expect(tabs.map((tab) => tab.filePath)).toEqual([first.filePath, second.filePath]);
    expect(activeTabId).toBe(tabs[1].id);
    expect(loadPersistedState).toHaveBeenCalledTimes(1);
    expect(useCollectionStore.getState().openCollection).toHaveBeenCalledTimes(1);
  });

  it("keeps existing tabs and their edits when restoring again", async () => {
    await useTabStore.getState().restoreTabs();
    useTabStore.getState().setUrl("https://edited.example.com");
    const originalTabs = useTabStore.getState().tabs;

    await useTabStore.getState().restoreTabs();

    expect(useTabStore.getState().tabs).toEqual(originalTabs);
    expect(readRequestFile).toHaveBeenCalledTimes(2);
  });

  it("deduplicates old session entries and restores the active file after missing entries", async () => {
    const missing = { ...first, filePath: "/collection/missing.yaml" };
    vi.mocked(loadPersistedState).mockResolvedValueOnce({
      tabs: [missing, first, first, second], activeTabIndex: 3,
    });
    vi.mocked(readRequestFile).mockRejectedValueOnce(new Error("Missing file"));

    await useTabStore.getState().restoreTabs();

    const { tabs, activeTabId } = useTabStore.getState();
    expect(tabs.map((tab) => tab.filePath)).toEqual([first.filePath, second.filePath]);
    expect(activeTabId).toBe(tabs[1].id);
  });

  it("does not duplicate a file opened while restoration is reading it", async () => {
    const pending = deferred<RequestFile>();
    vi.mocked(readRequestFile).mockReturnValueOnce(pending.promise);
    const restoration = useTabStore.getState().restoreTabs();
    await vi.waitFor(() => expect(readRequestFile).toHaveBeenCalledWith(first.filePath));

    await useTabStore.getState().openTab(first.filePath, first.collectionPath);
    useTabStore.getState().setUrl("https://edited.example.com");
    const existing = useTabStore.getState().tabs[0];
    pending.resolve(request);
    await restoration;

    expect(useTabStore.getState().tabs).toHaveLength(2);
    expect(useTabStore.getState().tabs[0]).toEqual(existing);
  });

  it.each([false, true])("does not duplicate concurrent opens (merge conflict: %s)", async (conflict) => {
    const pending = deferred<RequestFile>();
    vi.mocked(readRequestFile).mockReturnValueOnce(pending.promise);
    const opening = useTabStore.getState().openTab(first.filePath, first.collectionPath);
    await useTabStore.getState().openTab(first.filePath, first.collectionPath);
    const existing = useTabStore.getState().tabs[0];

    if (conflict) pending.reject(new Error("MERGE_CONFLICT: unresolved"));
    else pending.resolve(request);
    await opening;

    expect(useTabStore.getState().tabs).toEqual([existing]);
    expect(useTabStore.getState().activeTabId).toBe(existing.id);
  });

  it("does not overwrite the saved session while startup is still loading", async () => {
    const pending = deferred<PersistedState>();
    vi.mocked(loadPersistedState).mockReturnValueOnce(pending.promise);
    const restoration = useTabStore.getState().restoreTabs();
    useTabStore.getState().persistTabs();
    // Let asynchronous persistence callbacks finish before completing startup.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const savesDuringStartup = vi.mocked(savePersistedState).mock.calls.length;
    pending.resolve({ tabs: [first], activeTabIndex: 0 });
    await restoration;

    expect(savesDuringStartup).toBe(0);
    useTabStore.getState().persistTabs();
    await vi.waitFor(() => expect(savePersistedState).toHaveBeenCalledWith(
      expect.objectContaining({ tabs: [first], activeTabIndex: 0 }),
    ));
  });

  it("persists the active index within the filtered list of saved tabs", async () => {
    useTabStore.getState().newTab();
    await useTabStore.getState().openTab(first.filePath, first.collectionPath);
    await useTabStore.getState().openTab(second.filePath, second.collectionPath);

    useTabStore.getState().persistTabs();

    await vi.waitFor(() => expect(savePersistedState).toHaveBeenCalledWith(
      expect.objectContaining({ tabs: [first, second], activeTabIndex: 1 }),
    ));
  });

  it("allows a retry after loading the saved session fails", async () => {
    vi.mocked(loadPersistedState).mockRejectedValueOnce(new Error("Read failed"));
    await useTabStore.getState().restoreTabs();
    await useTabStore.getState().restoreTabs();

    expect(useTabStore.getState().tabs.map((tab) => tab.filePath)).toEqual([
      first.filePath, second.filePath,
    ]);
  });

  it("reopens collections even when no tabs were saved", async () => {
    vi.mocked(loadPersistedState).mockResolvedValueOnce({
      tabs: [], activeTabIndex: null, collections: [first.collectionPath],
    });

    await useTabStore.getState().restoreTabs();

    await vi.waitFor(() => expect(useCollectionStore.getState().openCollection)
      .toHaveBeenCalledWith(first.collectionPath));
    expect(useTabStore.getState().tabs).toEqual([]);
  });
});
