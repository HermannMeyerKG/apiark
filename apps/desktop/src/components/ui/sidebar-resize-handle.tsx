import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/sidebar-width";

interface SidebarResizeHandleProps {
  panelRef: React.RefObject<HTMLDivElement | null>;
  width: number;
}

export function SidebarResizeHandle({ panelRef, width }: SidebarResizeHandleProps) {
  const { t } = useTranslation();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    width: number;
    cursor: string;
    userSelect: string;
  } | null>(null);

  useEffect(() => () => {
    if (drag.current) {
      document.body.style.cursor = drag.current.cursor;
      document.body.style.userSelect = drag.current.userSelect;
    }
  }, []);

  const saveWidth = async (nextWidth: number) => {
    await updateSettings({ sidebarWidth: nextWidth });
    if (panelRef.current && !drag.current) {
      panelRef.current.style.width = `${useSettingsStore.getState().settings.sidebarWidth}px`;
    }
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    document.body.style.cursor = current.cursor;
    document.body.style.userSelect = current.userSelect;
    setDragWidth(null);
    if (cancelled || current.width === current.startWidth) {
      if (panelRef.current) panelRef.current.style.width = `${width}px`;
    } else {
      void saveWidth(current.width);
    }
  };

  return (
    <div
      role="separator"
      aria-label={t("settings.sidebarWidth")}
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={dragWidth ?? width}
      tabIndex={0}
      title={t("settings.sidebarWidth")}
      className={`absolute inset-y-0 -right-1 z-10 w-2 touch-none cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 hover:after:bg-[var(--color-accent)] focus-visible:after:bg-[var(--color-accent)] ${dragWidth !== null ? "after:bg-[var(--color-accent)]" : ""}`}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
          width,
          cursor: document.body.style.cursor,
          userSelect: document.body.style.userSelect,
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        setDragWidth(width);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointerId || !panelRef.current) return;
        current.width = clampSidebarWidth(current.startWidth + event.clientX - current.startX);
        // Resize without re-rendering the collection tree or writing settings during the drag.
        panelRef.current.style.width = `${current.width}px`;
        setDragWidth(current.width);
      }}
      onPointerUp={(event) => finishDrag(event)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onLostPointerCapture={(event) => finishDrag(event, true)}
      onDoubleClick={() => { void saveWidth(SIDEBAR_DEFAULT_WIDTH); }}
      onKeyDown={(event) => {
        if (drag.current) return;
        const step = event.shiftKey ? 40 : 8;
        let nextWidth: number;
        switch (event.key) {
          case "ArrowLeft": nextWidth = width - step; break;
          case "ArrowRight": nextWidth = width + step; break;
          case "Home": nextWidth = SIDEBAR_MIN_WIDTH; break;
          case "End": nextWidth = SIDEBAR_MAX_WIDTH; break;
          default: return;
        }
        event.preventDefault();
        void saveWidth(clampSidebarWidth(nextWidth));
      }}
    />
  );
}
