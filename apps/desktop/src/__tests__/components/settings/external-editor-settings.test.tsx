import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { ExternalEditorSettings } from "@/components/settings/external-editor-settings";
import { useSettingsStore } from "@/stores/settings-store";
import { useToastStore } from "@/stores/toast-store";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue(null) }));

const originalState = useSettingsStore.getState();
const saveSettings = vi.fn().mockResolvedValue(undefined);

describe("External editor settings", () => {
  beforeEach(() => {
    saveSettings.mockClear();
    vi.mocked(open).mockReset().mockResolvedValue(null);
    useSettingsStore.setState({
      settings: { ...originalState.settings, externalEditorPath: null },
      updateSettings: saveSettings,
    });
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    cleanup();
    useSettingsStore.setState(originalState);
  });

  it("saves the installed executable selected in the file dialog", async () => {
    const path = "C:\\Program Files\\Visual Studio Code\\Code.exe";
    vi.mocked(open).mockResolvedValueOnce(path);
    render(<ExternalEditorSettings />);
    fireEvent.click(screen.getByRole("button", { name: "settings.chooseEditor" }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledExactlyOnceWith({ externalEditorPath: path }));
  });

  it("preserves the current editor when the dialog is canceled", async () => {
    const path = "C:\\Editor\\Code.exe";
    useSettingsStore.setState({ settings: { ...originalState.settings, externalEditorPath: path } });
    render(<ExternalEditorSettings />);
    fireEvent.click(screen.getByRole("button", { name: "settings.chooseEditor" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "settings.chooseEditor" })).toBeEnabled());
    expect(screen.getByRole("textbox")).toHaveValue(path);
    expect(saveSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "settings.clearEditor" }));
    expect(saveSettings).toHaveBeenCalledExactlyOnceWith({ externalEditorPath: null });
  });

  it("reports dialog errors and allows retrying", async () => {
    vi.mocked(open).mockRejectedValueOnce("Dialog unavailable");
    render(<ExternalEditorSettings />);
    fireEvent.click(screen.getByRole("button", { name: "settings.chooseEditor" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe("settings.chooseEditorFailed"));
    expect(screen.getByRole("button", { name: "settings.chooseEditor" })).toBeEnabled();
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
