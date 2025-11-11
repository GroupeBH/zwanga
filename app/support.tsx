import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Linking } from 'react-native';
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

export default function SupportScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<string | null>(null);

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
    { icon: 'call', label: 'Appeler', color: '#2ECC71', action: () => Linking.openURL('tel:+243123456789') },
    { icon: 'mail', label: 'Email', color: '#3498DB', action: () => Linking.openURL('mailto:support@zwanga.cd') },
    { icon: 'logo-whatsapp', label: 'WhatsApp', color: '#25D366', action: () => Linking.openURL('whatsapp://send?phone=243123456789'), badge: 'Nouveau' },
  ];

  const toggleExpand = (categoryIndex: number, itemIndex: number) => {
    const key = `${categoryIndex}-${itemIndex}`;
    setExpandedIndex(expandedIndex === key ? null : key);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-gray-200">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Ionicons name="arrow-back" size={24} color="#212529" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-800">Aide & Support</Text>
        </View>

        {/* Barre de recherche */}
        <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3">
          <Ionicons name="search" size={20} color="#6C757D" />
          <TextInput
            className="flex-1 ml-3"
            placeholder="Rechercher dans l'aide"
            placeholderTextColor="#ADB5BD"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Actions rapides */}
        <View className="px-6 pt-6 pb-4">
          <Text className="text-sm font-bold text-gray-500 mb-3">ACTIONS RAPIDES</Text>
          <View className="flex-row justify-between">
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                className="flex-1 bg-white rounded-2xl p-4 mx-1 items-center shadow-sm"
                onPress={action.action}
              >
                <View className="relative">
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center mb-2"
                    style={{ backgroundColor: action.color + '20' }}
                  >
                    <Ionicons name={action.icon as any} size={24} color={action.color} />
                  </View>
                  {action.badge && (
                    <View className="absolute -top-1 -right-1 bg-primary px-2 py-0.5 rounded-full">
                      <Text className="text-white text-xs font-bold">{action.badge}</Text>
                    </View>
                  )}
                </View>
                <Text className="text-sm text-gray-700 font-medium">{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FAQ */}
        <View className="px-6 pb-6">
          <Text className="text-sm font-bold text-gray-500 mb-3">QUESTIONS FRÉQUENTES</Text>
          {faqCategories.map((category, categoryIndex) => (
            <Animated.View
              key={categoryIndex}
              entering={FadeInDown.delay(categoryIndex * 50)}
              className="mb-4"
            >
              <View className="flex-row items-center mb-3">
                <View
                  className="w-8 h-8 bg-primary/10 rounded-full items-center justify-center mr-2"
                >
                  <Ionicons name={category.icon as any} size={18} color="#FF6B35" />
                </View>
                <Text className="text-lg font-bold text-gray-800">{category.title}</Text>
              </View>

              <View className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {category.items.map((item, itemIndex) => {
                  const key = `${categoryIndex}-${itemIndex}`;
                  const isExpanded = expandedIndex === key;

                  return (
                    <View key={itemIndex}>
                      <TouchableOpacity
                        className={`px-4 py-4 ${itemIndex !== category.items.length - 1 || isExpanded ? 'border-b border-gray-100' : ''}`}
                        onPress={() => toggleExpand(categoryIndex, itemIndex)}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="flex-1 text-gray-800 font-medium pr-2">
                            {item.question}
                          </Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color="#6C757D"
                          />
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <Animated.View
                          entering={FadeInDown}
                          className="px-4 pb-4"
                        >
                          <Text className="text-gray-600 leading-6">{item.answer}</Text>
                        </Animated.View>
                      )}
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Horaires du support */}
        <View className="px-6 pb-8">
          <View className="bg-info/10 border border-info/20 rounded-2xl p-4">
            <View className="flex-row items-center mb-2">
              <Ionicons name="time" size={20} color="#3498DB" />
              <Text className="text-info font-bold ml-2">Horaires du support</Text>
            </View>
            <Text className="text-gray-700">Lundi - Vendredi: 8h00 - 20h00</Text>
            <Text className="text-gray-700">Samedi: 9h00 - 18h00</Text>
            <Text className="text-gray-700">Dimanche: 10h00 - 16h00</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

