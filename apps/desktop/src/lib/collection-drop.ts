import type { CollectionNode } from "@apiark/types";
import { isSameOrDescendant, normalizePath, parentPath, pathName } from "./collection-path";

export type DropPosition = "before" | "inside" | "after";
export interface CollectionDrop {
  targetPath: string;
  destination: string;
  position: DropPosition;
}

export function findTreeNode(nodes: CollectionNode[], path: string): CollectionNode | undefined {
  for (const node of nodes) {
    if (normalizePath(node.path) === normalizePath(path)) return node;
    if (node.type !== "request") {
      const found = findTreeNode(node.children, path);
      if (found) return found;
    }
  }
}

export function resolveCollectionDrop(
  nodes: CollectionNode[], collectionPath: string, sourcePath: string,
  targetPath: string, position: DropPosition,
): CollectionDrop | null {
  if (isSameOrDescendant(targetPath, sourcePath)) return null;
  if (normalizePath(targetPath) === normalizePath(collectionPath)) {
    return { targetPath, destination: collectionPath, position: "inside" };
  }
  const target = findTreeNode(nodes, targetPath);
  const source = findTreeNode(nodes, sourcePath);
  if (!target || !source || source.type === "collection") return null;
  const inside = position === "inside" && target.type !== "request";
  // The tree groups folders above requests; only like items can be reordered.
  if (!inside && target.type !== source.type) return null;
  const destination = inside ? target.path : parentPath(target.path);
  if (isSameOrDescendant(destination, sourcePath)) return null;
  return { targetPath, destination, position: inside ? "inside" : position };
}

/** Use the complete tree, including siblings hidden by the search filter. */
export function collectionDropOrder(
  nodes: CollectionNode[], collectionPath: string, sourcePath: string, drop: CollectionDrop,
): string[] {
  const parent = findTreeNode(nodes, drop.destination);
  const children = normalizePath(drop.destination) === normalizePath(collectionPath)
    ? nodes : parent && parent.type !== "request" ? parent.children : [];
  const siblings = children.filter((node) => normalizePath(node.path) !== normalizePath(sourcePath));
  const key = (node: CollectionNode) => node.type === "request"
    ? pathName(node.path).replace(/\.(yaml|yml)$/, "") : pathName(node.path);
  const order = siblings.map(key);
  const source = findTreeNode(nodes, sourcePath);
  if (!source) return order;
  const index = siblings.findIndex((node) => node.path === drop.targetPath);
  order.splice(drop.position === "inside" || index === -1 ? order.length : index + (drop.position === "after" ? 1 : 0), 0, key(source));
  return order;
}
