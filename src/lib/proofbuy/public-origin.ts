export function canonicalProductUrl(
  internalUrl: URL,
  appBaseUrl: string,
): URL {
  const publicOrigin = new URL(appBaseUrl);
  if (publicOrigin.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS in live mode");
  }
  return new URL(`${internalUrl.pathname}${internalUrl.search}`, publicOrigin.origin);
}
