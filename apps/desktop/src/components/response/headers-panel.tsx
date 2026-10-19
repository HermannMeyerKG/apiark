import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { KeyValuePair } from "@apiark/types";

export function HeadersPanel({
  requestHeaders,
  responseHeaders,
}: {
  requestHeaders?: KeyValuePair[];
  responseHeaders: KeyValuePair[];
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <HeaderSection
        title={t("response.requestHeaders")}
        headers={requestHeaders}
        emptyMessage={t(requestHeaders ? "response.noHeaders" : "response.requestHeadersUnavailable")}
      />
      <HeaderSection
        title={t("response.responseHeaders")}
        headers={responseHeaders}
        emptyMessage={t("response.noHeaders")}
      />
    </div>
  );
}

function HeaderSection({
  title,
  headers,
  emptyMessage,
}: {
  title: string;
  headers?: KeyValuePair[];
  emptyMessage: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const contentId = useId();
  const [expanded, setExpanded] = useState(true);

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <h3>
        <button
          id={titleId}
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-3 bg-[var(--color-elevated)] px-4 py-3 text-left text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-blue-500 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          <span>{title}</span>
          {headers && (
            <span className="ml-auto rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-500">
              {headers.length}
            </span>
          )}
        </button>
      </h3>
      <div id={contentId} hidden={!expanded} className="border-t border-[var(--color-border)] p-4">
        {headers && headers.length > 0 ? (
          <table aria-labelledby={titleId} className="w-full table-fixed text-left text-sm">
            <thead className="text-xs text-[var(--color-text-muted)]">
              <tr className="border-b border-[var(--color-border)]">
                <th scope="col" className="w-1/3 pb-2 pr-4 font-medium">{t("request.key")}</th>
                <th scope="col" className="pb-2 font-medium">{t("request.value")}</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((header, index) => (
                <tr key={index} className="border-b border-[var(--color-elevated)]">
                  <td className="break-words py-1.5 pr-4 align-top font-medium text-[var(--color-text-secondary)]">
                    {header.key}
                  </td>
                  <td className="whitespace-pre-wrap break-words py-1.5 align-top font-mono text-xs text-[var(--color-text-primary)]">
                    {header.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-[var(--color-text-dimmed)]">{emptyMessage}</p>
        )}
      </div>
    </section>
  );
}
