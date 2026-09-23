import { messageApi } from '@/store/api/messageApi';
import { compareNewestMessages, MAX_MESSAGE_ROWS_PER_PAGE } from './pages';
import type { AppDispatch } from '@/store';
import type { Message } from '@/types';

type Change = { message: Message; editOnly?: boolean } | { deletedId: string };

export function updateMessageCache(dispatch: AppDispatch, conversationId: string, change: Change) {
  let refreshHead = false;
  const id = 'message' in change ? change.message.id : change.deletedId;
  dispatch(messageApi.util.updateQueryData('getConversationMessages', { conversationId }, draft => {
    const index = draft.findIndex(message => message.id === id);
    if ('deletedId' in change) { if (index >= 0) draft.splice(index, 1); }
    else if (index >= 0) draft[index] = change.message;
    else if (!change.editOnly) draft.push(change.message);
  }));
  dispatch(messageApi.util.updateQueryData('getConversationMessagePages', { conversationId }, draft => {
    let found = false;
    for (const page of draft.pages) {
      const index = page.data.findIndex(message => message.id === id);
      if (index < 0) continue;
      found = true;
      if ('deletedId' in change) page.data.splice(index, 1);
      else page.data[index] = change.message;
    }
    if (!found && 'message' in change && !change.editOnly && draft.pages[0]) {
      const first = draft.pages[0];
      // Do not insert today's message into an older, noncontiguous window.
      if (first.previousCursor || first.needsHeadReload) return;
      const messages = first.data;
      if (first.newestCursor !== undefined && messages.length >= MAX_MESSAGE_ROWS_PER_PAGE) {
        // Nothing is deleted remotely. The native list offers the newer server page.
        // The opaque boundary retains PostgreSQL microseconds (never reconstruct it from JS Date).
        first.previousCursor = first.newestCursor;
        // An initially empty conversation has no opaque cursor yet. It still
        // needs a bounded head and an explicit retry if automatic refresh fails.
        first.needsHeadReload = true;
        // This was the latest window: refresh it automatically, so live chat does not
        // require a tap after 100 messages. Keep a recovery cursor if that read fails.
        draft.pages = [first];
        draft.pageParams = [null];
        refreshHead = true;
        return;
      }
      // Only insert the changed message; do not sort all the loaded history on every event.
      const index = messages.findIndex(message => compareNewestMessages(change.message, message) < 0);
      messages.splice(index < 0 ? messages.length : index, 0, change.message);
    }
  }));
  if (refreshHead) {
    void dispatch(messageApi.endpoints.getConversationMessagePages.initiate(
      { conversationId }, { subscribe: false, forceRefetch: true },
    ));
  }
}
