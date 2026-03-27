import { SupportTicketCard } from '@/components/support/SupportTicketCard';
import {
  buildApiErrorMessage,
  buildQuickActions,
  DEFAULT_SUPPORT_CONFIG,
  DEFAULT_SUPPORT_EMAIL,
  FAQ_LIMIT,
  FAQ_HISTORY_KEY,
  FAVORITE_CONTACT_KEY,
  getFaqCategoryMeta,
  LOCAL_FAQ_ENTRIES,
  normalizeFaqCategory,
  normalizeText,
  SEARCH_HISTORY_KEY,
  type SupportContactPreference,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
} from '@/components/support/supportData';
import { styles } from '@/components/support/supportStyles';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import {
  useCreateSupportTicketMutation,
  useGetMySupportTicketsQuery,
  useGetSupportConfigQuery,
  useGetSupportFaqQuery,
} from '@/store/api/supportApi';
import type { SupportFaqEntry, SupportTicketCategory } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function SupportScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
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

  const persistFavoriteContact = async (key: SupportContactPreference) => {
    try {
      setFavoriteContact(key);
      await AsyncStorage.setItem(FAVORITE_CONTACT_KEY, key);
    } catch (error) {
      console.warn('Impossible de sauvegarder le canal favori:', error);
    }
  };

  const persistFaqHistory = async (faqId: string) => {
    try {
      setRecentFaqs((prev) => {
        const next = [faqId, ...prev.filter((entry) => entry !== faqId)].slice(0, 5);
        AsyncStorage.setItem(FAQ_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      console.warn("Impossible de sauvegarder l'historique FAQ :", error);
    }
  };

  const persistSearchHistory = async (query: string) => {
    if (!query.trim()) {
      return;
    }

    try {
      const normalized = query.trim();
      setRecentSearches((prev) => {
        const next = [normalized, ...prev.filter((entry) => entry !== normalized)].slice(0, 5);
        AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      console.warn("Impossible de sauvegarder l'historique de recherche :", error);
    }
  };

  const toggleExpand = (faqId: string) => {
    const nextId = expandedFaqId === faqId ? null : faqId;
    setExpandedFaqId(nextId);

    if (nextId) {
      persistFaqHistory(faqId);
    }
  };

  const handleOpenEmail = async () => {
    const email = supportConfig.contact.email || DEFAULT_SUPPORT_EMAIL;
    const url = `mailto:${email}?subject=${encodeURIComponent('Support ZWANGA')}`;
    await persistFavoriteContact('email');

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'Email indisponible',
          message: "Aucune application email n'est configurée sur cet appareil.",
        });
        return;
      }

      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'ouvrir l'email",
        message: "Réessayez plus tard ou créez plutôt un ticket dans l'application.",
      });
    }
  };

  const handleOpenPhone = async () => {
    const phone = supportConfig.contact.phone?.trim();
    if (!phone) {
      showDialog({
        variant: 'warning',
        title: 'Numéro indisponible',
        message: "Le numéro du support n'est pas encore disponible pour le moment.",
      });
      return;
    }

    await persistFavoriteContact('phone');

    try {
      const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'Appel indisponible',
          message: 'Votre appareil ne permet pas de lancer un appel pour le moment.',
        });
        return;
      }

      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'appeler",
        message: 'Réessayez plus tard ou utilisez plutôt le ticket ou WhatsApp.',
      });
    }
  };

  const handleOpenWhatsApp = async () => {
    const whatsapp = supportConfig.contact.whatsapp?.trim();
    const normalizedNumber = whatsapp?.replace(/\D/g, '');

    if (!normalizedNumber) {
      showDialog({
        variant: 'warning',
        title: 'WhatsApp indisponible',
        message: "Le contact WhatsApp du support n'est pas encore disponible.",
      });
      return;
    }

    await persistFavoriteContact('whatsapp');

    try {
      const text = encodeURIComponent("Bonjour, j'ai besoin d'aide sur ZWANGA.");
      const url = `https://wa.me/${normalizedNumber}?text=${text}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'WhatsApp indisponible',
          message: "WhatsApp n'est pas installé ou ne peut pas être ouvert sur cet appareil.",
        });
        return;
      }

      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'ouvrir WhatsApp",
        message: "Réessayez plus tard ou utilisez plutôt le ticket ou l'email.",
      });
    }
  };

  const handleQuickAction = async (actionKey: SupportContactPreference) => {
    if (actionKey === 'ticket') {
      await persistFavoriteContact('ticket');
      setShowTicketModal(true);
      return;
    }

    if (actionKey === 'phone') {
      await handleOpenPhone();
      return;
    }

    if (actionKey === 'whatsapp') {
      await handleOpenWhatsApp();
      return;
    }

    await handleOpenEmail();
  };

  const resetTicketForm = () => {
    setTicketSubject('');
    setTicketMessage('');
    setTicketCategory('general');
  };

  const handleCloseTicketModal = () => {
    setShowTicketModal(false);
    resetTicketForm();
  };

  const handleSubmitTicket = async () => {
    if (!ticketSubject.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Sujet requis',
        message: 'Ajoutez un sujet simple pour aider le support à comprendre votre besoin.',
      });
      return;
    }

    if (!ticketMessage.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Message requis',
        message: 'Expliquez en quelques phrases ce qui vous bloque.',
      });
      return;
    }

    try {
      await createSupportTicket({
        subject: ticketSubject.trim(),
        message: ticketMessage.trim(),
        category: ticketCategory,
        priority: 'medium',
      }).unwrap();

      await persistFavoriteContact('ticket');
      handleCloseTicketModal();
      refetchTickets();

      showDialog({
        variant: 'success',
        title: 'Ticket envoyé',
        message: 'Votre demande a bien été envoyée. Vous retrouverez son statut dans cette page.',
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Envoi impossible',
        message: buildApiErrorMessage(
          error,
          "Le ticket n'a pas pu être créé. Réessayez dans quelques instants.",
        ),
      });
    }
  };

  const handleRefresh = async () => {
    await Promise.allSettled([refetchSupportConfig(), refetchFaq(), refetchTickets()]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Aide & Support</Text>
          {canCreateTicket ? (
            <TouchableOpacity style={styles.headerButton} onPress={() => setShowTicketModal(true)}>
              <Ionicons name="add" size={20} color={Colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="help-buoy" size={22} color={Colors.primary} />
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>{supportConfig.title}</Text>
            <Text style={styles.heroSubtitle}>{supportConfig.subtitle}</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.gray[500]} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher dans l'aide"
            placeholderTextColor={Colors.gray[400]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => persistSearchHistory(searchQuery)}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={Boolean(isConfigFetching || isFaqFetching || isTicketsFetching)}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {(usesLocalFallback || isFaqFetching) && (
          <View style={styles.section}>
            <View
              style={[
                styles.infoBanner,
                usesLocalFallback ? styles.infoBannerWarning : styles.infoBannerInfo,
              ]}
            >
              <Ionicons
                name={usesLocalFallback ? 'cloud-offline' : 'sync'}
                size={18}
                color={usesLocalFallback ? Colors.warningDark : Colors.infoDark}
              />
              <Text
                style={[
                  styles.infoBannerText,
                  { color: usesLocalFallback ? Colors.warningDark : Colors.infoDark },
                ]}
              >
                {usesLocalFallback
                  ? "Le centre d'aide en ligne est indisponible. Les réponses locales restent accessibles."
                  : "Le centre d'aide se met à jour."}
              </Text>
            </View>
          </View>
        )}

        {quickActions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACTIONS RAPIDES</Text>
            <View style={styles.quickActionsColumn}>
              {quickActions.map((action, index) => (
                <Animated.View key={action.key} entering={FadeInDown.delay(index * 80)}>
                  <TouchableOpacity
                    style={styles.quickActionCard}
                    onPress={() => handleQuickAction(action.key)}
                  >
                    <View
                      style={[
                        styles.quickActionIcon,
                        { backgroundColor: `${action.color}15` },
                      ]}
                    >
                      <Ionicons name={action.icon} size={22} color={action.color} />
                    </View>
                    <View style={styles.quickActionContent}>
                      <View style={styles.quickActionHeader}>
                        <Text style={styles.quickActionLabel}>{action.label}</Text>
                        {favoriteContact === action.key && (
                          <View style={styles.favoritePill}>
                            <Text style={styles.favoritePillText}>Favori</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.quickActionDescription}>{action.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>
        )}

        {canCreateTicket && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>MES DEMANDES</Text>
              <TouchableOpacity onPress={() => setShowTicketModal(true)}>
                <Text style={styles.sectionLink}>Nouveau ticket</Text>
              </TouchableOpacity>
            </View>

            {isTicketsLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.stateCardText}>Chargement de vos demandes...</Text>
              </View>
            ) : myTickets.length > 0 ? (
              <View style={styles.ticketList}>
                {myTickets.map((ticket, index) => (
                  <Animated.View key={ticket.id} entering={FadeInDown.delay(index * 90)}>
                    <SupportTicketCard ticket={ticket} />
                  </Animated.View>
                ))}
              </View>
            ) : (
              <View style={styles.stateCard}>
                <Ionicons name="chatbubble-ellipses-outline" size={24} color={Colors.gray[500]} />
                <Text style={styles.stateCardTitle}>Aucune demande en cours</Text>
                <Text style={styles.stateCardText}>
                  Si vous avez un souci de trajet, de paiement ou de compte, vous pouvez créer un ticket ici.
                </Text>
              </View>
            )}
          </View>
        )}

        {recentFaqEntries.length > 0 && !hasActiveSearch && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DERNIÈRES CONSULTATIONS</Text>
            <View style={styles.historyCard}>
              {recentFaqEntries.map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.historyItem}
                  onPress={() => toggleExpand(entry.id)}
                >
                  <Ionicons name="time" size={16} color={Colors.gray[500]} />
                  <Text style={styles.historyText}>{entry.question}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {recentSearches.length > 0 && !hasActiveSearch && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RECHERCHES RÉCENTES</Text>
            <View style={styles.chipRow}>
              {recentSearches.map((entry) => (
                <TouchableOpacity
                  key={entry}
                  style={styles.chip}
                  onPress={() => setSearchQuery(entry)}
                >
                  <Text style={styles.chipText}>{entry}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              {hasActiveSearch ? 'RÉSULTATS' : 'QUESTIONS FRÉQUENTES'}
            </Text>
            <Text style={styles.sectionCount}>
              {filteredFaqEntries.length} réponse{filteredFaqEntries.length > 1 ? 's' : ''}
            </Text>
          </View>

          {filteredFaqEntries.length === 0 ? (
            <View style={styles.emptySearchCard}>
              <Ionicons name="search-outline" size={28} color={Colors.gray[500]} />
              <Text style={styles.emptySearchTitle}>Aucun résultat</Text>
              <Text style={styles.emptySearchText}>
                Essayez des mots simples comme trajet, paiement, compte ou sécurité.
              </Text>
            </View>
          ) : (
            Object.entries(groupedFaqEntries).map(([categoryKey, entries], categoryIndex) => {
              const categoryMeta = getFaqCategoryMeta(categoryKey);

              return (
                <Animated.View
                  key={categoryKey}
                  entering={FadeInDown.delay(categoryIndex * 90)}
                  style={styles.categoryContainer}
                >
                  <View style={styles.categoryHeader}>
                    <View style={styles.categoryIcon}>
                      <Ionicons name={categoryMeta.icon} size={18} color={Colors.primary} />
                    </View>
                    <Text style={styles.categoryTitle}>{categoryMeta.title}</Text>
                  </View>

                  <View style={styles.categoryCard}>
                    {entries.map((entry, entryIndex) => {
                      const isExpanded = expandedFaqId === entry.id;

                      return (
                        <View key={entry.id}>
                          <TouchableOpacity
                            style={[
                              styles.faqRow,
                              (entryIndex !== entries.length - 1 || isExpanded) &&
                                styles.faqRowDivider,
                            ]}
                            onPress={() => toggleExpand(entry.id)}
                          >
                            <Text style={styles.faqQuestion}>{entry.question}</Text>
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={Colors.gray[500]}
                            />
                          </TouchableOpacity>

                          {isExpanded && (
                            <Animated.View entering={FadeInDown} style={styles.faqAnswerWrapper}>
                              <Text style={styles.faqAnswer}>{entry.answer}</Text>
                            </Animated.View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>

        {supportConfig.hours.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>HORAIRES DU SUPPORT</Text>
            <View style={styles.scheduleCard}>
              <View style={styles.scheduleHeader}>
                <Ionicons name="time" size={20} color={Colors.info} />
                <Text style={styles.scheduleTitle}>Disponibilités</Text>
              </View>
              {supportConfig.hours.map((entry) => (
                <Text key={`${entry.label}-${entry.value}`} style={styles.scheduleRow}>
                  {entry.label} : {entry.value}
                </Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {canCreateTicket && (
        <Modal
          visible={showTicketModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleCloseTicketModal}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCloseTicketModal}>
                <Ionicons name="close" size={24} color={Colors.gray[900]} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Créer un ticket</Text>
              <View style={styles.modalSpacer} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Expliquez simplement votre besoin</Text>
                <Text style={styles.formSubtitle}>
                  Quelques mots suffisent. Nous utiliserons votre message pour vous répondre plus vite.
                </Text>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Sujet</Text>
                  <TextInput
                    style={styles.textInput}
                    value={ticketSubject}
                    onChangeText={setTicketSubject}
                    placeholder="Ex : mon paiement n'apparaît pas"
                    placeholderTextColor={Colors.gray[400]}
                  />
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Type de problème</Text>
                  <View style={styles.typeGrid}>
                    {TICKET_CATEGORIES.map((category) => {
                      const isSelected = ticketCategory === category;

                      return (
                        <TouchableOpacity
                          key={category}
                          style={[styles.typeChip, isSelected && styles.typeChipActive]}
                          onPress={() => setTicketCategory(category)}
                        >
                          <Text
                            style={[
                              styles.typeChipText,
                              isSelected && styles.typeChipTextActive,
                            ]}
                          >
                            {TICKET_CATEGORY_LABELS[category]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Votre message</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    value={ticketMessage}
                    onChangeText={setTicketMessage}
                    placeholder="Décrivez ce qui se passe, quand cela arrive et ce que vous avez déjà essayé."
                    placeholderTextColor={Colors.gray[400]}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (isCreatingTicket || !ticketSubject.trim() || !ticketMessage.trim()) &&
                      styles.submitButtonDisabled,
                  ]}
                  disabled={isCreatingTicket || !ticketSubject.trim() || !ticketMessage.trim()}
                  onPress={handleSubmitTicket}
                >
                  {isCreatingTicket ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>Envoyer ma demande</Text>
                      <Ionicons name="send" size={18} color={Colors.white} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}
