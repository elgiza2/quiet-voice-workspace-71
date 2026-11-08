/** Replace only the internal provider quota notice; never conceal a failed operation. */
export function voiceErrorMessage(message: unknown): string {
  if (typeof message !== "string" || !message.trim()) return "Voice service unavailable";
  if (message.trim() === "Cartesia credit or request limit reached. Check your Cartesia account.") {
    const ar = typeof navigator !== "undefined" && (() => { try { return (localStorage.getItem("ceyo_language") || navigator.language).startsWith("ar"); } catch { return navigator.language.startsWith("ar"); } })();
    return ar ? "الصوت غير متاح حاليًا. جرّب لاحقًا." : "Voice is unavailable right now. Please try later.";
  }
  return message;
}