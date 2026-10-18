import type { Message } from '@/types';
import type { BaseEndpointBuilder } from '../types';

export type MessagePage = { data: Message[]; nextCursor: string | null; previousCursor?: string | null;
  newestCursor?: string | null; needsHeadReload?: boolean };
export const MAX_MESSAGE_PAGES = 6;
export const MAX_MESSAGE_ROWS_PER_PAGE = 100;
export const compareNewestMessages = (a: Message, b: Message) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);

export function buildMessagePages(builder: BaseEndpointBuilder) {
  return {
    getConversationMessagePages: builder.infiniteQuery<MessagePage, { conversationId: string }, string | null>({
      keepUnusedDataFor: 30,
      infiniteQueryOptions: {
        initialPageParam: null,
        maxPages: MAX_MESSAGE_PAGES,
        // Refresh the current window anchor, not every historical page after a network flap.
        refetchCachedPages: false,
        getNextPageParam: page => page.nextCursor ?? undefined,
        getPreviousPageParam: page => page.previousCursor ? `after:${page.previousCursor}` : undefined,
      },
      async queryFn({ queryArg: { conversationId }, pageParam }, _api, _options, baseQuery) {
        const readLegacyHistory = async () => {
          const legacy = await baseQuery(`/conversations/${conversationId}/messages`);
          if (legacy.error) return { error: legacy.error };
          return { data: { data: [...legacy.data as Message[]].sort(compareNewestMessages), nextCursor: null } };
        };
        const result = await baseQuery({ url: `/conversations/${conversationId}/messages/page`,
          params: { limit: 50, ...(pageParam ? pageParam.startsWith('after:')
            ? { after: pageParam.slice(6) } : { before: pageParam } : {}) } });
        if (result.error?.status === 404 && !pageParam) {
          // Rolling deployment: old servers still return the full history. Never hide messages.
          return readLegacyHistory();
        }
        if (result.error) return { error: result.error };
        const page = result.data as MessagePage;
        // The earlier paginated API cannot navigate towards newer pages. Do not
        // evict messages that would become unreachable until that server is upgraded.
        if (page.previousCursor === undefined || page.newestCursor === undefined) return readLegacyHistory();
        return { data: page };
      },
      providesTags: (_data, _error, { conversationId }) => [{ type: 'Message', id: conversationId }],
    }),
  };
}
