/**
 * URL transform for ReactMarkdown that mirrors react-markdown's default
 * scheme allowlist plus the `card:` scheme used by CardLink.
 *
 * Returns the URL unchanged for safe schemes; returns "" for anything else
 * (so dangerous schemes like javascript:, data:, vbscript:, file: are stripped).
 */
const SAFE_SCHEME_RE = /^(?:card:|https?:\/\/|mailto:)/i;

export function safeUrlTransform(url: string): string {
  if (SAFE_SCHEME_RE.test(url)) return url;
  // Allow protocol-relative and root-relative refs (no scheme).
  if (url.startsWith("/") || url.startsWith("#")) return url;
  return "";
}
