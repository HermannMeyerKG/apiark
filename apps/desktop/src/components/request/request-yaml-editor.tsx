import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "@apiark/types";
import { CodeEditor } from "@/components/ui/code-editor";
import { readRequestYaml, serializeRequestYaml } from "@/lib/tauri-api";
import { tabToRequestFile, useTabStore } from "@/stores/tab-store";

export function RequestYamlEditor({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const setYamlDraft = useTabStore((s) => s.setYamlDraft);
  const applyYamlDraft = useTabStore((s) => s.applyYamlDraft);
  const request = JSON.stringify(tabToRequestFile(tab));

  useEffect(() => {
    let cancelled = false;
    setSource(undefined);
    setError(null);
    const load = tab.requestYaml !== undefined
      ? Promise.resolve(tab.requestYaml)
      : tab.filePath && !tab.isDirty
        ? readRequestYaml(tab.filePath)
        : serializeRequestYaml(JSON.parse(request), tab.assertions);
    load.then((content) => {
      if (!cancelled) setSource(content);
    }).catch((err: unknown) => {
      if (!cancelled) setError(String(err));
    });
    return () => { cancelled = true; };
  }, [tab.id, tab.filePath, tab.isDirty, tab.requestYaml, tab.assertions, request]);

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await applyYamlDraft(tab.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-[var(--color-text-muted)]" title={tab.filePath ?? undefined}>
          {tab.filePath?.split(/[\\/]/).pop() ?? t("request.yamlNewFile")}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setYamlDraft(tab.id, undefined); setError(null); }}
            disabled={tab.yamlDraft === undefined || applying}
            className="rounded px-2 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] disabled:opacity-40"
          >
            {t("request.yamlDiscard")}
          </button>
          <button
            onClick={apply}
            disabled={tab.yamlDraft === undefined || applying}
            className="rounded bg-[var(--color-accent)] px-2.5 py-1 text-white hover:opacity-90 disabled:opacity-40"
          >
            {t(applying ? "request.yamlApplying" : "request.yamlApply")}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="shrink-0 whitespace-pre-wrap rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      <div className="min-h-0 flex-1">
        {tab.yamlDraft !== undefined || source !== undefined ? (
          <CodeEditor
            value={tab.yamlDraft ?? source ?? ""}
            onChange={(value) => { setYamlDraft(tab.id, value, source); setError(null); }}
            language="yaml"
            height="100%"
            readOnly={applying}
          />
        ) : !error ? <p role="status" className="text-xs text-[var(--color-text-muted)]">{t("request.yamlLoading")}</p> : null}
      </div>
    </div>
  );
}
