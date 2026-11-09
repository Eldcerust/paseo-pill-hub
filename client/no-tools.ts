/** What the empty Tools popover can see, as plain facts. */
export interface NoToolsFacts {
  /** Labels of the tool plugins that have ever reported in to the hub in this app. */
  announced: readonly string[];
  /** Tool registrations listening on the bus right now. Each live tool, for each chat, is one. */
  registrations: number;
  /** Whether this hub is the one tools attach to. */
  onBus: boolean;
  /** Chats that do have tools attached in this hub. */
  otherChats: number;
}

/**
 * What to tell someone whose Tools popover is empty. A plugin that reported in once stays on the
 * list for the life of the app, so the list alone cannot say whether it is still running. The other
 * facts separate the ways this happens, and each gets its own explanation and next step.
 */
export function describeNoTools(facts: NoToolsFacts): { summary: string; hint: string; details: string } {
  const { announced, registrations, onBus, otherChats } = facts;
  const details = `Tool registrations alive: ${registrations}. This hub is the one tools attach to: ${onBus ? "yes" : "no"}. Chats with tools attached: ${otherChats}.`;
  if (announced.length === 0) {
    return {
      summary: "No tool plugin has reported in to the hub yet.",
      hint: "They load once the app has connected to the daemon. If this stays, reload the app.",
      details,
    };
  }
  const names = announced.length <= 6 ? announced.join(", ") : `${announced.slice(0, 6).join(", ")} and ${announced.length - 6} more`;
  if (!onBus) {
    return {
      summary: `Reported in: ${names}. They attached to another copy of the hub, not this one.`,
      hint: "Reload the app so only one hub is running.",
      details,
    };
  }
  if (registrations === 0) {
    return {
      summary: `Reported in: ${names}. None of them is running in this app any more.`,
      hint: "Their app code was unloaded, which happens when the app reconnects or a plugin updates. Reload the app to load them again.",
      details,
    };
  }
  if (otherChats > 0) {
    return {
      summary: `Reported in: ${names}. They are attached to ${otherChats} other ${otherChats === 1 ? "chat" : "chats"}, but not this one.`,
      hint: "Reconnect asks them again. If this chat stays empty, it is missing from their list of chats.",
      details,
    };
  }
  return {
    summary: `Reported in: ${names}. None has attached to any chat.`,
    hint: "The hub asks them to reconnect when this opens. Reconnect asks again.",
    details,
  };
}
