import { create } from "zustand";
import type { EnvironmentData } from "@apiark/types";
import {
  loadEnvironments as loadEnvironmentsApi,
  getResolvedVariables as getResolvedVariablesApi,
  loadRootDotenv,
  saveEnvironment,
} from "@/lib/tauri-api";

interface EnvironmentState {
  environments: EnvironmentData[];
  activeEnvironmentName: string | null;
  activeCollectionPath: string | null;
  /** Runtime variable overrides from scripts */
  runtimeOverrides: Record<string, string>;

  loadEnvironments: (collectionPath: string) => Promise<void>;
  clearEnvironments: () => void;
  setActiveEnvironment: (name: string | null) => void;
  setActiveCollectionPath: (path: string | null) => void;
  getResolvedVariables: () => Promise<Record<string, string>>;
  applyMutations: (mutations: Record<string, string | null>) => void;
  persistMutations: (mutations: Record<string, string | null>) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  environments: [],
  activeEnvironmentName: null,
  activeCollectionPath: null,
  runtimeOverrides: {},

  loadEnvironments: async (collectionPath) => {
    try {
      const envs = await loadEnvironmentsApi(collectionPath);
      const activeEnvironmentName = get().activeEnvironmentName;
      const activeEnvironmentExists =
        activeEnvironmentName != null &&
        envs.some((env) => env.name === activeEnvironmentName);
      set({
        environments: envs,
        activeCollectionPath: collectionPath,
        activeEnvironmentName: activeEnvironmentExists
          ? activeEnvironmentName
          : envs.length > 0 ? envs[0].name : null,
      });
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to load environments: ${err}`),
      );
    }
  },

  clearEnvironments: () => {
    set({
      environments: [],
      activeEnvironmentName: null,
      activeCollectionPath: null,
      runtimeOverrides: {},
    });
  },

  setActiveEnvironment: (name) => {
    set({ activeEnvironmentName: name });
  },

  setActiveCollectionPath: (path) => {
    set({ activeCollectionPath: path });
  },

  getResolvedVariables: async () => {
    const { activeCollectionPath, activeEnvironmentName, runtimeOverrides } = get();
    if (!activeCollectionPath) {
      return { ...runtimeOverrides };
    }
    if (!activeEnvironmentName) {
      // No environment selected — still load root .env variables
      try {
        const rootVars = await loadRootDotenv(activeCollectionPath);
        return { ...rootVars, ...runtimeOverrides };
      } catch (err) {
        import("@/stores/toast-store").then(({ useToastStore }) =>
          useToastStore.getState().showWarning("Could not load .env file"),
        );
        return { ...runtimeOverrides };
      }
    }
    try {
      const resolved = await getResolvedVariablesApi(
        activeCollectionPath,
        activeEnvironmentName,
      );
      return { ...resolved, ...runtimeOverrides };
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to resolve variables: ${err}`),
      );
      return { ...runtimeOverrides };
    }
  },

  applyMutations: (mutations) => {
    set((state) => {
      const overrides = { ...state.runtimeOverrides };
      for (const [key, value] of Object.entries(mutations)) {
        if (value === null) {
          delete overrides[key];
        } else {
          overrides[key] = value;
        }
      }
      return { runtimeOverrides: overrides };
    });
  },

  persistMutations: async (mutations) => {
    const { activeCollectionPath, activeEnvironmentName, environments } = get();
    if (!activeCollectionPath || !activeEnvironmentName) return;

    const env = environments.find((e) => e.name === activeEnvironmentName);
    if (!env) return;

    const variables = { ...env.variables };
    for (const [key, value] of Object.entries(mutations)) {
      if (value === null) {
        delete variables[key];
      } else {
        variables[key] = value;
      }
    }

    const sortedVariables = Object.fromEntries(
      Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)),
    );

    try {
      await saveEnvironment(activeCollectionPath, { ...env, variables: sortedVariables });
      await get().loadEnvironments(activeCollectionPath);
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to persist environment mutations: ${err}`),
      );
    }
  },
}));
