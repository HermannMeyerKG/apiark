import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionHeader } from "@/components/collection/collection-tree";
import { useCollectionStore } from "@/stores/collection-store";
import { useTabStore } from "@/stores/tab-store";
import { exportCollectionToFile } from "@/lib/export-collection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/export-collection", () => ({
  exportCollectionToFile: vi.fn().mockResolvedValue(undefined),
}));

const collection = {
  type: "collection" as const,
  name: "Beispiel",
  path: "C:\\Collections\\Beispiel",
  children: [],
};

async function openMenu() {
  fireEvent.contextMenu(screen.getByText(collection.name), { clientX: 150, clientY: 100 });
  return within(await screen.findByRole("menu"));
}

describe("Collection context menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCollectionStore.setState({
      collections: [collection],
      expandedPaths: new Set(),
      createFolder: vi.fn().mockResolvedValue(`${collection.path}\\Unterordner`),
      createRequest: vi.fn().mockResolvedValue(`${collection.path}\\api-decision.yaml`),
      deleteCollection: vi.fn().mockResolvedValue(undefined),
    });
    useTabStore.setState({ openTab: vi.fn().mockResolvedValue(undefined) });
  });

  afterEach(cleanup);

  it("offers collection actions and preserves the defaults action", async () => {
    const onOpenDefaults = vi.fn();
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={onOpenDefaults} />);
    const menu = await openMenu();

    for (const label of [
      "sidebar.newRequest", "sidebar.newFolder", "common.rename", "sidebar.collectionDefaults",
      "sidebar.export",
      "sidebar.closeCollection", "sidebar.deleteCollection",
    ]) {
      expect(menu.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }

    for (const label of [
      "sidebar.exportPostman", "sidebar.exportOpenapi", "sidebar.exportApiark",
      "sidebar.startMockServer", "sidebar.generateDocs", "sidebar.cookieSettings", "cookies.title",
    ]) {
      expect(menu.queryByRole("menuitem", { name: label })).not.toBeInTheDocument();
    }

    fireEvent.click(menu.getByRole("menuitem", { name: "sidebar.collectionDefaults" }));
    expect(onOpenDefaults).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("creates a subfolder in the clicked collection and expands it", async () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    fireEvent.click(menu.getByRole("menuitem", { name: "sidebar.newFolder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unterordner" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(useCollectionStore.getState().createFolder).toHaveBeenCalledWith(collection.path, "Unterordner");
      expect(useCollectionStore.getState().expandedPaths.has(collection.path)).toBe(true);
    });
  });

  it("opens a newly created request from the clicked collection", async () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    fireEvent.click(menu.getByRole("menuitem", { name: "sidebar.newRequest" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/api/decision" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(useTabStore.getState().openTab).toHaveBeenCalledWith(
      `${collection.path}\\api-decision.yaml`, collection.path,
    ));
    expect(useCollectionStore.getState().createRequest).toHaveBeenCalledWith(
      collection.path, "/api/decision", "/api/decision", collection.path,
    );
  });

  it.each([
    ["sidebar.exportPostman", "postman"],
    ["sidebar.exportOpenapi", "openapi"],
    ["sidebar.exportApiark", "apiark"],
  ])("exports the clicked collection via %s", async (label, format) => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    const exportMenu = menu.getByRole("menuitem", { name: "sidebar.export" });
    fireEvent.click(exportMenu);
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));

    expect(exportCollectionToFile).toHaveBeenCalledWith(collection.path, collection.name, format);
  });

  it("returns from the export submenu with the left arrow key", async () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    const exportMenu = menu.getByRole("menuitem", { name: "sidebar.export" });
    act(() => exportMenu.focus());
    fireEvent.keyDown(exportMenu, { key: "ArrowRight" });
    const format = await screen.findByRole("menuitem", { name: "sidebar.exportPostman" });
    fireEvent.keyDown(format, { key: "ArrowLeft" });
    await waitFor(() => expect(exportMenu).toHaveFocus());
    expect(screen.queryByRole("menuitem", { name: "sidebar.exportPostman" })).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting the collection", async () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    fireEvent.click(menu.getByRole("menuitem", { name: "sidebar.deleteCollection" }));
    expect(useCollectionStore.getState().deleteCollection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(useCollectionStore.getState().deleteCollection).toHaveBeenCalledWith(collection.path, collection.name);
  });

  it("supports keyboard navigation and Escape", async () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    await waitFor(() => expect(menu.getByRole("menuitem", { name: "sidebar.newRequest" })).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    await waitFor(() => expect(menu.getByRole("menuitem", { name: "sidebar.newFolder" })).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clears the highlight in menu gaps without jumping back to the first item", async () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    const menu = await openMenu();
    const first = menu.getByRole("menuitem", { name: "sidebar.newRequest" });
    const rename = menu.getByRole("menuitem", { name: "common.rename" });
    const close = menu.getByRole("menuitem", { name: "sidebar.closeCollection" });
    await waitFor(() => expect(first).toHaveFocus());

    const move = createEvent.pointerMove(rename);
    Object.defineProperty(move, "pointerType", { value: "mouse" });
    fireEvent(rename, move);
    expect(rename).toHaveFocus();

    const leave = createEvent.pointerOut(rename, { relatedTarget: screen.getByRole("menu") });
    Object.defineProperty(leave, "pointerType", { value: "mouse" });
    fireEvent(rename, leave);
    expect(screen.getByRole("menu")).toHaveFocus();
    expect(first).not.toHaveAttribute("data-highlighted");
    expect(rename).not.toHaveAttribute("data-highlighted");

    const nextMove = createEvent.pointerMove(close);
    Object.defineProperty(nextMove, "pointerType", { value: "mouse" });
    fireEvent(close, nextMove);
    expect(close).toHaveFocus();
    expect(close).toHaveAttribute("data-highlighted");
    expect(first).not.toHaveAttribute("data-highlighted");
  });

  it("preserves the new-folder quick action without toggling the collection", () => {
    render(<CollectionHeader collection={collection} searchQuery="" onOpenDefaults={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "sidebar.newFolder" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(useCollectionStore.getState().expandedPaths.has(collection.path)).toBe(false);
  });
});
