import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollectionStore } from "@/stores/collection-store";
import { createRequest, duplicateRequest, openCollection } from "@/lib/tauri-api";

vi.mock("@/lib/tauri-api", () => ({
  createRequest: vi.fn(),
  duplicateRequest: vi.fn(),
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
    useCollectionStore.setState({ collections: [collection], readOnlyPaths: new Set() });
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

  it("duplicates a request and refreshes its collection", async () => {
    const source = `${dir}\\request.yaml`;
    const copy = `${dir}\\request-copy.yaml`;
    vi.mocked(duplicateRequest).mockResolvedValue(copy);

    expect(await useCollectionStore.getState().duplicateRequest(source, collectionPath, "Kopie")).toBe(copy);
    expect(duplicateRequest).toHaveBeenCalledWith(source, "Kopie");
    expect(openCollection).toHaveBeenCalledWith(collectionPath);
  });

  it("does not refresh the collection when duplication fails", async () => {
    vi.mocked(duplicateRequest).mockRejectedValue(new Error("Cannot write copy"));
    await expect(useCollectionStore.getState().duplicateRequest(
      `${dir}\\request.yaml`, collectionPath, "Kopie",
    )).rejects.toThrow("Cannot write copy");
    expect(openCollection).not.toHaveBeenCalled();
  });

  it("does not duplicate requests in read-only collections", async () => {
    useCollectionStore.setState({ readOnlyPaths: new Set([collectionPath]) });
    await expect(useCollectionStore.getState().duplicateRequest(
      `${dir}\\request.yaml`, collectionPath, "Kopie",
    )).rejects.toThrow("Collection is read-only");
    expect(duplicateRequest).not.toHaveBeenCalled();
  });
});
