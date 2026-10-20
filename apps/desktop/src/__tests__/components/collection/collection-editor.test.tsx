import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRequestInEditor } from "@/lib/tauri-api";
import { CollectionTree } from "@/components/collection/collection-tree";
import { useCollectionStore } from "@/stores/collection-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useToastStore } from "@/stores/toast-store";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/tauri-api", () => ({ openRequestInEditor: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, size: 28, start: index * 28 })),
  }),
}));

const root = "C:\\Collections\\Test";
const request = { type: "request" as const, name: "Anfrage prüfen", method: "GET" as const, path: `${root}\\Unterordner\\Anfrage prüfen.yaml` };
const originalSettings = useSettingsStore.getState().settings;

async function openFromMenu() {
  render(<CollectionTree nodes={[request]} collectionPath={root} collectionName="Test" />);
  fireEvent.contextMenu(screen.getByText(request.name));
  fireEvent.click(await screen.findByRole("menuitem", { name: "sidebar.openInEditor" }));
}

describe("Open request in external editor", () => {
  beforeEach(() => {
    vi.mocked(openRequestInEditor).mockReset().mockResolvedValue(undefined);
    useCollectionStore.setState({ readOnlyPaths: new Set() });
    useSettingsStore.setState({ settings: { ...originalSettings, externalEditorPath: "C:\\Code Editor\\Code.exe" } });
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ settings: originalSettings });
  });

  it("opens the existing file and closes the context menu", async () => {
    await openFromMenu();
    await waitFor(() => expect(openRequestInEditor).toHaveBeenCalledExactlyOnceWith(request.path));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens editor settings when no editor has been selected", async () => {
    useSettingsStore.setState({ settings: { ...originalSettings, externalEditorPath: null } });
    const listener = vi.fn();
    window.addEventListener("apiark:open-settings", listener);
    try {
      await openFromMenu();
      expect(listener).toHaveBeenCalledOnce();
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ section: "editor" });
      expect(openRequestInEditor).not.toHaveBeenCalled();
      expect(useToastStore.getState().toasts[0]?.message).toBe("settings.chooseEditorFirst");
    } finally {
      window.removeEventListener("apiark:open-settings", listener);
    }
  });

  it("reports launch failures", async () => {
    vi.mocked(openRequestInEditor).mockRejectedValueOnce("Editor was removed");
    await openFromMenu();
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe("sidebar.openInEditorFailed"));
  });

  it("also offers opening files from read-only collections", async () => {
    useCollectionStore.setState({ readOnlyPaths: new Set([root]) });
    await openFromMenu();
    expect(openRequestInEditor).toHaveBeenCalledExactlyOnceWith(request.path);
  });
});
