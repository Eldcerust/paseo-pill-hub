/**
 * What to tell someone whose Tools popover is empty. Which plugins have reported in to the hub is
 * the one thing the popover can see, and it separates the two ways this happens: no plugin ever
 * reported in (they have not loaded, or cannot reach the hub), or some did but none attached to
 * this chat.
 */
export function describeNoTools(announced: readonly string[]): { summary: string; hint: string } {
  if (announced.length === 0) {
    return {
      summary: "No tool plugin has reported in to the hub yet.",
      hint: "They load once the app has connected to the daemon. If this stays, reload the app.",
    };
  }
  const names = announced.length <= 6 ? announced.join(", ") : `${announced.slice(0, 6).join(", ")} and ${announced.length - 6} more`;
  return {
    summary: `Reported in: ${names}. None has attached to this chat.`,
    hint: "The hub asks them to reconnect when this opens. Reconnect asks again.",
  };
}
