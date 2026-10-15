import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Folder, FolderOpen } from "lucide-react";
import type { CollectionNode } from "@apiark/types";
import { useCollectionStore } from "@/stores/collection-store";
import { isSameOrDescendant, normalizePath, parentPath } from "@/lib/collection-path";

export function MoveItemDialog({ node, collectionPath, onClose }: {
  node: CollectionNode;
  collectionPath: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const collection = useCollectionStore((state) => state.collections.find((item) => item.path === collectionPath));
  const [destination, setDestination] = useState(parentPath(node.path));
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destinations: { path: string; label: string; depth: number }[] = [];
  function visit(item: CollectionNode, depth: number, prefix: string) {
    if (item.type === "request" || isSameOrDescendant(item.path, node.path)) return;
    const label = prefix ? `${prefix} / ${item.name}` : item.name;
    destinations.push({ path: item.path, label, depth });
    for (const child of item.children) visit(child, depth + 1, label);
  }
  if (collection) visit(collection, 0, "");

  async function submit() {
    setMoving(true);
    setError(null);
    try {
      await useCollectionStore.getState().moveItem(node.path, destination, collectionPath);
      onClose();
    } catch (err) {
      setError(t("sidebar.moveFailed", { error: String(err) }));
      setMoving(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !moving) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-5 shadow-2xl">
          <Dialog.Title className="mb-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {t("sidebar.moveItem", { name: node.name, defaultValue: 'Move “{{name}}”' })}
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-xs text-[var(--color-text-muted)]">
            {t("sidebar.moveDestination", "Choose a destination folder. Select the collection to move to the top level.")}
          </Dialog.Description>
          <div role="group" aria-label={t("sidebar.destinationFolder", "Destination folder")} className="mb-4 max-h-72 overflow-auto rounded-lg border border-[var(--color-border)] p-1">
            {destinations.map((item) => {
              const selected = normalizePath(destination) === normalizePath(item.path);
              const current = normalizePath(parentPath(node.path)) === normalizePath(item.path);
              return (
                <button key={item.path} type="button" disabled={moving} aria-pressed={selected}
                  onClick={() => { setDestination(item.path); setError(null); }}
                  title={item.label}
                  className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${selected ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]" : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"}`}
                  style={{ paddingLeft: item.depth * 16 + 8 }}>
                  {item.depth === 0 ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{item.label.split(" / ").pop()}</span>
                  {current && <span className="text-xs text-[var(--color-text-muted)]">{t("sidebar.currentFolder", "Current")}</span>}
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
          {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} disabled={moving} className="rounded-lg px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] disabled:opacity-50">{t("common.cancel", "Cancel")}</button>
            <button onClick={submit} disabled={moving || normalizePath(destination) === normalizePath(parentPath(node.path))}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
              {moving ? t("sidebar.moving", "Moving…") : t("sidebar.move", "Move")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
