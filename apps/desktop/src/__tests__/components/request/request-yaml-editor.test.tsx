import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestFile } from "@apiark/types";
import "@/lib/i18n";

vi.mock("@/components/ui/code-editor", () => ({
  CodeEditor: ({ value, onChange, readOnly }: { value: string; onChange: (value: string) => void; readOnly: boolean }) => (
    <textarea aria-label="YAML editor" value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock("@/lib/tauri-api", () => ({
  readRequestYaml: vi.fn(),
  serializeRequestYaml: vi.fn(),
  parseRequestYaml: vi.fn(),
  saveRequestFile: vi.fn().mockResolvedValue(undefined),
  loadPersistedState: vi.fn(),
  savePersistedState: vi.fn(),
}));

import { RequestYamlEditor } from "@/components/request/request-yaml-editor";
import { RequestPanel } from "@/components/request/request-panel";
import { useTabStore, tabToRequestFile, useActiveTab } from "@/stores/tab-store";
import { parseRequestYaml, readRequestYaml, saveRequestFile, serializeRequestYaml } from "@/lib/tauri-api";

const source = "# Kommentar prüfen\nname: Test\nmethod: GET\nurl: https://example.com\n";
const edited = source.replace("GET", "POST");
const parsed: RequestFile = {
  name: "Test", method: "POST", url: "https://example.com", headers: { "X-Test": "yes" },
  description: "Beschreibung", cookies: { session: "abc" },
  assert: { status: 201, body: { items: [1, 2] } },
};

function ActiveEditor() {
  const tab = useActiveTab();
  return tab ? <RequestYamlEditor key={tab.id} tab={tab} /> : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  useTabStore.setState({ tabs: [], activeTabId: null, autoSaveError: null });
  useTabStore.getState().newTab();
  useTabStore.setState((state) => ({
    tabs: state.tabs.map((tab) => ({ ...tab, name: "Test", url: "https://example.com", filePath: "C:/collection/test.yaml", collectionPath: "C:/collection" })),
  }));
  vi.mocked(readRequestYaml).mockResolvedValue(source);
  vi.mocked(serializeRequestYaml).mockResolvedValue(source);
  vi.mocked(parseRequestYaml).mockResolvedValue(parsed);
});

afterEach(cleanup);

describe("Request YAML editor", () => {
  it("places the YAML tab at the right of the input tabs and opens the file", async () => {
    render(<RequestPanel />);
    const button = screen.getByRole("button", { name: "YAML" });
    expect(button).toHaveClass("ml-auto");
    expect(button.parentElement?.lastElementChild).toBe(button);
    fireEvent.click(button);
    expect(await screen.findByRole("textbox", { name: "YAML editor" })).toHaveValue(source);
    expect(readRequestYaml).toHaveBeenCalledWith("C:/collection/test.yaml");
  });

  it("keeps drafts when switching requests and excludes them from auto-save", async () => {
    render(<ActiveEditor />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: edited } });
    const firstId = useTabStore.getState().activeTabId!;
    await act(async () => { await useTabStore.getState().autoSave(); });
    expect(saveRequestFile).not.toHaveBeenCalled();
    act(() => useTabStore.getState().newTab());
    act(() => useTabStore.getState().setActiveTab(firstId));
    expect(await screen.findByRole("textbox")).toHaveValue(edited);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(source));
  });

  it("shows invalid YAML without changing request fields or writing the file", async () => {
    vi.mocked(parseRequestYaml).mockRejectedValueOnce(new Error("Invalid request YAML: line 2"));
    render(<ActiveEditor />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "name: [" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("line 2");
    expect(useTabStore.getState().tabs[0].method).toBe("GET");
    expect(screen.getByRole("textbox")).toHaveValue("name: [");
    expect(saveRequestFile).not.toHaveBeenCalled();
  });

  it("applies YAML during save and preserves its source, metadata and nested assertions", async () => {
    const id = useTabStore.getState().activeTabId!;
    useTabStore.getState().setYamlDraft(id, edited, source);
    await useTabStore.getState().save();
    const tab = useTabStore.getState().tabs[0];
    expect(tab.method).toBe("POST");
    expect(tab.headers[0]).toMatchObject({ key: "X-Test", value: "yes" });
    expect(tab.yamlDraft).toBeUndefined();
    expect(tab.isDirty).toBe(false);
    expect(JSON.parse(tab.assertions!)).toEqual(parsed.assert);
    expect(saveRequestFile).toHaveBeenCalledWith(tab.filePath, expect.objectContaining({ description: "Beschreibung", cookies: parsed.cookies }), edited, tab.assertions);
    useTabStore.getState().setUrl("https://example.com/changed");
    const changed = useTabStore.getState().tabs[0];
    expect(changed.requestYaml).toBeUndefined();
    expect(tabToRequestFile(changed)).toMatchObject({ description: "Beschreibung", cookies: parsed.cookies, url: "https://example.com/changed" });
    useTabStore.getState().undoTab();
    expect(useTabStore.getState().tabs[0].requestYaml).toBe(edited);
  });

  it("does not overwrite a newer edit when parsing finishes late", async () => {
    let resolve!: (file: RequestFile) => void;
    vi.mocked(parseRequestYaml).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const id = useTabStore.getState().activeTabId!;
    useTabStore.getState().setYamlDraft(id, edited, source);
    const saving = useTabStore.getState().save();
    useTabStore.getState().setYamlDraft(id, "name: newer edit");
    resolve(parsed);
    await saving;
    expect(useTabStore.getState().tabs[0].yamlDraft).toBe("name: newer edit");
    expect(saveRequestFile).not.toHaveBeenCalled();
  });
});
