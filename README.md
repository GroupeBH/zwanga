# ZWANGA - Application de Covoiturage à Kinshasa

ZWANGA est une application mobile de covoiturage moderne conçue spécifiquement pour Kinshasa, RDC. L'application permet aux conducteurs de proposer des trajets et aux passagers de trouver facilement des covoiturages dans toute la ville.

## 🚀 Fonctionnalités Principales

### 1. Authentification & Inscription
- ✅ Inscription par numéro de téléphone
- ✅ Vérification SMS à 6 chiffres
- ✅ Vérification KYC (Know Your Customer) optionnelle
- ✅ Configuration du profil (conducteur/passager/les deux)
- ✅ Progression gamifiée avec barre de progression et messages motivationnels

### 2. Écran d'Accueil
- ✅ Recherche rapide de trajets (départ → arrivée)
- ✅ Lieux populaires (Gombe, Lemba, Kintambo, Ngaliema, etc.)
- ✅ Actions rapides (Publier/Chercher un trajet)
- ✅ Liste des trajets disponibles avec filtres
- ✅ Notifications en temps réel

### 3. Publication de Trajets (Conducteurs)
- ✅ Processus en 3 étapes avec validation
- ✅ Définition de l'itinéraire avec adresses précises
- ✅ Configuration des détails (heure, places, prix)
- ✅ Écran de confirmation avant publication
- ✅ Persistance des trajets publiés

### 4. Recherche de Trajets (Passagers)
- ✅ Recherche par départ et arrivée
- ✅ Filtres par type de véhicule (Voiture 🚗, Moto 🏍️, Keke 🛺)
- ✅ Affichage des détails (conducteur, note, prix, horaires)
- ✅ Réservation en un clic

### 5. Système de Messagerie
- ✅ Interface type WhatsApp
- ✅ Messages en temps réel
- ✅ Indicateur de présence (en ligne/hors ligne)
- ✅ Badge de messages non lus
- ✅ Recherche de conversations
- ✅ Actions rapides (appel, options)

### 6. Gestion des Trajets
- ✅ Onglets: À venir / Terminés
- ✅ Statuts: À venir, En cours, Terminé, Annulé
- ✅ Détails complets du trajet
- ✅ Carte interactive avec traçage en temps réel
- ✅ Barre de progression pour trajets en cours
- ✅ Possibilité d'annulation

### 7. Profil Utilisateur
- ✅ Statistiques détaillées (trajets, notes, avis, taux de complétion)
- ✅ Badges d'accomplissement (Top Conducteur, Vérifié, Expert)
- ✅ Système d'évaluation avec étoiles
- ✅ Menu complet (profil, véhicule, paiement, paramètres)

### 8. Paramètres
- ✅ Gestion des notifications (trajets, messages, sons, promotions)
- ✅ Confidentialité (localisation, numéro, évaluations)
- ✅ Préférences (mode sombre, langue, acceptation automatique)
- ✅ Intégration avec switches interactifs

### 9. Aide & Support
- ✅ Actions rapides (Appel, Email, WhatsApp)
- ✅ FAQ organisée par catégories
- ✅ Accordéon dépliable pour questions/réponses
- ✅ Horaires du support
- ✅ Barre de recherche

### 10. Système d'Évaluation
- ✅ Notation par étoiles (1-5)
- ✅ Tags prédéfinis (Ponctuel, Sympathique, Propre, etc.)
- ✅ Commentaires optionnels
- ✅ Système de signalement séparé
- ✅ Raisons de signalement structurées
- ✅ Protection contre les faux signalements

### 11. Détails de Trajet
- ✅ Carte interactive agrandissable
- ✅ Traçage en temps réel avec animation
- ✅ Barre de progression dynamique
- ✅ Informations du conducteur avec contact direct
- ✅ Détails complets (places, prix, véhicule)
- ✅ Actions contextuelles selon le statut

## 🎨 Design

L'application utilise un design moderne aux couleurs vives inspirées de l'énergie de Kinshasa:

