export type InboxSection = 'activity' | 'support' | 'messages';

export function resolveInboxSection(value: string | string[] | undefined): InboxSection {
  const section = Array.isArray(value) ? value[0] : value;
  return section === 'support' || section === 'messages' ? section : 'activity';
}

// These sources can overlap (a chat also produces a notification).
// The bell is an attention indicator, not their summed total.
export function inboxAttentionCount(notifications: number, messages: number): number {
  const safe = (count: number) => Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Math.max(safe(notifications), safe(messages));
}
