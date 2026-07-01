import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VariableSourceInfo, VariableSourceKind } from "@/stores/environment-store";

const SOURCE_LABELS: Record<VariableSourceKind, string> = {
  global: "Global",
  collection: "Collection",
  runtime: "Runtime",
  secret: "Secret",
  unresolved: "Missing",
};

const SOURCE_CLASSES: Record<VariableSourceKind, string> = {
  global: "bg-emerald-500/15 text-emerald-400",
  collection: "bg-blue-500/15 text-blue-400",
  runtime: "bg-violet-500/15 text-violet-400",
  secret: "bg-amber-500/15 text-amber-400",
  unresolved: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
};

export function VariableSourceBadge({ source }: { source: VariableSourceKind }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_CLASSES[source]}`}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

function getVariableContext(value: string, cursor: number) {
  const beforeCursor = value.slice(0, cursor);
  const openIndex = beforeCursor.lastIndexOf("{{");
  if (openIndex === -1) return null;

  const closeIndex = beforeCursor.lastIndexOf("}}");
  if (closeIndex > openIndex) return null;

  const prefix = beforeCursor.slice(openIndex + 2);
  if (/[{}\s]/.test(prefix)) return null;

  return { openIndex, prefix };
}

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: VariableSourceInfo[];
  type?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  deferCommit?: boolean;
}

function extractVariableNames(value: string) {
  const matches = value.match(/\{\{([\w$]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((match) => match.slice(2, -2)))];
}

function VariableInputComponent({
  value,
  onChange,
  suggestions,
  type = "text",
  placeholder,
  className,
  disabled,
  deferCommit = false,
}: VariableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const commitTimerRef = useRef<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [draftValue, setDraftValue] = useState(value);
  const inputValue = deferCommit ? draftValue : value;

  useEffect(() => {
    if (!deferCommit || !focused) {
      setDraftValue(value);
    }
  }, [deferCommit, focused, value]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  const commitValue = useCallback((nextValue: string) => {
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    onChange(nextValue);
  }, [onChange]);

  const scheduleCommit = useCallback((nextValue: string) => {
    if (!deferCommit) {
      onChange(nextValue);
      return;
    }
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      onChange(nextValue);
    }, 90);
  }, [deferCommit, onChange]);

  const suggestionByName = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.name, suggestion])),
    [suggestions],
  );
  const completeVariables = useMemo(
    () => extractVariableNames(inputValue)
      .map((name) => suggestionByName.get(name) ?? { name, source: "unresolved" as const })
      .slice(0, 3),
    [inputValue, suggestionByName],
  );

  const context = useMemo(() => getVariableContext(inputValue, cursor), [cursor, inputValue]);
  const filteredSuggestions = useMemo(() => {
    if (!context) return [];
    const prefix = context.prefix.toLowerCase();
    return suggestions
      .filter((item) => item.name.toLowerCase().includes(prefix))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(prefix);
        const bStarts = b.name.toLowerCase().startsWith(prefix);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [context, suggestions]);
  const showSuggestions = focused && filteredSuggestions.length > 0;

  const syncCursor = () => {
    const nextCursor = inputRef.current?.selectionStart ?? 0;
    setCursor(nextCursor);
    setActiveIndex(0);
  };

  const insertSuggestion = (suggestion: VariableSourceInfo) => {
    if (!context) return;
    const nextValue = `${inputValue.slice(0, context.openIndex)}{{${suggestion.name}}}${inputValue.slice(cursor)}`;
    const nextCursor = context.openIndex + suggestion.name.length + 4;
    setDraftValue(nextValue);
    commitValue(nextValue);
    setFocused(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  };

  return (
    <div className="relative min-w-0 w-full">
      <input
        ref={inputRef}
        type={type}
        value={inputValue}
        onChange={(e) => {
          const nextValue = e.target.value;
          setDraftValue(nextValue);
          scheduleCommit(nextValue);
          setCursor(e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={syncCursor}
        onKeyUp={syncCursor}
        onFocus={(e) => {
          setFocused(true);
          setCursor(e.currentTarget.selectionStart ?? 0);
        }}
        onBlur={() => {
          if (deferCommit) {
            commitValue(inputValue);
          }
          window.setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={(e) => {
          if (!showSuggestions) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, filteredSuggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertSuggestion(filteredSuggestions[activeIndex]);
          } else if (e.key === "Escape") {
            setFocused(false);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={`${className ?? ""} ${completeVariables.length > 0 ? "pr-24" : ""}`}
      />
      {completeVariables.length > 0 && (
        <div className="pointer-events-none absolute right-1 top-1/2 flex max-w-[45%] -translate-y-1/2 items-center justify-end gap-1 overflow-hidden">
          {completeVariables.map((variable) => (
            <VariableSourceBadge key={`${variable.name}-${variable.source}`} source={variable.source} />
          ))}
        </div>
      )}
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-elevated)] py-1 shadow-xl">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.source}-${suggestion.name}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertSuggestion(suggestion);
              }}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${
                index === activeIndex
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              <span className="min-w-0 truncate font-mono">{suggestion.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                {suggestion.overrides && (
                  <span className="text-[10px] text-[var(--color-text-dimmed)]">
                    overrides {SOURCE_LABELS[suggestion.overrides]}
                  </span>
                )}
                <VariableSourceBadge source={suggestion.source} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const VariableInput = memo(VariableInputComponent);
