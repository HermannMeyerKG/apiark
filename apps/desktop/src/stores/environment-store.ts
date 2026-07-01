import { create } from "zustand";
import type { EnvironmentData } from "@apiark/types";
import {
  loadGlobalEnvironment as loadGlobalEnvironmentApi,
  loadEnvironments as loadEnvironmentsApi,
  getResolvedVariables as getResolvedVariablesApi,
  loadRootDotenv,
  saveEnvironment,
  saveGlobalEnvironment,
} from "@/lib/tauri-api";

interface EnvironmentState {
  globalEnvironment: EnvironmentData;
  collectionEnvironments: EnvironmentData[];
  /** Backwards-compatible alias for collectionEnvironments. */
  environments: EnvironmentData[];
  activeCollectionEnvironmentName: string | null;
  /** Backwards-compatible alias for activeCollectionEnvironmentName. */
  activeEnvironmentName: string | null;
  activeCollectionPath: string | null;
  runtimeOverrides: Record<string, string>;
  globalRuntimeOverrides: Record<string, string>;

  loadGlobalEnvironment: () => Promise<void>;
  loadEnvironments: (collectionPath: string) => Promise<void>;
  clearEnvironments: () => void;
  setActiveEnvironment: (name: string | null) => void;
  setActiveCollectionPath: (path: string | null) => void;
  getResolvedVariables: () => Promise<Record<string, string>>;
  applyMutations: (mutations: Record<string, string | null>) => void;
  persistMutations: (mutations: Record<string, string | null>) => Promise<void>;
  applyGlobalMutations: (mutations: Record<string, string | null>) => void;
  persistGlobalMutations: (mutations: Record<string, string | null>) => Promise<void>;
  saveGlobal: (env: EnvironmentData) => Promise<void>;
}

const emptyGlobalEnvironment: EnvironmentData = {
  name: "Globals",
  variables: {},
  secrets: [],
  scope: "personal",
};

function sortedVariables(variables: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  globalEnvironment: emptyGlobalEnvironment,
  collectionEnvironments: [],
  environments: [],
  activeCollectionEnvironmentName: null,
  activeEnvironmentName: null,
  activeCollectionPath: null,
  runtimeOverrides: {},
  globalRuntimeOverrides: {},

  loadGlobalEnvironment: async () => {
    try {
      const env = await loadGlobalEnvironmentApi();
      set({
        globalEnvironment: {
          ...emptyGlobalEnvironment,
          ...env,
          name: "Globals",
          scope: "personal",
        },
      });
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to load global environment: ${err}`),
      );
    }
  },

  loadEnvironments: async (collectionPath) => {
    try {
      if (
        get().activeCollectionPath === collectionPath &&
        get().collectionEnvironments.length > 0
      ) {
        return;
      }

      const envs = await loadEnvironmentsApi(collectionPath);
      const activeEnvironmentName = get().activeCollectionEnvironmentName;
      const activeEnvironmentExists =
        activeEnvironmentName != null &&
        envs.some((env) => env.name === activeEnvironmentName);
      const nextActiveEnvironmentName = activeEnvironmentExists
        ? activeEnvironmentName
        : envs.length > 0 ? envs[0].name : null;

      set({
        collectionEnvironments: envs,
        environments: envs,
        activeCollectionPath: collectionPath,
        activeCollectionEnvironmentName: nextActiveEnvironmentName,
        activeEnvironmentName: nextActiveEnvironmentName,
        runtimeOverrides: {},
      });
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to load environments: ${err}`),
      );
    }
  },

  clearEnvironments: () => {
    set({
      collectionEnvironments: [],
      environments: [],
      activeCollectionEnvironmentName: null,
      activeEnvironmentName: null,
      activeCollectionPath: null,
      runtimeOverrides: {},
    });
  },

  setActiveEnvironment: (name) => {
    set({
      activeCollectionEnvironmentName: name,
      activeEnvironmentName: name,
      runtimeOverrides: {},
    });
  },

  setActiveCollectionPath: (path) => {
    set({ activeCollectionPath: path });
  },

  getResolvedVariables: async () => {
    const {
      activeCollectionPath,
      activeCollectionEnvironmentName,
      globalEnvironment,
      globalRuntimeOverrides,
      runtimeOverrides,
    } = get();
    const globalVars = {
      ...globalEnvironment.variables,
      ...globalRuntimeOverrides,
    };

    if (!activeCollectionPath) {
      return { ...globalVars, ...runtimeOverrides };
    }

    if (!activeCollectionEnvironmentName) {
      try {
        const rootVars = await loadRootDotenv(activeCollectionPath);
        return { ...globalVars, ...rootVars, ...runtimeOverrides };
      } catch {
        import("@/stores/toast-store").then(({ useToastStore }) =>
          useToastStore.getState().showWarning("Could not load .env file"),
        );
        return { ...globalVars, ...runtimeOverrides };
      }
    }

    try {
      const resolved = await getResolvedVariablesApi(
        activeCollectionPath,
        activeCollectionEnvironmentName,
      );
      return { ...resolved, ...globalRuntimeOverrides, ...runtimeOverrides };
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to resolve variables: ${err}`),
      );
      return { ...globalVars, ...runtimeOverrides };
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
    const { activeCollectionPath, activeCollectionEnvironmentName, collectionEnvironments } = get();
    if (!activeCollectionPath || !activeCollectionEnvironmentName) return;

    const env = collectionEnvironments.find((e) => e.name === activeCollectionEnvironmentName);
    if (!env) return;

    const variables = { ...env.variables };
    for (const [key, value] of Object.entries(mutations)) {
      if (value === null) {
        delete variables[key];
      } else {
        variables[key] = value;
      }
    }

    try {
      await saveEnvironment(activeCollectionPath, {
        ...env,
        variables: sortedVariables(variables),
      });
      const previousPath = get().activeCollectionPath;
      set({ activeCollectionPath: null });
      await get().loadEnvironments(previousPath ?? activeCollectionPath);
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to persist environment mutations: ${err}`),
      );
    }
  },

  applyGlobalMutations: (mutations) => {
    set((state) => {
      const overrides = { ...state.globalRuntimeOverrides };
      for (const [key, value] of Object.entries(mutations)) {
        if (value === null) {
          delete overrides[key];
        } else {
          overrides[key] = value;
        }
      }
      return { globalRuntimeOverrides: overrides };
    });
  },

  persistGlobalMutations: async (mutations) => {
    const { globalEnvironment } = get();
    const variables = { ...globalEnvironment.variables };
    for (const [key, value] of Object.entries(mutations)) {
      if (value === null) {
        delete variables[key];
      } else {
        variables[key] = value;
      }
    }

    try {
      await saveGlobalEnvironment({
        ...globalEnvironment,
        name: "Globals",
        variables: sortedVariables(variables),
        scope: "personal",
      });
      await get().loadGlobalEnvironment();
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to persist global environment mutations: ${err}`),
      );
    }
  },

  saveGlobal: async (env) => {
    try {
      await saveGlobalEnvironment({
        ...env,
        name: "Globals",
        variables: sortedVariables(env.variables),
        scope: "personal",
      });
      await get().loadGlobalEnvironment();
    } catch (err) {
      import("@/stores/toast-store").then(({ useToastStore }) =>
        useToastStore.getState().showError(`Failed to save global environment: ${err}`),
      );
      throw err;
    }
  },
}));
