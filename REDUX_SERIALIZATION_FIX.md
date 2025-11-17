# Correction de l'erreur Redux : Valeurs non-sérialisables

## 🐛 Problème

L'erreur suivante apparaissait dans Redux :

```
ERROR  A non-serializable value was detected in the state, in the path: `messages.messages.123.0.timestamp`. Value: 2025-11-12T12:46:09.489Z
Take a look at the reducer(s) handling this action type: auth/initialize/fulfilled.
```

## 🔍 Cause

Redux ne peut pas stocker d'objets `Date` directement dans son state car ils ne sont pas **sérialisables**. Redux nécessite que toutes les valeurs du state soient sérialisables en JSON pour :
- Le time-travel debugging
- La persistence
- Le hot reloading
- Les DevTools

## ✅ Solution appliquée

### 1. Modification des types TypeScript (`types/index.ts`)

**Avant** :
```typescript
export interface Message {
  timestamp: Date;  // ❌ Objet Date
}

export interface Trip {
  departureTime: Date;  // ❌ Objet Date
  arrivalTime: Date;    // ❌ Objet Date
}
```

**Après** :
```typescript
export interface Message {
  timestamp: string;  // ✅ String ISO
}

export interface Trip {
  departureTime: string;  // ✅ String ISO
  arrivalTime: string;    // ✅ String ISO
}
```

### 2. Correction des slices Redux

**messagesSlice.ts** - Avant :
```typescript
timestamp: new Date(Date.now() - 10 * 60 * 1000),  // ❌
```

**messagesSlice.ts** - Après :
```typescript
timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),  // ✅
```

**tripsSlice.ts** - Avant :
```typescript
departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000),  // ❌
```

**tripsSlice.ts** - Après :
```typescript
departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),  // ✅
```

### 3. Création d'utilitaires de formatage (`utils/dateHelpers.ts`)

Nouveaux utilitaires pour manipuler les dates ISO strings :

```typescript
// Formater une heure : "14:30"
formatTime(isoString: string): string

// Formater une date : "12/11/2025"
formatDate(isoString: string): string

// Date et heure : "12/11/2025 14:30"
formatDateTime(isoString: string): string

// Temps relatif : "Il y a 5 minutes" ou "Dans 2 heures"
formatRelativeTime(isoString: string): string

// Durée : "2h 30min"
formatDuration(start: string, end: string): string

// Convertir en Date object si nécessaire
parseISODate(isoString: string): Date

// Vérifications
isToday(isoString: string): boolean
isPast(isoString: string): boolean
isFuture(isoString: string): boolean
```

### 4. Mise à jour des composants UI

**Avant** :
```typescript
{trip.departureTime.getHours()}:{trip.departureTime.getMinutes().toString().padStart(2, '0')}
```

**Après** :
```typescript
import { formatTime } from '@/utils/dateHelpers';

{formatTime(trip.departureTime)}
```

## 📁 Fichiers modifiés

### Types et Redux
- ✅ `types/index.ts` - Tous les `Date` → `string`
- ✅ `store/slices/messagesSlice.ts` - Conversion `.toISOString()`
- ✅ `store/slices/tripsSlice.ts` - Conversion `.toISOString()`

### Utilitaires
- ✅ `utils/dateHelpers.ts` - Nouveau fichier d'utilitaires

### Composants UI
- ✅ `app/(tabs)/index.tsx` - Utilise `formatTime()`
- ✅ `app/(tabs)/trips.tsx` - Utilise `formatTime()`
- ✅ `app/search.tsx` - Utilise `formatTime()`
- ✅ `app/trip/[id].tsx` - Utilise `formatTime()`

## 🎯 Résultat

✅ **Aucune erreur Redux de sérialisation**  
✅ **Toutes les dates affichées correctement**  
✅ **State Redux complètement sérialisable**  
✅ **Compatibilité avec Redux DevTools**  
✅ **Time-travel debugging fonctionnel**

## 📝 Bonnes pratiques appliquées

### 1. Stockage des dates

```typescript
// ❌ MAUVAIS - Stocker des objets Date
const state = {
  timestamp: new Date(),
};

// ✅ BON - Stocker des strings ISO
const state = {
  timestamp: new Date().toISOString(),
};
```

### 2. Affichage des dates

```typescript
// ❌ MAUVAIS - Manipuler directement
const hours = trip.departureTime.getHours();

// ✅ BON - Utiliser les utilitaires
const time = formatTime(trip.departureTime);
```

### 3. Comparaison de dates

```typescript
// ❌ MAUVAIS - Comparer des strings directement
if (trip.departureTime > trip.arrivalTime) { ... }

// ✅ BON - Convertir en Date objects
const start = new Date(trip.departureTime);
const end = new Date(trip.arrivalTime);
if (start > end) { ... }

// OU utiliser les helpers
if (isPast(trip.departureTime)) { ... }
```

## 🔄 Migration pour le futur

Si vous recevez des dates depuis l'API backend :

```typescript
// Si l'API retourne des Date objects
const response = await fetch('/api/trips');
const data = await response.json();

// Convertir toutes les dates en strings
const trips = data.map(trip => ({
  ...trip,
  departureTime: new Date(trip.departureTime).toISOString(),
  arrivalTime: new Date(trip.arrivalTime).toISOString(),
}));

// Stocker dans Redux
dispatch(setTrips(trips));
```

Ou mieux encore, configurer RTK Query pour convertir automatiquement :

```typescript
export const baseApi = createApi({
  // ...
  endpoints: (builder) => ({
    getTrips: builder.query<Trip[], void>({
      query: () => '/trips',
      transformResponse: (response: any[]) => {
        return response.map(trip => ({
          ...trip,
          departureTime: new Date(trip.departureTime).toISOString(),
          arrivalTime: new Date(trip.arrivalTime).toISOString(),
        }));
      },
    }),
  }),
});
```

## 🚀 Performance

Les strings ISO sont :
- ✅ Plus légères en mémoire que les Date objects
- ✅ Directement sérialisables en JSON
- ✅ Comparables avec `<`, `>`, etc.
- ✅ Compatibles avec tous les formats de date JS

## 📚 Références

- [Redux FAQ - Organizing State](https://redux.js.org/faq/organizing-state#can-i-put-functions-promises-or-other-non-serializable-items-in-my-store-state)
- [Redux Toolkit - Immutability](https://redux-toolkit.js.org/usage/immer-reducers#linting-state-mutations)
- [MDN - Date.prototype.toISOString()](https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)

---

**Problème résolu** ✅ L'application ne devrait plus afficher d'erreurs de sérialisation Redux.

