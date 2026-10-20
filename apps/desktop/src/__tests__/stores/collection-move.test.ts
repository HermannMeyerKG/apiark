import { beforeEach, describe, expect, it, vi } from "vitest";
import { moveItem, openCollection } from "@/lib/tauri-api";
import { useCollectionStore } from "@/stores/collection-store";
import { useTabStore } from "@/stores/tab-store";
import { useUndoStore } from "@/stores/undo-store";

vi.mock("@/lib/tauri-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tauri-api")>(),
  moveItem: vi.fn(),
  openCollection: vi.fn(),
}));

const root = "C:\\Collections\\Test";
const oldPath = `${root}\\A`;
const destination = `${root}\\B`;
const newPath = `${destination}\\A`;

describe("Collection moves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const collection = { type: "collection" as const, name: "Test", path: root, children: [] };
    useCollectionStore.setState({ collections: [collection], expandedPaths: new Set([root, oldPath, `${oldPath}\\Nested`, `${root}\\AB`]) });
    useUndoStore.getState().clearUndo();
    useTabStore.setState({ tabs: [], persistTabs: vi.fn() });
    useTabStore.getState().newTab();
    const tab = useTabStore.getState().tabs[0];
    useTabStore.setState({ tabs: [
      { ...tab, id: "nested", filePath: `${oldPath}\\Nested\\test.yaml`, collectionPath: root, isDirty: true },
      { ...tab, id: "sibling", filePath: `${root}\\AB\\test.yaml`, collectionPath: root },
    ] });
    vi.mocked(openCollection).mockResolvedValue(collection);
    vi.mocked(moveItem).mockResolvedValue(newPath);
  });

  it("moves open descendant tabs and expansion paths while retaining unsaved changes", async () => {
    await useCollectionStore.getState().moveItem(oldPath, destination, root);
    expect(moveItem).toHaveBeenCalledWith(oldPath, destination, root);
    const tabs = useTabStore.getState().tabs;
    expect(tabs[0].filePath).toBe(`${newPath}\\Nested\\test.yaml`);
    expect(tabs[0].isDirty).toBe(true);
    expect(tabs[1].filePath).toBe(`${root}\\AB\\test.yaml`);
    expect(useTabStore.getState().persistTabs).toHaveBeenCalled();
    expect(useCollectionStore.getState().expandedPaths).toEqual(new Set([root, newPath, `${newPath}\\Nested`, `${root}\\AB`, destination]));
    expect(useUndoStore.getState().undoStack).toEqual([{ type: "move", oldPath, newPath, collectionPath: root }]);
  });

  it("restores the item, tab paths and expansion state on undo", async () => {
    await useCollectionStore.getState().moveItem(oldPath, destination, root);
    vi.mocked(moveItem).mockResolvedValue(oldPath);
    await useCollectionStore.getState().undoLastAction();
    expect(moveItem).toHaveBeenLastCalledWith(newPath, root, root);
    expect(useTabStore.getState().tabs[0].filePath).toBe(`${oldPath}\\Nested\\test.yaml`);
    expect(useCollectionStore.getState().expandedPaths.has(`${oldPath}\\Nested`)).toBe(true);
    expect(useUndoStore.getState().undoStack).toEqual([]);
  });

  it("preserves state and undo history if the filesystem refuses a move", async () => {
    vi.mocked(moveItem).mockRejectedValue(new Error("Already exists"));
    await expect(useCollectionStore.getState().moveItem(oldPath, destination, root)).rejects.toThrow("Already exists");
    expect(useTabStore.getState().tabs[0].filePath).toBe(`${oldPath}\\Nested\\test.yaml`);
    expect(useUndoStore.getState().undoStack).toEqual([]);
  });

  it("keeps a failed undo available for retry", async () => {
    await useCollectionStore.getState().moveItem(oldPath, destination, root);
    vi.mocked(moveItem).mockRejectedValue(new Error("Already exists"));
    await expect(useCollectionStore.getState().undoLastAction()).rejects.toThrow("Already exists");
    expect(useUndoStore.getState().undoStack).toHaveLength(1);
    expect(useTabStore.getState().tabs[0].filePath).toBe(`${newPath}\\Nested\\test.yaml`);
  });

  it("skips moves within the same parent and rejects descendant targets", async () => {
    expect(await useCollectionStore.getState().moveItem(oldPath, root, root)).toBe(oldPath);
    await expect(useCollectionStore.getState().moveItem(oldPath, `${oldPath}\\Nested`, root)).rejects.toThrow();
    expect(moveItem).not.toHaveBeenCalled();
  });
});
