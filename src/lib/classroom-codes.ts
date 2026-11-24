/** Join codes avoid look-alike characters (0/O, 1/I/L) so they can be read aloud. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function joinCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function shareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
