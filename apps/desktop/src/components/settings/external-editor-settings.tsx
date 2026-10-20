import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "@/stores/settings-store";
import { useToastStore } from "@/stores/toast-store";

export function ExternalEditorSettings() {
  const { t } = useTranslation();
  const editorPath = useSettingsStore((state) => state.settings.externalEditorPath);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [choosing, setChoosing] = useState(false);

  const chooseEditor = async () => {
    setChoosing(true);
    try {
      const path = await open({ title: t("settings.chooseEditor"), multiple: false, directory: false });
      if (typeof path === "string") {
        await updateSettings({ externalEditorPath: path });
      }
    } catch (error) {
      useToastStore.getState().showError(t("settings.chooseEditorFailed", { error: String(error) }));
    } finally {
      setChoosing(false);
    }
  };

  return (
    <section id="settings-editor" aria-labelledby="external-editor-label">
      <h3 id="external-editor-label" className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {t("settings.externalEditor")}
      </h3>
      <p id="external-editor-hint" className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        {t("settings.externalEditorHint")}
      </p>
      <div className="flex items-center gap-2">
        <input
          aria-label={t("settings.externalEditor")}
          aria-describedby="external-editor-hint"
          readOnly
          value={editorPath ?? ""}
          placeholder={t("settings.noEditorSelected")}
          title={editorPath ?? undefined}
          className="min-w-0 flex-1 rounded bg-[var(--color-elevated)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
        <button
          type="button"
          onClick={() => { void chooseEditor(); }}
          disabled={choosing}
          className="flex shrink-0 items-center gap-1.5 rounded bg-[var(--color-elevated)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t("settings.chooseEditor")}
        </button>
        {editorPath && (
          <button
            type="button"
            aria-label={t("settings.clearEditor")}
            title={t("settings.clearEditor")}
            disabled={choosing}
            onClick={() => { void updateSettings({ externalEditorPath: null }); }}
            className="rounded p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}
