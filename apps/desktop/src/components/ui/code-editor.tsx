import { useRef, useCallback, useEffect, useState } from "react";
import Editor, { type OnMount, loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useResolvedTheme } from "@/hooks/use-theme";
import {
  getArkEnvGetCompletionContext,
  getArkEnvMemberCompletionContext,
} from "./env-completions";

// Configure Monaco to use the local monaco-editor package instead of fetching from CDN.
// The vite-plugin-monaco-editor handles bundling workers automatically.
import * as monacoEditor from "monaco-editor";
loader.config({ monaco: monacoEditor });

// ApiArk light theme
const APIARK_LIGHT: Monaco.editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b7280", fontStyle: "italic" },
    { token: "keyword", foreground: "7c3aed" },
    { token: "string", foreground: "059669" },
    { token: "number", foreground: "d97706" },
    { token: "type", foreground: "4f46e5" },
    { token: "variable", foreground: "2563eb" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#111827",
    "editor.lineHighlightBackground": "#f5f6fa",
    "editor.selectionBackground": "#6366f130",
    "editorCursor.foreground": "#6366f1",
    "editorLineNumber.foreground": "#9ca3af",
    "editorLineNumber.activeForeground": "#374151",
    "editor.inactiveSelectionBackground": "#6366f115",
    "editorIndentGuide.background": "#e4e6ed",
    "editorWidget.background": "#f8f9fc",
    "editorWidget.border": "#d1d5e0",
    "input.background": "#ffffff",
    "input.border": "#d1d5e0",
  },
};

// ApiArk dark theme
const APIARK_DARK: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b7280", fontStyle: "italic" },
    { token: "keyword", foreground: "a78bfa" },
    { token: "string", foreground: "34d399" },
    { token: "number", foreground: "fbbf24" },
    { token: "type", foreground: "818cf8" },
    { token: "variable", foreground: "60a5fa" },
  ],
  colors: {
    "editor.background": "#141416",
    "editor.foreground": "#e4e4e7",
    "editor.lineHighlightBackground": "#1c1c1f",
    "editor.selectionBackground": "#6366f140",
    "editorCursor.foreground": "#6366f1",
    "editorLineNumber.foreground": "#52525b",
    "editorLineNumber.activeForeground": "#a1a1aa",
    "editor.inactiveSelectionBackground": "#6366f120",
    "editorIndentGuide.background": "#2a2a2e",
    "editorWidget.background": "#141416",
    "editorWidget.border": "#2a2a2e",
    "input.background": "#1c1c1f",
    "input.border": "#2a2a2e",
  },
};

// ApiArk black/OLED theme
const APIARK_BLACK: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: APIARK_DARK.rules,
  colors: {
    ...APIARK_DARK.colors,
    "editor.background": "#0a0a0a",
    "editor.lineHighlightBackground": "#141414",
    "editorIndentGuide.background": "#1f1f1f",
    "editorWidget.background": "#0a0a0a",
    "editorWidget.border": "#1f1f1f",
    "input.background": "#141414",
    "input.border": "#1f1f1f",
  },
};

let themesRegistered = false;
let graphqlRegistered = false;

function registerThemes(monaco: typeof Monaco) {
  if (themesRegistered) return;
  monaco.editor.defineTheme("apiark-light", APIARK_LIGHT);
  monaco.editor.defineTheme("apiark-dark", APIARK_DARK);
  monaco.editor.defineTheme("apiark-black", APIARK_BLACK);
  themesRegistered = true;
}

function registerGraphQL(monaco: typeof Monaco) {
  if (graphqlRegistered) return;
  graphqlRegistered = true;

  monaco.languages.register({ id: "graphql" });
  monaco.languages.setMonarchTokensProvider("graphql", {
    keywords: [
      "query", "mutation", "subscription", "fragment", "on", "type", "input",
      "enum", "scalar", "interface", "union", "extend", "schema", "directive",
      "implements", "true", "false", "null",
    ],
    typeKeywords: ["Int", "Float", "String", "Boolean", "ID"],
    operators: ["=", "!", "...", ":", "@", "|", "&"],
    symbols: /[=!:@|&]+/,
    escapes: /\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4})/,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
        [/\d+/, "number"],
        [/\$\w+/, "variable"],
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@default": "identifier",
          },
        }],
        // eslint-disable-next-line no-useless-escape
        [/[{}()\[\]]/, "@brackets"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        }],
        { include: "@whitespace" },
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, "white"],
      ],
    },
  });
}

// Pre-register GraphQL language since Monaco doesn't include it by default.
registerGraphQL(monacoEditor);

function getMonacoTheme(resolved: "light" | "dark" | "black"): string {
  switch (resolved) {
    case "light": return "apiark-light";
    case "black": return "apiark-black";
    default: return "apiark-dark";
  }
}

