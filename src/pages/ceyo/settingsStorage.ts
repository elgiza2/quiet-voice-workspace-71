/** Device preferences are optional; denied storage must not crash settings. */
export function readSetting(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function saveSetting(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}