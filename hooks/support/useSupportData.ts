import {
  buildQuickActions,
  DEFAULT_SUPPORT_CONFIG,
  FAQ_LIMIT,
  FAQ_HISTORY_KEY,
  FAVORITE_CONTACT_KEY,
  LOCAL_FAQ_ENTRIES,
  normalizeFaqCategory,
  normalizeText,
  SEARCH_HISTORY_KEY,
  type SupportContactPreference,
} from '@/components/support/supportData';
import {
  useCreateSupportTicketMutation,
  useGetMySupportTicketsQuery,
  useGetSupportConfigQuery,
  useGetSupportFaqQuery,
} from '@/store/api/supportApi';
import type { SupportFaqEntry, SupportTicketCategory } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';



export function useSupportData() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [favoriteContact, setFavoriteContact] = useState<SupportContactPreference>('ticket');
  const [recentFaqs, setRecentFaqs] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketCategory, setTicketCategory] = useState<SupportTicketCategory>('general');

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const {
    data: supportConfigResponse,
    isFetching: isConfigFetching,
    refetch: refetchSupportConfig,
  } = useGetSupportConfigQuery();

  const supportConfig = supportConfigResponse ?? DEFAULT_SUPPORT_CONFIG;
  const quickActions = useMemo(() => buildQuickActions(supportConfig), [supportConfig]);
  const canCreateTicket = supportConfig.channels.ticket;

  const {
    data: faqResponse,
    isFetching: isFaqFetching,
    isError: isFaqError,
    refetch: refetchFaq,
  } = useGetSupportFaqQuery({
    limit: FAQ_LIMIT,
    locale: supportConfig.faq?.locale ?? supportConfig.locale,
    audience: supportConfig.faq?.audience,
  });

  const {
    data: ticketsResponse,
    isLoading: isTicketsLoading,
    isFetching: isTicketsFetching,
    refetch: refetchTickets,
  } = useGetMySupportTicketsQuery({ limit: 5 });

  const [createSupportTicket, { isLoading: isCreatingTicket }] = useCreateSupportTicketMutation();

  useEffect(() => {
    (async () => {
      try {
        const [favorite, faqHistory, searchHistory] = await Promise.all([
          AsyncStorage.getItem(FAVORITE_CONTACT_KEY),
          AsyncStorage.getItem(FAQ_HISTORY_KEY),
          AsyncStorage.getItem(SEARCH_HISTORY_KEY),
        ]);

        if (
          favorite === 'ticket' ||
          favorite === 'email' ||
          favorite === 'phone' ||
          favorite === 'whatsapp'
        ) {
          setFavoriteContact(favorite);
        }

        if (faqHistory) {
          setRecentFaqs(JSON.parse(faqHistory));
        }

        if (searchHistory) {
          setRecentSearches(JSON.parse(searchHistory));
        }
      } catch (error) {
        console.warn("Impossible de charger les préférences d'aide :", error);
      }
    })();
  }, []);

  const faqEntries = useMemo(
    () => (faqResponse?.data?.length ? faqResponse.data : LOCAL_FAQ_ENTRIES),
    [faqResponse?.data],
  );

  const faqEntriesById = useMemo(
    () => new Map(faqEntries.map((entry) => [entry.id, entry])),
    [faqEntries],
  );

  const filteredFaqEntries = useMemo(() => {
    const needle = normalizeText(deferredSearchQuery);
    if (!needle) {
      return faqEntries;
    }

    return faqEntries.filter((entry) =>
      [entry.question, entry.answer, entry.category, entry.keywords].some((value) =>
        normalizeText(value).includes(needle),
      ),
    );
  }, [deferredSearchQuery, faqEntries]);

  const groupedFaqEntries = useMemo(() => {
    return filteredFaqEntries.reduce<Record<string, SupportFaqEntry[]>>((acc, entry) => {
      const key = normalizeFaqCategory(entry.category);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(entry);
      return acc;
    }, {});
  }, [filteredFaqEntries]);

  const recentFaqEntries = useMemo(
    () =>
      recentFaqs
        .map((faqId) => faqEntriesById.get(faqId))
        .filter((entry): entry is SupportFaqEntry => Boolean(entry)),
    [faqEntriesById, recentFaqs],
  );

  const myTickets = ticketsResponse?.data ?? [];
  const hasActiveSearch = Boolean(searchQuery.trim());
  const usesLocalFallback = isFaqError || !faqResponse?.data?.length;

  return {
    setFavoriteContact,
    setRecentFaqs,
    setRecentSearches,
    expandedFaqId,
    setExpandedFaqId,
    supportConfig,
    setShowTicketModal,
    setTicketSubject,
    setTicketMessage,
    setTicketCategory,
    ticketSubject,
    ticketMessage,
    createSupportTicket,
    ticketCategory,
    refetchTickets,
    refetchSupportConfig,
    refetchFaq,
    canCreateTicket,
    searchQuery,
    setSearchQuery,
    isConfigFetching,
    isFaqFetching,
    isTicketsFetching,
    usesLocalFallback,
    quickActions,
    favoriteContact,
    isTicketsLoading,
    myTickets,
    recentFaqEntries,
    hasActiveSearch,
    recentSearches,
    filteredFaqEntries,
    groupedFaqEntries,
    showTicketModal,
    isCreatingTicket,
  };
}
