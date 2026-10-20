import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoveItemDialog } from "@/components/collection/move-item-dialog";
import { useCollectionStore } from "@/stores/collection-store";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const root = "C:\\Collections\\Test";
const nested = { type: "folder" as const, name: "Nested", path: `${root}\\A\\Nested`, children: [] };
const source = { type: "folder" as const, name: "A", path: `${root}\\A`, children: [nested] };
const target = { type: "folder" as const, name: "B", path: `${root}\\B`, children: [] };

describe("Move destination selection", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: [{ type: "collection", name: "Test", path: root, children: [source, target] }],
      moveItem: vi.fn().mockResolvedValue(`${target.path}\\A`),
    });
  });
  afterEach(cleanup);

  it("excludes itself and descendants, and disables the current destination", () => {
    render(<MoveItemDialog node={source} collectionPath={root} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "A" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nested" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sidebar.move", exact: true })).toBeDisabled();
  });

  it("moves to a chosen subfolder", async () => {
    const onClose = vi.fn();
    render(<MoveItemDialog node={source} collectionPath={root} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "sidebar.move", exact: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(useCollectionStore.getState().moveItem).toHaveBeenCalledWith(source.path, target.path, root);
  });

  it("moves a nested folder back to the root", async () => {
    render(<MoveItemDialog node={nested} collectionPath={root} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    fireEvent.click(screen.getByRole("button", { name: "sidebar.move", exact: true }));
    await waitFor(() => expect(useCollectionStore.getState().moveItem).toHaveBeenCalledWith(nested.path, root, root));
  });

  it("keeps the dialog open and shows errors when a move fails", async () => {
    const onClose = vi.fn();
    useCollectionStore.setState({ moveItem: vi.fn().mockRejectedValue(new Error("Already exists")) });
    render(<MoveItemDialog node={source} collectionPath={root} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "sidebar.move", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("sidebar.moveFailed");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "sidebar.move", exact: true })).toBeEnabled();
  });
});
