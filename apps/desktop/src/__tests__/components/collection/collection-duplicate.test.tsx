import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionTree } from "@/components/collection/collection-tree";
import { useCollectionStore } from "@/stores/collection-store";
import { useTabStore } from "@/stores/tab-store";
import { useToastStore } from "@/stores/toast-store";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, size: 28, start: index * 28 })),
  }),
}));

const root = "C:\\Collections\\Test";
const request = { type: "request" as const, name: "Anfrage prüfen", method: "POST" as const, path: `${root}\\Unterordner\\request.yaml` };
const copy = `${root}\\Unterordner\\request-copy.yaml`;

function renderTree() {
  render(<CollectionTree nodes={[request]} collectionPath={root} collectionName="Test" />);
}

describe("Request duplication", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      readOnlyPaths: new Set(),
      duplicateRequest: vi.fn().mockResolvedValue(copy),
    });
    useTabStore.setState({ openTab: vi.fn().mockResolvedValue(undefined) });
    useToastStore.setState({ toasts: [] });
  });
  afterEach(cleanup);

  it("duplicates from the context menu and opens the saved copy", async () => {
    renderTree();
    fireEvent.contextMenu(screen.getByText(request.name));
    fireEvent.click(await screen.findByRole("menuitem", { name: "sidebar.duplicate" }));

    await waitFor(() => expect(useTabStore.getState().openTab).toHaveBeenCalledWith(copy, root));
    expect(useCollectionStore.getState().duplicateRequest).toHaveBeenCalledWith(request.path, root, "sidebar.copy");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers a quick action and disables it while a copy is being created", async () => {
    useCollectionStore.setState({ duplicateRequest: vi.fn(() => new Promise<string>(() => {})) });
    renderTree();
    const button = screen.getByRole("button", { name: "sidebar.duplicate" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(useCollectionStore.getState().duplicateRequest).toHaveBeenCalledOnce();
  });

  it("shows an error and allows retrying when duplication fails", async () => {
    useCollectionStore.setState({ duplicateRequest: vi.fn().mockRejectedValue(new Error("Cannot write copy")) });
    renderTree();
    fireEvent.click(screen.getByRole("button", { name: "sidebar.duplicate" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe("sidebar.duplicateFailed"));
    expect(useTabStore.getState().openTab).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "sidebar.duplicate" })).toBeEnabled();
  });

  it("disables duplication for read-only collections", async () => {
    useCollectionStore.setState({ readOnlyPaths: new Set([root]) });
    renderTree();
    expect(screen.getByRole("button", { name: "sidebar.duplicate" })).toBeDisabled();
    fireEvent.contextMenu(screen.getByText(request.name));
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "sidebar.duplicate" })).not.toBeInTheDocument();
  });
});
