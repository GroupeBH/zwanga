# Configuration Mapbox Directions API pour le routage

## Solution actuelle : Mapbox Directions API

Nous utilisons **Mapbox Directions API** pour obtenir les coordonnées du trajet réel entre deux points.

## Configuration

### 1. Obtenir un Access Token Mapbox

1. Allez sur [Mapbox Account](https://account.mapbox.com/)
2. Créez un compte ou connectez-vous
3. Allez dans "Access tokens"
4. Créez un nouveau token ou utilisez le token par défaut
5. Copiez le token

### 2. Configurer le token dans le projet

Le token est déjà configuré dans `app.config.js` via le plugin `@rnmapbox/maps`.

Pour l'utiliser dans le code (routage), ajoutez-le aussi dans votre fichier `.env` :

```env
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=votre_token_mapbox_ici
```

### 3. Redémarrer l'application

Après avoir ajouté le token dans `.env`, redémarrez Expo :

```bash
npm start
```

## Fonctionnement

- Si le token est configuré : Le trajet réel est calculé via Mapbox Directions API
- Si le token n'est pas configuré : Une ligne droite est affichée (fallback)

## Coûts

Mapbox propose un **crédit gratuit** de $5 par mois, ce qui correspond à environ :
- **100,000 requêtes** de routage par mois (gratuit)
- Au-delà : $0.50 par 1,000 requêtes

Pour une app de covoiturage, cela devrait largement suffire pour commencer.

## API utilisée

- **Endpoint** : `https://api.mapbox.com/directions/v5/mapbox/driving/{coordinates}`
- **Format** : GeoJSON
- **Profile** : `driving` (conduite automobile)

## Vérification

Pour vérifier que tout fonctionne :

1. Ouvrez un trajet dans l'app
2. La carte devrait afficher le trajet réel (pas une ligne droite)
3. Vérifiez la console : aucun warning "Mapbox access token not configured"

## Dépannage

### Erreur : "Mapbox access token not configured"
- Vérifiez que le token est correctement copié dans `.env`
- Vérifiez que `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` est défini
- Redémarrez Expo après modification de `.env`

### Erreur : "No route found"
- Vérifiez que les coordonnées sont valides
- Certaines zones peuvent ne pas avoir de routes disponibles

### Le trajet ne s'affiche toujours pas
- Vérifiez que le token a les permissions nécessaires
- Vérifiez les logs de la console pour plus de détails

## Note

Google Maps API est actuellement en retrait dans le projet. Si vous souhaitez l'utiliser plus tard, consultez `GOOGLE_MAPS_API_SETUP.md`.

