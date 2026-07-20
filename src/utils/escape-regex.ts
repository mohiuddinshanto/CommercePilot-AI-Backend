/**
 * Escapes special regex characters in a string.
 * Use this before passing user input to MongoDB $regex.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
