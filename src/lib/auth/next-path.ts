/** Only same-site paths may be used as a post-login destination. */
export function safeNextPath(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) {
    return "/";
  }
  return next;
}
