# Notes sur la migration vers Mapbox

## Changements effectués

✅ **Retrait de `PROVIDER_GOOGLE`** dans :
- `app/(tabs)/map.tsx` - Écran de carte principal
- `components/LocationPickerModal.tsx` - Sélection de localisation
- `app/trip/[id].tsx` - Déjà sans PROVIDER_GOOGLE (utilise le provider par défaut)

## État actuel

Le projet utilise actuellement `react-native-maps` qui, par défaut, utilise :
- **iOS** : Apple Maps (MapKit)
- **Android** : Google Maps (si disponible) ou OpenStreetMap

## Options pour utiliser Mapbox

### Option 1 : Utiliser le provider par défaut (actuel)
- ✅ Simple, pas de changement d'API
- ❌ N'utilise pas vraiment Mapbox, utilise Apple Maps / Google Maps

### Option 2 : Migrer vers `@rnmapbox/maps` (recommandé)
Pour vraiment utiliser Mapbox, il faut migrer vers `@rnmapbox/maps` qui est déjà installé dans le projet.

**Avantages** :
- ✅ Utilise vraiment Mapbox
- ✅ Meilleure intégration avec Mapbox Directions API
- ✅ Plus de contrôle sur le style de carte

**Inconvénients** :
- ❌ Nécessite de changer l'API dans tous les fichiers
- ❌ Syntaxe légèrement différente

**Fichiers à modifier** :
1. `app/(tabs)/map.tsx`
2. `app/trip/[id].tsx`
3. `components/LocationPickerModal.tsx`

**Exemple de migration** :

```typescript
// Avant (react-native-maps)
import MapView, { Marker, Polyline } from 'react-native-maps';

<MapView initialRegion={region}>
  <Marker coordinate={coords} />
  <Polyline coordinates={coords} />
</MapView>

// Après (@rnmapbox/maps)
import Mapbox from '@rnmapbox/maps';

<Mapbox.MapView styleURL={Mapbox.StyleURL.Street} style={styles.map}>
  <Mapbox.Camera
    zoomLevel={10}
    centerCoordinate={[longitude, latitude]}
  />
  <Mapbox.PointAnnotation coordinate={[longitude, latitude]}>
    <View>...</View>
  </Mapbox.PointAnnotation>
  <Mapbox.ShapeSource
    id="route"
    shape={{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coords.map(c => [c.longitude, c.latitude])
      }
    }}
  >
    <Mapbox.LineLayer id="routeLine" style={{ lineColor: '#FF6B35' }} />
  </Mapbox.ShapeSource>
</Mapbox.MapView>
```

## Récupération d'adresses

✅ **Déjà configuré avec Mapbox** : Le projet utilise `expo-location` pour le geocoding, qui peut utiliser différents providers selon la plateforme. Pas besoin de Google Places API.

## Recommandation

Pour l'instant, les changements effectués (retrait de PROVIDER_GOOGLE) permettront d'utiliser le provider par défaut. Si vous voulez vraiment utiliser Mapbox partout, il faudra migrer vers `@rnmapbox/maps` dans les fichiers listés ci-dessus.

