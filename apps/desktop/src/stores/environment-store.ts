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

export type VariableSourceKind = "global" | "collection" | "runtime" | "secret" | "unresolved";

export interface VariableSourceInfo {
  name: string;
  source: VariableSourceKind;
  value?: string;
  environmentName?: string;
  overrides?: VariableSourceKind;
}

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
  getVariableSources: (names?: string[]) => Record<string, VariableSourceInfo>;
  getVariableSuggestions: () => VariableSourceInfo[];
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

function sourceRank(source: VariableSourceKind) {
  switch (source) {
    case "runtime": return 4;
    case "secret": return 3;
    case "collection": return 2;
    case "global": return 1;
    default: return 0;
  }
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

  getVariableSources: (names) => {
    const {
      globalEnvironment,
      collectionEnvironments,
      activeCollectionEnvironmentName,
      globalRuntimeOverrides,
      runtimeOverrides,
    } = get();
    const activeEnv = collectionEnvironments.find((env) => env.name === activeCollectionEnvironmentName);
    const sourceNames = new Set<string>(names ?? []);

    for (const key of Object.keys(globalEnvironment.variables)) sourceNames.add(key);
    for (const key of Object.keys(globalRuntimeOverrides)) sourceNames.add(key);
    for (const key of Object.keys(activeEnv?.variables ?? {})) sourceNames.add(key);
    for (const key of activeEnv?.secrets ?? []) sourceNames.add(key);
    for (const key of Object.keys(runtimeOverrides)) sourceNames.add(key);

    const result: Record<string, VariableSourceInfo> = {};
    for (const name of sourceNames) {
      const globalValue = globalEnvironment.variables[name];
      const collectionValue = activeEnv?.variables[name];
      const isSecret = activeEnv?.secrets?.includes(name) ?? false;
      const globalRuntimeValue = globalRuntimeOverrides[name];
      const runtimeValue = runtimeOverrides[name];

      if (runtimeValue !== undefined) {
        result[name] = {
          name,
          source: "runtime",
          value: runtimeValue,
          environmentName: activeEnv?.name,
          overrides: isSecret ? "secret" : collectionValue !== undefined ? "collection" : globalValue !== undefined ? "global" : undefined,
        };
      } else if (globalRuntimeValue !== undefined) {
        result[name] = {
          name,
          source: "runtime",
          value: globalRuntimeValue,
          overrides: collectionValue !== undefined || isSecret ? "collection" : globalValue !== undefined ? "global" : undefined,
        };
      } else if (isSecret) {
        result[name] = {
          name,
          source: "secret",
          environmentName: activeEnv?.name,
          overrides: globalValue !== undefined ? "global" : undefined,
        };
      } else if (collectionValue !== undefined) {
        result[name] = {
          name,
          source: "collection",
          value: collectionValue,
          environmentName: activeEnv?.name,
          overrides: globalValue !== undefined ? "global" : undefined,
        };
      } else if (globalValue !== undefined) {
        result[name] = {
          name,
          source: "global",
          value: globalValue,
        };
      } else {
        result[name] = {
          name,
          source: "unresolved",
        };
      }
    }

    return result;
  },

  getVariableSuggestions: () => {
    const sources = Object.values(get().getVariableSources());
    return sources
      .filter((source) => source.source !== "unresolved")
      .sort((a, b) => {
        const rank = sourceRank(b.source) - sourceRank(a.source);
        return rank !== 0 ? rank : a.name.localeCompare(b.name);
      });
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
