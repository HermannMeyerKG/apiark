import type { TFunction } from "i18next";
import { openRequestInEditor } from "@/lib/tauri-api";
import { useSettingsStore } from "@/stores/settings-store";
import { useToastStore } from "@/stores/toast-store";

export async function openInEditor(path: string, t: TFunction): Promise<void> {
  if (!useSettingsStore.getState().settings.externalEditorPath) {
    window.dispatchEvent(new CustomEvent("apiark:open-settings", { detail: { section: "editor" } }));
    useToastStore.getState().showInfo(t("settings.chooseEditorFirst"));
    return;
  }

  try {
    await openRequestInEditor(path);
  } catch (error) {
    useToastStore.getState().showError(t("sidebar.openInEditorFailed", { error: String(error) }));
  }
}
