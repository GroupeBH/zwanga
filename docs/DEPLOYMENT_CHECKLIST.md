# Première mise en production – Checklist

## 1. Pré-requis
- Node 18+, npm 10+
- Expo CLI (`npm install -g expo-cli`) ou `npx expo`
- Compte Expo et EAS configuré (`eas login`)

## 2. Dépendances & configuration
1. Installer les packages natifs utilisés :
   ```bash
   npm install
   npx expo install expo-location
   ```
2. Vérifier les variables d’environnement dans `.env` :
   ```
   EXPO_PUBLIC_API_URL=http://192.168.xxx.xxx:5000/api/v1
   EXPO_PUBLIC_ENV=development
   EXPO_PUBLIC_SECURESTORE_ACCESS_KEY=zwanga_accessToken
   EXPO_PUBLIC_SECURESTORE_REFRESH_KEY=zwanga_refreshToken
   ```
3. Mettre à jour les logos/icônes dans `assets/images`.

## 3. Vérifications fonctionnelles
- `npm run lint`
- `npx expo-doctor`
- Tests manuels :
  - Authentification complète (inscription + login)
  - Navigation entre toutes les tabs (Accueil, Trajets, Messages, Carte, Profil)
  - Upload photo + sélection depuis la galerie
  - Permissions : caméra, média, localisation
  - Flux de réservation / publication (mock si API non prête)

## 4. Build / Publication
1. Créer un dev client (facultatif mais recommandé) :
   ```bash
   npx expo prebuild
   npx expo run:android   # ou run:ios
   ```
2. Premier build store avec EAS :
   ```bash
   eas build --platform android
   eas build --platform ios
   ```
3. Publication OTA (optionnel) :
   ```bash
   npx expo publish
   ```

## 5. Post-déploiement
- Configurer monitoring (Sentry, LogRocket…) si besoin.
- Préparer la fiche Play Store / App Store (captures, description, privacy).