- **Orange Primary** (#FF6B35) - Couleur principale, énergie
- **Jaune Secondary** (#F7B801) - Optimisme, chaleur
- **Vert Success** (#2ECC71) - Validation, sécurité
- **Bleu Info** (#3498DB) - Information, confiance

### Caractéristiques du Design
- Interface mobile-first optimisée
- Animations fluides avec React Native Reanimated
- Icônes de Ionicons
- Composants arrondis modernes
- Ombres douces et élégantes
- Feedback visuel sur toutes les interactions

## 📱 Technologies Utilisées

- **React Native** - Framework mobile
- **Expo** - Plateforme de développement
- **Expo Router** - Navigation basée sur les fichiers
- **NativeWind** - Tailwind CSS pour React Native
- **TypeScript** - Typage statique
- **React Native Reanimated** - Animations performantes
- **Context API** - Gestion d'état globale

## 🚀 Installation

1. Cloner le dépôt:
\`\`\`bash
git clone https://github.com/votre-repo/zwanga-app.git
cd zwanga-app
\`\`\`

2. Installer les dépendances:
\`\`\`bash
npm install
\`\`\`

3. Lancer l'application:
\`\`\`bash
npm start
\`\`\`

4. Ouvrir dans Expo Go:
   - Scannez le QR code avec l'app Expo Go (Android/iOS)
   - Ou appuyez sur \`a\` pour Android ou \`i\` pour iOS

## 📱 Commandes Disponibles

\`\`\`bash
npm start          # Démarrer le serveur de développement
npm run android    # Lancer sur Android
npm run ios        # Lancer sur iOS
npm run web        # Lancer sur le web
npm run lint       # Vérifier le code avec ESLint
\`\`\`

## 📂 Structure du Projet

\`\`\`
zwanga-app/
├── app/                      # Routes et écrans (Expo Router)
│   ├── (tabs)/              # Écrans avec navigation par onglets
│   │   ├── index.tsx        # Accueil
│   │   ├── trips.tsx        # Mes trajets
│   │   ├── messages.tsx     # Messages
│   │   └── profile.tsx      # Profil
│   ├── chat/                # Chat conversations
│   │   └── [id].tsx         # Écran de chat dynamique
│   ├── trip/                # Détails des trajets
│   │   └── [id].tsx         # Détails trajet dynamique
│   ├── rate/                # Évaluations
│   │   └── [id].tsx         # Évaluation dynamique
│   ├── splash.tsx           # Écran de démarrage
│   ├── auth.tsx             # Authentification
│   ├── publish.tsx          # Publier un trajet
│   ├── search.tsx           # Rechercher un trajet
│   ├── settings.tsx         # Paramètres
│   ├── support.tsx          # Aide & Support
│   └── _layout.tsx          # Layout principal
├── components/              # Composants réutilisables
├── contexts/               # Contextes React (AuthContext)
├── types/                  # Types TypeScript
├── constants/              # Constantes et thèmes
├── assets/                 # Images et ressources
├── tailwind.config.js      # Configuration Tailwind
├── metro.config.js         # Configuration Metro bundler
└── global.css             # Styles globaux
\`\`\`

## 🔐 Authentification

L'application utilise un système d'authentification complet:
1. Numéro de téléphone (+243)
2. Vérification SMS
3. KYC optionnel (skippable)
4. Configuration du rôle (conducteur/passager/les deux)

## 💰 Modes de Paiement

Support prévu pour:
- Orange Money 🟠
- M-Pesa 💚
- Airtel Money 🔴
- Espèces 💵

## 🗺️ Navigation

L'application utilise Expo Router avec une navigation basée sur les fichiers:
- Navigation par onglets en bas
- Stack navigation pour les écrans secondaires
- Modales pour actions rapides
- Deep linking support

## 🎯 Prochaines Étapes

- [ ] Intégration de Google Maps / Mapbox
- [ ] Backend avec Supabase
- [ ] Notifications push
- [ ] Paiements en ligne
- [ ] Géolocalisation en temps réel
- [ ] Système de parrainage
- [ ] Programme de fidélité

## 👥 Support Types de Véhicules

- 🚗 Voitures (2-4 places)
- 🏍️ Motos (1 passager)
- 🛺 Keke/Tricycles (2-3 places)

## 📱 Compatibilité

- iOS 13+
- Android 6.0+ (API 23)
- Web (Progressive Web App)

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📄 Licence

MIT License - voir le fichier LICENSE pour plus de détails.

## 📧 Contact

Pour toute question ou suggestion:
- Email: support@zwanga.cd
- WhatsApp: +243 123 456 789
- Site web: www.zwanga.cd

---

Fait avec ❤️ pour Kinshasa
