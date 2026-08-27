const PREFIX = "[Scholar Assistant]";

export const logger = {
  debug(message: string, data?: unknown): void {
    Zotero.debug(`${PREFIX} ${message}${data === undefined ? "" : ` ${safe(data)}`}`);
  },
  info(message: string): void {
    Zotero.debug(`${PREFIX} ${message}`);
  },
  error(message: string, error?: unknown): void {
    Zotero.logError(error instanceof Error ? error : new Error(`${PREFIX} ${message}: ${safe(error)}`));
  },
};

function safe(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
