export interface ArkEnvGetCompletionContext {
  typedPrefix: string;
  replaceStartColumn: number;
  replaceEndColumn: number;
  wrapInQuotes: boolean;
}

export interface ArkEnvMemberCompletionContext {
  typedPrefix: string;
  replaceStartColumn: number;
  replaceEndColumn: number;
}

export function getArkEnvMemberCompletionContext(
  linePrefix: string,
): ArkEnvMemberCompletionContext | null {
  const match = linePrefix.match(/ark\s*\.\s*env\s*\.\s*([A-Za-z_$][\w$]*)?$/);

  if (!match) return null;

  const typedPrefix = match[1] ?? "";
  const replaceStartColumn = linePrefix.length - typedPrefix.length + 1;

  return {
    typedPrefix,
    replaceStartColumn,
    replaceEndColumn: linePrefix.length + 1,
  };
}

export function getArkEnvGetCompletionContext(
  linePrefix: string,
): ArkEnvGetCompletionContext | null {
  const match = linePrefix.match(
    /ark\s*\.\s*env\s*\.\s*get\s*\(\s*(?:(["'])([^"'()]*)|([A-Za-z0-9_$.-]*))$/,
  );

  if (!match) return null;

  const quote = match[1];
  const typedPrefix = quote ? match[2] : match[3] ?? "";
  const replaceStartColumn = linePrefix.length - typedPrefix.length + 1;

  return {
    typedPrefix,
    replaceStartColumn,
    replaceEndColumn: linePrefix.length + 1,
    wrapInQuotes: !quote,
  };
}
