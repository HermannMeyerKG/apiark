import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { useEnvironmentStore } from "@/stores/environment-store";
import { useCollectionStore } from "@/stores/collection-store";
import { useMockStore } from "@/stores/mock-store";
import { useMonitorStore } from "@/stores/monitor-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useConsoleStore } from "@/stores/console-store";
import { Globe, FolderOpen, Server, Activity, Columns2, Rows2, LayoutList, Terminal, ScrollText } from "lucide-react";
import type { AppSettings } from "@apiark/types";

interface StatusBarProps {
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
}

export function StatusBar({ onToggleTerminal, terminalOpen }: StatusBarProps) {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => { getVersion().then(setAppVersion); }, []);
  const activeEnv = useEnvironmentStore((s) => s.activeEnvironmentName);
  const activeCollectionPath = useEnvironmentStore((s) => s.activeCollectionPath);
  const collectionEnvironments = useEnvironmentStore((s) => s.collectionEnvironments);
  const setActiveEnvironment = useEnvironmentStore((s) => s.setActiveEnvironment);
  const collections = useCollectionStore((s) => s.collections);
  const mockServers = useMockStore((s) => s.servers);
  const monitors = useMonitorStore((s) => s.monitors);
  const layout = useSettingsStore((s) => s.settings.layout);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const consoleEntries = useConsoleStore((s) => s.entries);
  const consoleOpen = useConsoleStore((s) => s.open);
  const toggleConsole = useConsoleStore((s) => s.toggle);
  const hasErrors = consoleEntries.some((e) => e.level === "error");

  const runningMocks = mockServers.filter((s) => s.running).length;
  const activeMonitors = monitors.filter((m) => m.enabled).length;

  const toggleLayout = () => {
    const order: AppSettings["layout"][] = ["horizontal", "vertical", "tabbed"];
    const next = order[(order.indexOf(layout) + 1) % order.length];
    updateSettings({ layout: next });
  };

  return (
    <div className="flex h-9 shrink-0 items-center border-t border-[var(--color-border)] bg-[var(--color-activity-bar)] px-3 text-[13px]">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-[var(--color-text-muted)]">
            <Globe className="h-4 w-4" />
            <select
              value={activeEnv ?? ""}
              onChange={(e) => setActiveEnvironment(e.target.value || null)}
              disabled={!activeCollectionPath}
              className="max-w-48 cursor-pointer rounded border border-transparent bg-transparent py-0.5 pr-6 text-[13px] text-[var(--color-text-muted)] outline-none transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-elevated)] focus:border-[var(--color-accent)]/60 disabled:cursor-not-allowed disabled:opacity-60"
              title={activeCollectionPath ? "Switch collection environment" : "No request collection"}
            >
              {!activeCollectionPath ? (
                <option value="">No request collection</option>
              ) : (
                <>
                  <option value="">No Environment</option>
                  {collectionEnvironments.map((env) => (
                    <option key={env.name} value={env.name}>
                      {env.name}
                    </option>
                  ))}
                </>
              )}
            </select>
        </label>
        {collections.length > 0 && (
          <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
            <FolderOpen className="h-4 w-4" />
            {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </span>
        )}
        {runningMocks > 0 && (
          <span className="flex items-center gap-1 text-[var(--color-success)]">
            <Server className="h-4 w-4" />
            {runningMocks} mock{runningMocks !== 1 ? "s" : ""}
          </span>
        )}
        {activeMonitors > 0 && (
          <span className="flex items-center gap-1 text-[var(--color-success)]">
            <Activity className="h-4 w-4" />
            {activeMonitors} monitor{activeMonitors !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Console toggle */}
        <button
          onClick={toggleConsole}
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            consoleOpen
              ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
              : "text-[var(--color-text-dimmed)] hover:text-[var(--color-text-secondary)]"
          }`}
          title={t("commandPalette.toggleConsole")}
        >
          <ScrollText className="h-4 w-4" />
          {consoleEntries.length > 0 && (
            <span className={`text-[11px] font-bold ${hasErrors ? "text-[var(--color-error)]" : ""}`}>
              {consoleEntries.length}
            </span>
          )}
        </button>

        {/* Terminal toggle */}
        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
              terminalOpen
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                : "text-[var(--color-text-dimmed)] hover:text-[var(--color-text-secondary)]"
            }`}
            title="Toggle Terminal (Ctrl+`)"
          >
            <Terminal className="h-4 w-4" />
          </button>
        )}

        {/* Layout toggle */}
        <button
          onClick={toggleLayout}
          className="flex items-center gap-1 text-[var(--color-text-dimmed)] transition-colors hover:text-[var(--color-text-secondary)]"
          title={
            layout === "horizontal"
              ? "Switch to stacked layout"
              : layout === "vertical"
                ? "Switch to tabbed layout"
                : "Switch to side-by-side layout"
          }
        >
          {layout === "horizontal" ? (
            <Columns2 className="h-4 w-4" />
          ) : layout === "vertical" ? (
            <Rows2 className="h-4 w-4" />
          ) : (
            <LayoutList className="h-4 w-4" />
          )}
        </button>

        <span className="text-[var(--color-text-dimmed)]">ApiArk v{appVersion}</span>
      </div>
    </div>
  );
}
