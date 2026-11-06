/** Guards destructive scripts so they only ever run against local databases. */
export function assertLocalDatabase(url: string) {
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "db", "postgres"].includes(host) || host.endsWith(".localhost");
  if (!local) {
    throw new Error(`Refusing to run a destructive operation against non-local database host "${host}"`);
  }
}
