import type { Message } from '@/types';
import type { BaseEndpointBuilder } from '../types';

export type MessagePage = { data: Message[]; nextCursor: string | null };
export const compareNewestMessages = (a: Message, b: Message) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);

export function buildMessagePages(builder: BaseEndpointBuilder) {
  return {
    getConversationMessagePages: builder.infiniteQuery<MessagePage, { conversationId: string }, string | null>({
      keepUnusedDataFor: 30,
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: page => page.nextCursor ?? undefined,
      },
      async queryFn({ queryArg: { conversationId }, pageParam }, _api, _options, baseQuery) {
        const result = await baseQuery({ url: `/conversations/${conversationId}/messages/page`,
          params: { limit: 50, ...(pageParam ? { before: pageParam } : {}) } });
        if (result.error?.status === 404 && !pageParam) {
          // Rolling deployment: old servers still return the full history. Never hide messages.
          const legacy = await baseQuery(`/conversations/${conversationId}/messages`);
          if (legacy.error) return { error: legacy.error };
          return { data: { data: [...legacy.data as Message[]].sort(compareNewestMessages), nextCursor: null } };
        }
        if (result.error) return { error: result.error };
        return { data: result.data as MessagePage };
      },
      providesTags: (_data, _error, { conversationId }) => [{ type: 'Message', id: conversationId }],
    }),
  };
}
