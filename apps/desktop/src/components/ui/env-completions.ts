export interface ArkEnvGetCompletionContext {
  scope: "env" | "globals";
  typedPrefix: string;
  replaceStartColumn: number;
  replaceEndColumn: number;
  wrapInQuotes: boolean;
}

export interface ArkEnvMemberCompletionContext {
  scope: "env" | "globals";
  typedPrefix: string;
  replaceStartColumn: number;
  replaceEndColumn: number;
}

export function getArkEnvMemberCompletionContext(
  linePrefix: string,
): ArkEnvMemberCompletionContext | null {
  const match = linePrefix.match(/ark\s*\.\s*(env|globals)\s*\.\s*([A-Za-z_$][\w$]*)?$/);

  if (!match) return null;

  const scope = match[1] as "env" | "globals";
  const typedPrefix = match[2] ?? "";
  const replaceStartColumn = linePrefix.length - typedPrefix.length + 1;

  return {
    scope,
    typedPrefix,
    replaceStartColumn,
    replaceEndColumn: linePrefix.length + 1,
  };
}

export function getArkEnvGetCompletionContext(
  linePrefix: string,
): ArkEnvGetCompletionContext | null {
  const match = linePrefix.match(
    /ark\s*\.\s*(env|globals)\s*\.\s*(?:get|set|unset|persist|persistUnset)\s*\(\s*(?:(["'])([^"'()]*)|([A-Za-z0-9_$.-]*))$/,
  );

  if (!match) return null;

  const scope = match[1] as "env" | "globals";
  const quote = match[2];
  const typedPrefix = quote ? match[3] : match[4] ?? "";
  const replaceStartColumn = linePrefix.length - typedPrefix.length + 1;

  return {
    scope,
    typedPrefix,
    replaceStartColumn,
    replaceEndColumn: linePrefix.length + 1,
    wrapInQuotes: !quote,
  };
}
