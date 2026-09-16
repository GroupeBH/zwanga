import { useSupportData } from '../hooks/support/useSupportData';
import { useSupportTicketActions } from '../hooks/support/useSupportTicketActions';
import { useSupportContactActions } from '../hooks/support/useSupportContactActions';
import { SupportTicketModal } from '../features/support/SupportTicketModal';
import { SupportTicketCard } from '@/components/support/SupportTicketCard';
import {
  FAQ_HISTORY_KEY,
  FAVORITE_CONTACT_KEY,
  getFaqCategoryMeta,
  SEARCH_HISTORY_KEY,
  type SupportContactPreference,
} from '@/components/support/supportData';
import { styles } from '@/components/support/supportStyles';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from '@/utils/reanimated';

export default function SupportScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { setFavoriteContact, setRecentFaqs, setRecentSearches, expandedFaqId, setExpandedFaqId, supportConfig, setShowTicketModal, setTicketSubject, setTicketMessage, setTicketCategory, ticketSubject, ticketMessage, createSupportTicket, ticketCategory, refetchTickets, refetchSupportConfig, refetchFaq, canCreateTicket, searchQuery, setSearchQuery, isConfigFetching, isFaqFetching, isTicketsFetching, usesLocalFallback, quickActions, favoriteContact, isTicketsLoading, myTickets, recentFaqEntries, hasActiveSearch, recentSearches, filteredFaqEntries, groupedFaqEntries, showTicketModal, isCreatingTicket } = useSupportData();

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

  const { handleQuickAction } = useSupportContactActions({
    supportConfig,
    persistFavoriteContact,
    showDialog,
    setShowTicketModal,
  });

  const { handleRefresh, handleCloseTicketModal, handleSubmitTicket } = useSupportTicketActions({
    setTicketSubject,
    setTicketMessage,
    setTicketCategory,
    setShowTicketModal,
    ticketSubject,
    showDialog,
    ticketMessage,
    createSupportTicket,
    ticketCategory,
    persistFavoriteContact,
    refetchTickets,
    refetchSupportConfig,
    refetchFaq,
  });

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
        <SupportTicketModal
          showTicketModal={showTicketModal}
          handleCloseTicketModal={handleCloseTicketModal}
          ticketSubject={ticketSubject}
          setTicketSubject={setTicketSubject}
          ticketCategory={ticketCategory}
          setTicketCategory={setTicketCategory}
          ticketMessage={ticketMessage}
          setTicketMessage={setTicketMessage}
          isCreatingTicket={isCreatingTicket}
          handleSubmitTicket={handleSubmitTicket}
        />
      )}
    </SafeAreaView>
  );
}