function createEnvironmentCompletionProvider(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  environmentVariables: string[],
): Monaco.languages.CompletionItemProvider {
  const variableNames = [...new Set(environmentVariables)].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    triggerCharacters: ['"', "'", "(", "."],
    provideCompletionItems: (model, position) => {
      if (model !== editor.getModel()) {
        return { suggestions: [] };
      }

      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const getContext = getArkEnvGetCompletionContext(linePrefix);
      if (getContext) {
        const range = new monaco.Range(
          position.lineNumber,
          getContext.replaceStartColumn,
          position.lineNumber,
          getContext.replaceEndColumn,
        );
        const typedPrefix = getContext.typedPrefix.toLowerCase();
        const suggestions = variableNames
          .filter((name) => name.toLowerCase().startsWith(typedPrefix))
          .map((name) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: "Environment variable",
            insertText: getContext.wrapInQuotes ? `"${name}"` : name,
            range,
          }));

        return { suggestions };
      }

      const memberContext = getArkEnvMemberCompletionContext(linePrefix);
      if (!memberContext) {
        return { suggestions: [] };
      }

      const range = new monaco.Range(
        position.lineNumber,
        memberContext.replaceStartColumn,
        position.lineNumber,
        memberContext.replaceEndColumn,
      );

      const suggestions = [
        {
          label: "get",
          kind: monaco.languages.CompletionItemKind.Method,
          detail: 'ark.env.get("name")',
          insertText: 'get("$0")',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "persist",
          kind: monaco.languages.CompletionItemKind.Method,
          detail: 'ark.env.persist("name", value)',
          insertText: 'persist("$1", $0)',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "persistUnset",
          kind: monaco.languages.CompletionItemKind.Method,
          detail: 'ark.env.persistUnset("name")',
          insertText: 'persistUnset("$0")',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
      ].filter((item) =>
        item.label.toLowerCase().startsWith(memberContext.typedPrefix.toLowerCase()),
      );

      return { suggestions };
    },
  };
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: string | number;
  readOnly?: boolean;
  minimap?: boolean;
  lineNumbers?: boolean;
  placeholder?: string;
  environmentVariables?: string[];
  enableEnvironmentCompletions?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language = "javascript",
  height = "200px",
  readOnly = false,
  minimap = false,
  lineNumbers = true,
  placeholder,
  environmentVariables = [],
  enableEnvironmentCompletions = false,
}: CodeEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const environmentCompletionRef = useRef<Monaco.IDisposable | null>(null);
  const resolvedTheme = useResolvedTheme();
  const monacoTheme = getMonacoTheme(resolvedTheme);

  const [contentLeft, setContentLeft] = useState(56);
  const [editorReady, setEditorReady] = useState(false);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReady(true);
    registerGraphQL(monaco);
    registerThemes(monaco);
    monaco.editor.setTheme(monacoTheme);
    setContentLeft(editor.getLayoutInfo().contentLeft);
    editor.onDidLayoutChange((layout) => {
      setContentLeft(layout.contentLeft);
    });
  }, [monacoTheme]);

  useEffect(() => {
    environmentCompletionRef.current?.dispose();
    environmentCompletionRef.current = null;

    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (
      !editorReady ||
      !monaco ||
      !editor ||
      !enableEnvironmentCompletions ||
      language !== "javascript"
    ) {
      return;
    }

    environmentCompletionRef.current =
      monaco.languages.registerCompletionItemProvider(
        "javascript",
        createEnvironmentCompletionProvider(monaco, editor, environmentVariables),
      );

    return () => {
      environmentCompletionRef.current?.dispose();
      environmentCompletionRef.current = null;
    };
  }, [editorReady, enableEnvironmentCompletions, environmentVariables, language]);

  // Switch theme when app theme changes
  if (monacoRef.current && themesRegistered) {
    monacoRef.current.editor.setTheme(monacoTheme);
  }

  const showPlaceholder = placeholder && !value;

  return (
    <div className="relative h-full overflow-hidden rounded border border-[var(--color-border)]">
      {showPlaceholder && (
        <div className="pointer-events-none absolute top-2 z-10 text-sm text-[var(--color-text-dimmed)]" style={{ left: contentLeft }}>
          {placeholder}
        </div>
      )}
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        theme={monacoTheme}
        loading={
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
          </div>
        }
        options={{
          minimap: { enabled: minimap },
          lineNumbers: lineNumbers ? "on" : "off",
          readOnly,
          scrollBeyondLastLine: false,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
          tabSize: 2,
          wordWrap: "on",
          automaticLayout: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: "line",
          folding: true,
          bracketPairColorization: { enabled: true },
          suggest: { showWords: false },
          quickSuggestions: language === "javascript" || language === "typescript",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
        }}
      />
    </div>
  );
}
