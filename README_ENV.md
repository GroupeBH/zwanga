# Configuration des variables d'environnement

Ce projet utilise des variables d'environnement pour configurer l'API et d'autres paramètres.

## Installation

1. Copiez le fichier `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```

2. Modifiez le fichier `.env` avec vos valeurs :
   ```env
   EXPO_PUBLIC_API_URL=https://api.zwanga.cd/v1
   EXPO_PUBLIC_ENV=development
   ```

## Variables disponibles

### `EXPO_PUBLIC_API_URL`
URL de base de l'API backend. Par défaut : `https://api.zwanga.cd/v1`

### `EXPO_PUBLIC_ENV`
Environnement de l'application. Valeurs possibles :
- `development` : Mode développement
- `staging` : Mode staging
- `production` : Mode production

Par défaut : `development` en mode dev, `production` en mode production

## Utilisation dans le code

Les variables d'environnement sont accessibles via le fichier `config/env.ts` :

```typescript
import { API_BASE_URL, isDevelopment, isProduction } from '@/config/env';

// Utiliser l'URL de l'API
const response = await fetch(`${API_BASE_URL}/endpoint`);

// Vérifier l'environnement
if (isDevelopment) {
  console.log('Mode développement');
}
```

## Important

- Les variables doivent être préfixées par `EXPO_PUBLIC_` pour être accessibles dans l'application
- Le fichier `.env` est ignoré par git (déjà dans `.gitignore`)
- Ne commitez jamais le fichier `.env` avec des valeurs sensibles
- Utilisez `.env.example` comme template pour documenter les variables nécessaires

## Configuration Expo

Le fichier `app.config.js` charge automatiquement les variables depuis `.env` et les expose via `Constants.expoConfig?.extra`.

Pour que les changements prennent effet, redémarrez le serveur Expo :
```bash
npm start
```

