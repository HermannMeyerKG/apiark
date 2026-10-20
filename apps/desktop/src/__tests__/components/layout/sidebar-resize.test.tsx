import { useRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";
import { useSettingsStore } from "@/stores/settings-store";
import { getSettings, updateSettings } from "@/lib/tauri-api";

vi.mock("@/lib/tauri-api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Sidebar() {
  const panelRef = useRef<HTMLDivElement>(null);
  const width = useSettingsStore((s) => s.settings.sidebarWidth);
  return (
    <div ref={panelRef} data-testid="sidebar" style={{ width }}>
      <SidebarResizeHandle panelRef={panelRef} width={width} />
    </div>
  );
}

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

describe("sidebar resizing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, sidebarWidth: 400 },
    }));
    vi.mocked(updateSettings).mockImplementation(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
  });

  it("resizes within the limits and saves only when the drag ends", async () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator");
    fireEvent.pointerDown(handle, { clientX: 450, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 0 });
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "240px" });
    fireEvent.pointerMove(handle, { clientX: 1000 });
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "440px" });
    expect(handle).toHaveAttribute("aria-valuenow", "440");
    expect(updateSettings).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle);
    await waitFor(() => {
      expect(useSettingsStore.getState().settings.sidebarWidth).toBe(440);
    });
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ sidebarWidth: 440 });
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("cancels an interrupted drag and restores the previous width", () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator");
    fireEvent.pointerDown(handle, { clientX: 400, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 480 });
    fireEvent.pointerCancel(handle);
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "400px" });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("restores document styles when the sidebar closes during a drag", () => {
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "text";
    const { unmount } = render(<Sidebar />);
    fireEvent.pointerDown(screen.getByRole("separator"), { clientX: 400, button: 0 });
    unmount();
    expect(document.body.style.cursor).toBe("crosshair");
    expect(document.body.style.userSelect).toBe("text");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("supports keyboard resizing and resets to the default on double-click", async () => {
    render(<Sidebar />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "392"));
    fireEvent.keyDown(handle, { key: "End" });
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "440"));
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({ sidebarWidth: 440 }));
    fireEvent.keyDown(handle, { key: "Home" });
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "240"));
    fireEvent.doubleClick(handle);
    await waitFor(() => expect(handle).toHaveAttribute("aria-valuenow", "400"));
  });

  it("keeps previously saved widths within the supported range on startup", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...useSettingsStore.getState().settings,
      sidebarWidth: 180,
    });
    await useSettingsStore.getState().loadSettings();
    render(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "240px" });
  });
});
