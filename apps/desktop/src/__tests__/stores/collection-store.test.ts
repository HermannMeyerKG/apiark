import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollectionStore } from "@/stores/collection-store";
import { createRequest, openCollection } from "@/lib/tauri-api";

vi.mock("@/lib/tauri-api", () => ({
  createRequest: vi.fn(),
  openCollection: vi.fn(),
}));

describe("Collection Store request creation", () => {
  const collectionPath = "C:\\Collections\\Beispiel";
  const dir = `${collectionPath}\\Unterordner`;
  const collection = {
    type: "collection" as const,
    name: "Beispiel",
    path: collectionPath,
    children: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCollectionStore.setState({ collections: [collection] });
    vi.mocked(openCollection).mockResolvedValue(collection);
  });

  it.each([
    ["/api/decision", "api-decision"],
    ["\\api\\decision", "api-decision"],
    ["GET /api/decision?id=1", "get-api-decision-id=1"],
    ["Entscheidung prüfen", "entscheidung-prüfen"],
    ["existing-request", "existing-request"],
    ["/", "request"],
    ["CON", "request-con"],
  ])("saves %s in the selected folder with a safe filename", async (name, filename) => {
    const filePath = `${dir}\\${filename}.yaml`;
    vi.mocked(createRequest).mockResolvedValue(filePath);

    const result = await useCollectionStore.getState().createRequest(
      dir, name, name, collectionPath,
    );

    expect(createRequest).toHaveBeenCalledWith(dir, filename, name);
    expect(result).toBe(filePath);
    expect(openCollection).toHaveBeenCalledWith(collectionPath);
  });
});
