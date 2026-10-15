import { create } from "zustand";
import type { AppSettings } from "@apiark/types";
import { getSettings, updateSettings as updateSettingsApi } from "@/lib/tauri-api";
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH } from "@/lib/sidebar-width";

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const defaultSettings: AppSettings = {
  theme: "dark",
  accentColor: "indigo",
  proxyUrl: null,
  proxyUsername: null,
  proxyPassword: null,
  verifySsl: true,
  followRedirects: true,
  timeoutMs: 30000,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  onboardingComplete: false,
  crashReportsEnabled: null,
  caCertPath: null,
  clientCertPath: null,
  clientKeyPath: null,
  clientCertPassphrase: null,
  updateChannel: "stable",
  aiEndpoint: null,
  aiApiKey: null,
  aiModel: null,
  panelRatio: 0.5,
  layout: "horizontal",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  loaded: false,

  loadSettings: async () => {
    try {
      const settings = await getSettings();
      set({ settings: { ...settings, sidebarWidth: clampSidebarWidth(settings.sidebarWidth) }, loaded: true });
    } catch (err) {
      // Settings load failure on startup — use defaults silently but warn
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showWarning("Could not load settings — using defaults"),
      );
      set({ loaded: true });
    }
  },

  updateSettings: async (patch) => {
    try {
      const normalizedPatch = patch.sidebarWidth === undefined
        ? patch
        : { ...patch, sidebarWidth: clampSidebarWidth(patch.sidebarWidth) };
      const settings = await updateSettingsApi(normalizedPatch);
      set({ settings: { ...settings, sidebarWidth: clampSidebarWidth(settings.sidebarWidth) } });
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to save settings: ${err}`),
      );
    }
  },
}));
