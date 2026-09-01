/**
 * Escapes user input so it's matched as a literal substring, never interpreted as regex --
 * avoids both incorrect matches and a ReDoS surface on large abstract/title text fields.
 *
 * Ported verbatim from backend/src/routes/records.js (Phase 1 kept that file specifically so this
 * logic wasn't rewritten from memory) -- backend/ is deleted once this port lands.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
