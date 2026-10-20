import { describe, expect, it } from "vitest";
import type { CollectionNode } from "@apiark/types";
import { collectionDropOrder, resolveCollectionDrop } from "@/lib/collection-drop";
import { isSameOrDescendant, parentPath, replacePathPrefix } from "@/lib/collection-path";

const root = "C:\\Collections\\Test";
const folder = (name: string, children: CollectionNode[] = []): CollectionNode => ({ type: "folder", name, path: `${root}\\${name}`, children });
const nodes = [folder("A", [folder("A\\Nested")]), folder("B"), folder("Hidden")];

describe("Collection folder drops", () => {
  it("moves into a sibling folder and preserves unfiltered siblings", () => {
    const drop = resolveCollectionDrop(nodes, root, `${root}\\B`, `${root}\\A`, "inside")!;
    expect(drop.destination).toBe(`${root}\\A`);
    expect(collectionDropOrder(nodes, root, `${root}\\B`, drop)).toEqual(["Nested", "B"]);
  });

  it("moves a nested folder back to the collection root", () => {
    const drop = resolveCollectionDrop(nodes, root, `${root}\\A\\Nested`, root, "inside")!;
    expect(collectionDropOrder(nodes, root, `${root}\\A\\Nested`, drop)).toEqual(["A", "B", "Hidden", "Nested"]);
  });

  it("reorders before and after without losing hidden nodes", () => {
    for (const position of ["before", "after"] as const) {
      const drop = resolveCollectionDrop(nodes, root, `${root}\\B`, `${root}\\A`, position)!;
      expect(drop.destination).toBe(root);
      expect(collectionDropOrder(nodes, root, `${root}\\B`, drop)).toEqual(position === "before" ? ["B", "A", "Hidden"] : ["A", "B", "Hidden"]);
    }
  });

  it("moves beside an entry on a higher level", () => {
    const drop = resolveCollectionDrop(nodes, root, `${root}\\A\\Nested`, `${root}\\B`, "after")!;
    expect(drop.destination).toBe(root);
    expect(collectionDropOrder(nodes, root, `${root}\\A\\Nested`, drop)).toEqual(["A", "B", "Nested", "Hidden"]);
  });

  it.each(["before", "inside", "after"] as const)("rejects %s drops onto itself or descendants", (position) => {
    expect(resolveCollectionDrop(nodes, root, `${root}\\A`, `${root}\\A`, position)).toBeNull();
    expect(resolveCollectionDrop(nodes, root, `${root}\\A`, `${root}\\A\\Nested`, position)).toBeNull();
  });

  it("uses request file stems for persistent ordering", () => {
    const requests: CollectionNode[] = [
      { type: "request", name: "First", path: `${root}\\first.yaml`, method: "GET", isGraphql: false },
      { type: "request", name: "Second", path: `${root}\\second.yml`, method: "GET", isGraphql: false },
    ];
    const drop = resolveCollectionDrop(requests, root, requests[1].path, requests[0].path, "before")!;
    expect(collectionDropOrder(requests, root, requests[1].path, drop)).toEqual(["second", "first"]);
  });
});

describe("Collection paths", () => {
  it("handles Windows and Unix separators without confusing sibling prefixes", () => {
    expect(parentPath(`${root}\\A\\Nested`)).toBe(`${root}\\A`);
    expect(parentPath("/collection/A/Nested")).toBe("/collection/A");
    expect(isSameOrDescendant(`${root}\\AB`, `${root}\\A`)).toBe(false);
    expect(isSameOrDescendant(`${root}\\A\\Nested`, `${root.replace(/\\/g, "/")}/A`)).toBe(true);
    expect(replacePathPrefix(`${root}\\A\\Nested`, `${root}\\A`, `${root}\\B\\A`)).toBe(`${root}\\B\\A\\Nested`);
  });
});
