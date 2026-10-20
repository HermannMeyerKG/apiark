import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionTree } from "@/components/collection/collection-tree";
import { useCollectionStore } from "@/stores/collection-store";
import { saveFolderOrder } from "@/lib/tauri-api";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, size: 28, start: index * 28 })),
  }),
}));
vi.mock("@/lib/tauri-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tauri-api")>(),
  saveFolderOrder: vi.fn().mockResolvedValue(undefined),
}));

const root = "C:\\Collections\\Test";
const nested = { type: "folder" as const, name: "Nested", path: `${root}\\A\\Nested`, children: [] };
const nodes = [
  { type: "folder" as const, name: "A", path: `${root}\\A`, children: [nested] },
  { type: "folder" as const, name: "B", path: `${root}\\B`, children: [] },
];

class TestPointerEvent extends MouseEvent {
  pointerId = 1;
  isPrimary = true;
  pointerType = "mouse";
}

function row(path: string): HTMLElement {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-tree-path]")).find((item) => item.dataset.treePath === path)!;
}

async function startDrag(path: string) {
  const source = row(path);
  const top = source.getBoundingClientRect().top;
  fireEvent.pointerDown(source.querySelector('[aria-label="sidebar.dragToMove"]')!, { clientX: 20, clientY: top + 14, button: 0 });
  fireEvent.pointerMove(document, { clientX: 30, clientY: top + 14 });
  await screen.findByText("sidebar.moveToRoot");
  // Allow DndContext to measure the newly mounted root target.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

async function dragTo(path: string, fraction = 0.5) {
  const rect = row(path).getBoundingClientRect();
  fireEvent.pointerMove(document, { clientX: 100, clientY: rect.top + rect.height * fraction });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  await act(async () => { fireEvent.pointerUp(document); });
}

describe("Collection tree pointer dragging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = nodes[0].path === this.dataset.treePath ? 0 : this.dataset.treePath === nested.path ? 1 : 2;
      const top = this.dataset.treePath === root ? 184 : 100 + index * 28;
      return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 28, width: 300, height: 28, toJSON: () => ({}) };
    });
    useCollectionStore.setState({
      collections: [{ type: "collection", path: root, name: "Test", children: nodes }],
      expandedPaths: new Set([root, nodes[0].path]),
      moveItem: vi.fn().mockResolvedValue(`${nodes[0].path}\\B`),
      refreshCollection: vi.fn().mockResolvedValue(undefined),
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("drops a folder into another folder", async () => {
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    await startDrag(nodes[1].path);
    await dragTo(nodes[0].path);
    await waitFor(() => expect(useCollectionStore.getState().moveItem).toHaveBeenCalledWith(nodes[1].path, nodes[0].path, root));
    expect(saveFolderOrder).toHaveBeenCalledWith(nodes[0].path, ["Nested", "B"]);
  });

  it("drops a nested folder onto the collection root", async () => {
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    await startDrag(nested.path);
    await dragTo(root);
    await waitFor(() => expect(useCollectionStore.getState().moveItem).toHaveBeenCalledWith(nested.path, root, root));
    expect(saveFolderOrder).toHaveBeenCalledWith(root, ["A", "B", "Nested"]);
  });

  it("sorts at the edge of a folder row", async () => {
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    await startDrag(nodes[1].path);
    await dragTo(nodes[0].path, 0.1);
    await waitFor(() => expect(saveFolderOrder).toHaveBeenCalledWith(root, ["B", "A"]));
    expect(useCollectionStore.getState().moveItem).toHaveBeenCalledWith(nodes[1].path, root, root);
  });

  it("offers the direct move-up action for a nested folder", async () => {
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    fireEvent.contextMenu(screen.getByText("Nested"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "sidebar.moveUp" }));
    await waitFor(() => expect(useCollectionStore.getState().moveItem).toHaveBeenCalledWith(nested.path, root, root));
  });

  it("does not move a folder onto its own descendant", async () => {
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    await startDrag(nodes[0].path);
    await dragTo(nested.path);
    expect(useCollectionStore.getState().moveItem).not.toHaveBeenCalled();
    expect(saveFolderOrder).not.toHaveBeenCalled();
  });

  it("opens the destination dialog from the keyboard", async () => {
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    fireEvent.keyDown(row(nested.path).querySelector('[aria-label="sidebar.dragToMove"]')!, { key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("expands a closed destination after hovering", async () => {
    useCollectionStore.setState({ expandedPaths: new Set([root]) });
    render(<CollectionTree nodes={nodes} collectionPath={root} collectionName="Test" />);
    await startDrag(nodes[1].path);
    const rect = row(nodes[0].path).getBoundingClientRect();
    fireEvent.pointerMove(document, { clientX: 100, clientY: rect.top + 14 });
    await screen.findByText("Nested");
    expect(useCollectionStore.getState().expandedPaths.has(nodes[0].path)).toBe(true);
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(useCollectionStore.getState().moveItem).not.toHaveBeenCalled();
  });
});
