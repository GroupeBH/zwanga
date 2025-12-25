# Configuration Google Maps API

> **Note** : Ce projet utilise maintenant **Google Maps** au lieu de Mapbox. Cette configuration est **requise** pour que l'application fonctionne correctement.

## Problème

`react-native-maps` (Expo Maps) ne fournit **pas** d'API de routage intégrée. Il faut utiliser une API externe pour calculer les trajets réels.

## Solution : Google Directions API (En retrait)

Nous utilisons actuellement **Mapbox Directions API**. Google Directions API peut être activé plus tard si nécessaire.

## Configuration

### 1. Obtenir une clé API Google Maps

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un projet ou sélectionnez un projet existant
3. Activez l'API **Directions API** :
   - Allez dans "APIs & Services" > "Library"
   - Recherchez "Directions API"
   - Cliquez sur "Enable"
4. Créez une clé API :
   - Allez dans "APIs & Services" > "Credentials"
   - Cliquez sur "Create Credentials" > "API Key"
   - Copiez la clé générée

### 2. Configurer la clé dans le projet

Ajoutez la clé dans votre fichier `.env` :

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=votre_cle_api_ici
```

### 3. Restreindre la clé API (Recommandé pour la production)

Pour la sécurité, restreignez votre clé API :

1. Dans Google Cloud Console, allez dans "Credentials"
2. Cliquez sur votre clé API
3. Dans "API restrictions", sélectionnez "Restrict key"
4. Choisissez "Directions API" uniquement
5. Dans "Application restrictions", configurez :
   - **Android apps** : Ajoutez le package name `com.zwanga`
   - **iOS apps** : Ajoutez le bundle ID de votre app iOS

### 4. Redémarrer l'application

Après avoir ajouté la clé dans `.env`, redémarrez Expo :

```bash
npm start
```

## Fonctionnement

- Si la clé API est configurée : Le trajet réel est calculé via Google Directions API
- Si la clé API n'est pas configurée : Une ligne droite est affichée (fallback)

## Coûts

Google Directions API propose un **crédit gratuit** de $200 par mois, ce qui correspond à environ :
- **40,000 requêtes** de routage par mois (gratuit)
- Au-delà : $5 par 1,000 requêtes

Pour une app de covoiturage, cela devrait largement suffire pour commencer.

## Alternative : Backend Proxy

Si vous préférez ne pas exposer la clé API côté client, vous pouvez :

1. Créer un endpoint backend qui appelle Google Directions API
2. Le backend stocke la clé API de manière sécurisée
3. Le frontend appelle votre backend au lieu de Google directement

Exemple d'endpoint backend :
```
GET /api/routes?origin=lat,lng&destination=lat,lng
```

## Vérification

Pour vérifier que tout fonctionne :

1. Ouvrez un trajet dans l'app
2. La carte devrait afficher le trajet réel (pas une ligne droite)
3. Vérifiez la console : aucun warning "Google Maps API key not configured"

## Dépannage

### Erreur : "API key not valid"
- Vérifiez que la clé est correctement copiée dans `.env`
- Vérifiez que l'API Directions API est activée
- Redémarrez Expo après modification de `.env`

### Erreur : "This API project is not authorized"
- Activez Directions API dans Google Cloud Console
- Attendez quelques minutes pour la propagation

### Le trajet ne s'affiche toujours pas
- Vérifiez les restrictions de la clé API
- Vérifiez que le package name/bundle ID correspond

