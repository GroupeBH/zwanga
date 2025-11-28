import { BorderRadius, Colors, FontSizes, FontWeights, Spacing, CommonStyles } from '@/constants/styles';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  title: string;
  icon: string;
  items: FAQItem[];
}

const FAVORITE_CONTACT_KEY = 'support_favorite_contact';
const FAQ_HISTORY_KEY = 'support_faq_history';
const SEARCH_HISTORY_KEY = 'support_search_history';

export default function SupportScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<string | null>(null);
  const [favoriteContact, setFavoriteContact] = useState<string>('call');
  const [recentFaqs, setRecentFaqs] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [favorite, faqHistory, searchHistory] = await Promise.all([
          AsyncStorage.getItem(FAVORITE_CONTACT_KEY),
          AsyncStorage.getItem(FAQ_HISTORY_KEY),
          AsyncStorage.getItem(SEARCH_HISTORY_KEY),
        ]);
        if (favorite) {
          setFavoriteContact(favorite);
        }
        if (faqHistory) {
          setRecentFaqs(JSON.parse(faqHistory));
        }
        if (searchHistory) {
          setRecentSearches(JSON.parse(searchHistory));
        }
      } catch (error) {
        console.warn('Impossible de charger les préférences d’aide:', error);
      }
    })();
  }, []);

  const persistFavoriteContact = async (key: string) => {
    try {
      setFavoriteContact(key);
      await AsyncStorage.setItem(FAVORITE_CONTACT_KEY, key);
    } catch (error) {
      console.warn('Impossible de sauvegarder le contact favori:', error);
    }
  };

  const persistFaqHistory = async (faqKey: string) => {
    try {
      setRecentFaqs((prev) => {
        const next = [faqKey, ...prev.filter((entry) => entry !== faqKey)].slice(0, 5);
        AsyncStorage.setItem(FAQ_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      console.warn('Impossible de sauvegarder l’historique FAQ:', error);
    }
  };

  const persistSearchHistory = async (query: string) => {
    if (!query.trim()) return;
    try {
      const normalized = query.trim();
      setRecentSearches((prev) => {
        const next = [normalized, ...prev.filter((entry) => entry !== normalized)].slice(0, 5);
        AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      console.warn('Impossible de sauvegarder l’historique de recherche:', error);
    }
  };

  const faqCategories: FAQCategory[] = [
    {
      title: 'Démarrage',
      icon: 'rocket',
      items: [
        {
          question: 'Comment créer un compte ?',
          answer: 'Téléchargez l\'application, entrez votre numéro de téléphone, et suivez les étapes de vérification SMS et KYC.',
        },
        {
          question: 'Qu\'est-ce que la vérification KYC ?',
          answer: 'La vérification KYC (Know Your Customer) est un processus de sécurité qui vérifie votre identité pour protéger tous les utilisateurs.',
        },
        {
          question: 'Dois-je être conducteur ou passager ?',
          answer: 'Vous pouvez choisir les deux rôles ! Vous pouvez proposer des trajets en tant que conducteur et en rechercher en tant que passager.',
        },
      ],
    },
    {
      title: 'Trajets',
      icon: 'car',
      items: [
        {
          question: 'Comment publier un trajet ?',
          answer: 'Appuyez sur le bouton "Publier un trajet", indiquez votre itinéraire, l\'heure de départ, le nombre de places et le prix. C\'est tout !',
        },
        {
          question: 'Comment rechercher un trajet ?',
          answer: 'Utilisez la barre de recherche sur l\'écran d\'accueil, entrez votre départ et votre destination, puis parcourez les résultats.',
        },
        {
          question: 'Puis-je annuler un trajet ?',
          answer: 'Oui, vous pouvez annuler un trajet depuis les détails du trajet. Les passagers affectés seront notifiés.',
        },
        {
          question: 'Comment fonctionne le suivi en temps réel ?',
          answer: 'Une fois le trajet démarré, vous pouvez suivre la position du véhicule en temps réel sur la carte interactive.',
        },
      ],
    },
    {
      title: 'Paiements',
      icon: 'card',
      items: [
        {
          question: 'Quels modes de paiement sont acceptés ?',
          answer: 'Nous acceptons Orange Money, M-Pesa, Airtel Money et le paiement en espèces.',
        },
        {
          question: 'Comment fonctionne l\'abonnement ?',
          answer: 'L\'abonnement vous donne accès à des fonctionnalités premium et des réductions. Vous pouvez choisir un abonnement mensuel ou annuel.',
        },
        {
          question: 'Puis-je obtenir un remboursement ?',
          answer: 'Les remboursements sont possibles en cas d\'annulation par le conducteur. Contactez le support pour plus d\'informations.',
        },
      ],
    },
    {
      title: 'Sécurité',
      icon: 'shield-checkmark',
      items: [
        {
          question: 'Comment ZWANGA assure ma sécurité ?',
          answer: 'Tous les utilisateurs sont vérifiés via KYC. Nous offrons également un système d\'évaluation et la possibilité de signaler tout comportement inapproprié.',
        },
        {
          question: 'Que faire en cas d\'urgence ?',
          answer: 'Utilisez le bouton d\'urgence dans l\'application pour contacter immédiatement les autorités et notre équipe de support.',
        },
        {
          question: 'Comment signaler un utilisateur ?',
          answer: 'Après un trajet, vous pouvez évaluer et signaler un utilisateur si nécessaire. Toutes les signalisations sont examinées.',
        },
      ],
    },
    {
      title: 'Compte & Profil',
      icon: 'person',
      items: [
        {
          question: 'Comment modifier mon profil ?',
          answer: 'Allez dans Profil > Modifier le profil pour changer vos informations personnelles, photo et véhicule.',
        },
        {
          question: 'Comment améliorer ma note ?',
          answer: 'Soyez ponctuel, courtois et respectueux. Maintenez votre véhicule propre et conduisez prudemment.',
        },
        {
          question: 'Puis-je supprimer mon compte ?',
          answer: 'Oui, allez dans Paramètres > Compte > Supprimer le compte. Cette action est irréversible.',
        },
      ],
    },
  ];

  const quickActions = [
    { icon: 'call', label: 'Appeler', key: 'call', color: '#2ECC71', action: () => Linking.openURL('tel:+243123456789') },
    { icon: 'mail', label: 'Email', key: 'mail', color: '#3498DB', action: () => Linking.openURL('mailto:support@zwanga.cd') },
    { icon: 'logo-whatsapp', label: 'WhatsApp', key: 'whatsapp', color: '#25D366', action: () => Linking.openURL('whatsapp://send?phone=243123456789'), badge: 'Nouveau' },
  ];

  const toggleExpand = (categoryIndex: number, itemIndex: number) => {
    const key = `${categoryIndex}-${itemIndex}`;
    setExpandedIndex(expandedIndex === key ? null : key);
    if (expandedIndex !== key) {
      persistFaqHistory(key);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Aide & Support</Text>
          <View style={styles.headerButton} />
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
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIONS RAPIDES</Text>
          <View style={styles.quickActionsRow}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={action.key}
                style={styles.quickActionCard}
                onPress={() => {
                  persistFavoriteContact(action.key);
                  action.action();
                }}
              >
                <View style={styles.quickActionIconWrapper}>
                  <View
                    style={[
                      styles.quickActionIcon,
                      { backgroundColor: `${action.color}20` },
                    ]}
                  >
                    <Ionicons name={action.icon as any} size={24} color={action.color} />
                  </View>
                  {action.badge && (
                    <View style={styles.quickActionBadge}>
                      <Text style={styles.quickActionBadgeText}>{action.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
                {favoriteContact === action.key && (
                  <View style={styles.favoritePill}>
                    <Text style={styles.favoritePillText}>Favori</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {recentFaqs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DERNIÈRES CONSULTATIONS</Text>
            {recentFaqs.map((faqKey) => {
              const [categoryIndex, itemIndex] = faqKey.split('-').map(Number);
              const item = faqCategories[categoryIndex]?.items[itemIndex];
              if (!item) return null;
              return (
                <TouchableOpacity
                  key={faqKey}
                  style={styles.historyItem}
                  onPress={() => toggleExpand(categoryIndex, itemIndex)}
                >
                  <Ionicons name="time" size={16} color={Colors.gray[500]} />
                  <Text style={styles.historyText}>{item.question}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {recentSearches.length > 0 && (
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
          <Text style={styles.sectionLabel}>QUESTIONS FRÉQUENTES</Text>
          {faqCategories.map((category, categoryIndex) => (
            <Animated.View
              key={category.title}
              entering={FadeInDown.delay(categoryIndex * 80)}
              style={styles.categoryContainer}
            >
              <View style={styles.categoryHeader}>
                <View style={styles.categoryIcon}>
                  <Ionicons name={category.icon as any} size={18} color={Colors.primary} />
                </View>
                <Text style={styles.categoryTitle}>{category.title}</Text>
              </View>
              <View style={styles.categoryCard}>
                {category.items.map((item, itemIndex) => {
                  const key = `${categoryIndex}-${itemIndex}`;
                  const isExpanded = expandedIndex === key;
                  return (
                    <View key={item.question}>
                      <TouchableOpacity
                        style={[
                          styles.faqRow,
                          (itemIndex !== category.items.length - 1 || isExpanded) && styles.faqRowDivider,
                        ]}
                        onPress={() => toggleExpand(categoryIndex, itemIndex)}
                      >
                        <Text style={styles.faqQuestion}>{item.question}</Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={Colors.gray[500]}
                        />
                      </TouchableOpacity>
                      {isExpanded && (
                        <Animated.View entering={FadeInDown} style={styles.faqAnswerWrapper}>
                          <Text style={styles.faqAnswer}>{item.answer}</Text>
                        </Animated.View>
                      )}
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HORAIRES DU SUPPORT</Text>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleHeader}>
              <Ionicons name="time" size={20} color={Colors.info} />
              <Text style={styles.scheduleTitle}>Disponibilités</Text>
            </View>
            <Text style={styles.scheduleRow}>Lundi - Vendredi : 8h00 - 20h00</Text>
            <Text style={styles.scheduleRow}>Samedi : 9h00 - 18h00</Text>
            <Text style={styles.scheduleRow}>Dimanche : 10h00 - 16h00</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.gray[900],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    alignItems: 'center',
    ...CommonStyles.shadowSm,
  },
  quickActionIconWrapper: {
    position: 'relative',
    marginBottom: Spacing.xs,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionBadge: {
    position: 'absolute',
    top: -Spacing.xs,
    right: -Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  quickActionBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  quickActionLabel: {
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  favoritePill: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  favoritePillText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  historyText: {
    color: Colors.gray[700],
    flexShrink: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chipText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  categoryContainer: {
    marginBottom: Spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  categoryTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  categoryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    ...CommonStyles.shadowSm,
    overflow: 'hidden',
  },
  faqRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  faqRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  faqQuestion: {
    flex: 1,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  faqAnswerWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  faqAnswer: {
    color: Colors.gray[600],
    lineHeight: 20,
  },
  scheduleCard: {
    backgroundColor: Colors.info + '10',
    borderColor: Colors.info + '30',
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  scheduleTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.info,
  },
  scheduleRow: {
    color: Colors.gray[700],
  },
});

