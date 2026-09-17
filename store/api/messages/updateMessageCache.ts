import { messageApi } from '@/store/api/messageApi';
import { compareNewestMessages } from './pages';
import type { AppDispatch } from '@/store';
import type { Message } from '@/types';

type Change = { message: Message; editOnly?: boolean } | { deletedId: string };

export function updateMessageCache(dispatch: AppDispatch, conversationId: string, change: Change) {
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
      const messages = draft.pages[0].data;
      // Only insert the changed message; do not sort all the loaded history on every event.
      const index = messages.findIndex(message => compareNewestMessages(change.message, message) < 0);
      messages.splice(index < 0 ? messages.length : index, 0, change.message);
    }
  }));
}
