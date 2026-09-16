# Backlog Technique Kinshasa

## Objectif

Transformer Zwanga en application vraiment utilisable a Kinshasa pour des utilisateurs tres varies:

- debutants numeriques
- utilisateurs en faible connectivite
- utilisateurs qui preferent les reperes locaux a la carte
- utilisateurs qui ont besoin d'un support humain rapide
- utilisateurs passagers avant conducteurs

Ce document couvre a la fois le frontend mobile dans `zwanga` et le backend API dans `zwanga-backend`.

## Decisions Produit Retenues

1. Le premier objectif est de donner de la valeur tres vite au passager.
2. Le KYC reste strict pour les conducteurs, mais devient progressif pour les passagers.
3. La recherche ne doit plus dependre principalement de la carte.
4. Les lieux frequents et les reperes locaux deviennent des briques centrales.
5. Le support doit etre configurable cote backend et non code en dur dans le mobile.
6. Le produit doit fonctionner correctement en connexion faible.
7. Le langage par defaut devient un francais simple, puis on prepare Lingala.

## Ordre De Livraison

### Phase 1 - Valeur immediate

- KIN-01: Centre d'aide dynamique
- KIN-02: Contrat des lieux favoris + raccourcis frequents
- KIN-03: Repertoire de lieux et reperes de Kinshasa
- KIN-04: Accueil simple et recherche par reperes

### Phase 2 - Reduction de friction

- KIN-05: KYC progressif par role
- KIN-06: KYC guide et comprehensible
- KIN-07: Permissions demandees au bon moment
- KIN-08: Mode faible connexion

### Phase 3 - Confiance et maturite

- KIN-09: Langues et contenus locaux
- KIN-10: Support vocal, rappel et tickets enrichis
- KIN-11: Paiement et prix explicites
- KIN-12: Nettoyage du modele de roles

## Quick Wins A Corriger Tout De Suite

### QW-01 - Support mobile encore statique

Constat:

- Le mobile a des contacts support codes en dur dans [app/support.tsx](C:/Users/hp/projects/zwanga/app/support.tsx).
- Le backend a deja une base solide pour FAQ et tickets dans `src/support` et `src/faq`.

Action:

- Ne plus garder `tel`, `mailto`, `whatsapp`, horaires et FAQ cote mobile en dur.
- Brancher l'ecran support sur l'API.

### QW-02 - Ecart de contrat sur les lieux favoris

Constat:

- Le frontend envoie `notes` dans [store/api/userApi.ts](C:/Users/hp/projects/zwanga/store/api/userApi.ts) et l'utilise dans [app/favorite-locations.tsx](C:/Users/hp/projects/zwanga/app/favorite-locations.tsx).
- Le backend `favorite-places` n'a pas `notes` dans son DTO ni dans son entity.

Action:

- Ajouter `notes` cote backend.
- Retourner `notes` dans `FavoritePlaceResponse`.

### QW-03 - Confusion sur le role "les deux"

Constat:

- Le README mobile parle de `conducteur/passager/les deux`.
- Le backend ne supporte que `driver`, `passenger`, `admin`.

Action:

- Soit retirer la promesse "les deux" de la couche UX.
- Soit introduire une vraie gestion mixte plus tard.

## Tickets Techniques

---

## KIN-01 - Centre D'aide Dynamique Et Configurable

### Pourquoi

Le support est l'un des plus gros leviers d'adoption a Kinshasa. Aujourd'hui le frontend garde encore une FAQ et des contacts en dur.

### Frontend

Fichiers a modifier:

- [app/support.tsx](C:/Users/hp/projects/zwanga/app/support.tsx)
- [store/api](C:/Users/hp/projects/zwanga/store/api)
- [types/index.ts](C:/Users/hp/projects/zwanga/types/index.ts)

Travail:

- Creer `store/api/supportApi.ts`.
- Charger FAQ, config support et tickets depuis l'API.
- Ajouter filtrage reel des FAQ cote UI.
- Remplacer les quick actions hardcodees par la config backend.
- Ajouter etat `chargement`, `erreur`, `connexion faible`.

### Backend

Fichiers a modifier:

- `src/support/support.controller.ts`
- `src/support/support.service.ts`
- `src/support/support.module.ts`
- `src/faq/faq.controller.ts`
- `src/faq/faq.service.ts`
- `src/faq/dto/faq.dto.ts`

Nouveaux fichiers proposes:

- `src/support/dto/support-config.dto.ts`
- `src/support/entities/support-config.entity.ts`

### Contrats API

Nouveaux endpoints:

- `GET /support/config`
- `GET /support/faq?locale=fr-simple&audience=all&search=...`

Exemple `GET /support/config`:

```json
{
  "phone": "+243...",
  "whatsapp": "+243...",
  "email": "support@zwanga.cd",
  "hours": [
    { "day": "monday", "open": "08:00", "close": "20:00" }
  ],
  "channels": {
    "callEnabled": true,
    "whatsappEnabled": true,
    "emailEnabled": true,
    "callbackEnabled": false
  }
}
```

### Acceptance Criteria

- Le support mobile ne contient plus de numero ou FAQ en dur.
- Les FAQ sont filtrables par recherche et categorie.
- Les horaires et canaux sont pilotables depuis le backend.

---

## KIN-02 - Contrat Des Lieux Favoris Et Raccourcis D'usage

### Pourquoi

Les lieux frequents sont un levier majeur pour les utilisateurs peu a l'aise avec la saisie et la carte.

### Frontend

Fichiers a modifier:

- [app/favorite-locations.tsx](C:/Users/hp/projects/zwanga/app/favorite-locations.tsx)
- [components/LocationPickerModal.tsx](C:/Users/hp/projects/zwanga/components/LocationPickerModal.tsx)
- [store/api/userApi.ts](C:/Users/hp/projects/zwanga/store/api/userApi.ts)
- [types/index.ts](C:/Users/hp/projects/zwanga/types/index.ts)
- [app/(tabs)/index.tsx](C:/Users/hp/projects/zwanga/app/(tabs)/index.tsx)

Travail:

- Afficher `Domicile`, `Bureau`, `Autre`, `Defaut`.
- Ajouter `notes`, `repere`, `commune`, `quartier`.
- Afficher les lieux favoris en premier dans l'accueil et la recherche.
- Ajouter `dernier utilise` et `utilisations frequentes`.

### Backend

Fichiers a modifier:

- `src/favorite-places/entities/favorite-place.entity.ts`
- `src/favorite-places/dto/favorite-place.dto.ts`
- `src/favorite-places/favorite-places.service.ts`
- `src/favorite-places/favorite-places.controller.ts`

Migration:

- ajouter colonnes `notes`, `landmarkLabel`, `district`, `commune`, `usageCount`, `lastUsedAt`

### Contrats API

Evolutions:

- `POST /favorite-places`
- `PUT /favorite-places/:id`
- `GET /favorite-places`
- `GET /favorite-places/recent`

Exemple payload:

```json
{
  "name": "Maison",
  "address": "Lemba Terminus",
  "coordinates": { "latitude": -4.42, "longitude": 15.31 },
  "type": "home",
  "isDefault": true,
  "notes": "En face de l'eglise",
  "landmarkLabel": "Rond-point",
  "district": "Lemba",
  "commune": "Lemba"
}
```

### Acceptance Criteria

- Le champ `notes` fonctionne de bout en bout.
- Les favoris remontent correctement dans les pickers.
- L'accueil peut proposer les lieux frequents sans re-saisie.

---

## KIN-03 - Repertoire De Lieux Et Reperes De Kinshasa

### Pourquoi

Les utilisateurs pensent souvent en reperes locaux plutot qu'en adresses ou en points GPS.

### Frontend

Fichiers a modifier:

- [components/LocationPickerModal.tsx](C:/Users/hp/projects/zwanga/components/LocationPickerModal.tsx)
- [app/search.tsx](C:/Users/hp/projects/zwanga/app/search.tsx)
- [app/publish.tsx](C:/Users/hp/projects/zwanga/app/publish.tsx)
- [store/api](C:/Users/hp/projects/zwanga/store/api)

Travail:

- Ajouter un onglet `Reperes` dans le picker.
- Afficher suggestions locales avant les suggestions Google/Mapbox.
- Supporter les communes et reperes populaires dans la recherche.

### Backend

Nouveau module:

- `src/places`

Fichiers proposes:

- `src/places/places.module.ts`
- `src/places/places.controller.ts`
- `src/places/places.service.ts`
- `src/places/entities/place.entity.ts`
- `src/places/dto/place.dto.ts`

Donnees:

- seed initial avec communes, quartiers, marches, arrets, universites, hopitaux, grandes avenues, ronds-points

### Contrats API

Nouveaux endpoints:

- `GET /places/popular?locale=fr-simple`
- `GET /places/suggest?q=lemba`
- `GET /places/:id`

Exemple reponse:

```json
[
  {
    "id": "place_lemba_terminus",
    "label": "Lemba Terminus",
    "aliases": ["terminus lemba", "lemba"],
    "kind": "transport_hub",
    "commune": "Lemba",
    "district": "Lemba",
    "coordinates": { "latitude": -4.43, "longitude": 15.31 }
  }
]
```

### Acceptance Criteria

- Les suggestions locales apparaissent avant les APIs cartographiques externes.
- Les utilisateurs peuvent chercher un lieu sans passer par la carte.

---

## KIN-04 - Accueil Simple Et Recherche Par Reperes

### Pourquoi

L'accueil actuel reste trop cache et trop technique pour un premier usage.

### Frontend

Fichiers a modifier:

- [app/(tabs)/index.tsx](C:/Users/hp/projects/zwanga/app/(tabs)/index.tsx)
- [app/(tabs)/_layout.tsx](C:/Users/hp/projects/zwanga/app/(tabs)/_layout.tsx)
- [app/search.tsx](C:/Users/hp/projects/zwanga/app/search.tsx)
- [contexts/TutorialContext.tsx](C:/Users/hp/projects/zwanga/contexts/TutorialContext.tsx)

Travail:

- Remplacer l'entree cachee de recherche precise par un accueil simple.
- Ajouter 4 CTA visibles:
  - Chercher un trajet
  - Publier un trajet
  - Mes lieux
  - Aide
- Ajouter `trajets du jour`, `trajets proches`, `trajets gratuits`.
- Ajouter un `mode simple` memorise en local.

### Backend

Nouveau module ou extension:

- `src/experience`

Endpoints:

- `GET /experience/mobile-config`

Contenu:

- flags UX
- sections home
- labels par locale
- campagnes locales

### Acceptance Criteria

- Un nouvel utilisateur peut comprendre les 4 actions principales en moins de 10 secondes.
- L'accueil fonctionne sans ouvrir de modal carte.

---

## KIN-05 - KYC Progressif Par Role

### Pourquoi

Le KYC trop precoce tue l'adoption, surtout pour les passagers qui veulent d'abord tester le service.

### Frontend

Fichiers a modifier:

- [app/auth.tsx](C:/Users/hp/projects/zwanga/app/auth.tsx)
- [app/publish.tsx](C:/Users/hp/projects/zwanga/app/publish.tsx)
- [app/trip/[id].tsx](C:/Users/hp/projects/zwanga/app/trip/[id].tsx)
- [components/auth/steps/ProfileStep.tsx](C:/Users/hp/projects/zwanga/components/auth/steps/ProfileStep.tsx)

Travail:

- Laisser un passager s'inscrire et explorer sans KYC.
- Autoriser la premiere demande de trajet et la premiere reservation avec OTP + profil.
- Garder KYC requis pour:
  - publier comme conducteur
  - activer le role conducteur
  - certaines actions sensibles selon politique produit

### Backend

Fichiers a modifier:

- `src/users/users.service.ts`
- `src/trips/trips.service.ts`
- `src/bookings/bookings.service.ts`
- `src/auth/auth.service.ts`

Decisions de regle:

- `driver`: KYC obligatoire
- `passenger`: KYC differe

### Contrats API

Ajouter au profil utilisateur:

```json
{
  "kycLevel": "none | basic | verified",
  "bookingEligibility": {
    "canBook": true,
    "reason": null
  },
  "driverEligibility": {
    "canPublish": false,
    "reason": "kyc_required"
  }
}
```

### Acceptance Criteria

- Un nouveau passager peut finir son inscription sans KYC.
- Les blocages sont explicites et renvoyes par le backend.

---

## KIN-06 - KYC Guide Et Compréhensible

### Pourquoi

Le KYC actuel suppose une bonne maitrise des scans et de la camera.

### Frontend

Fichiers a modifier:

- [components/KycWizardModal.tsx](C:/Users/hp/projects/zwanga/components/KycWizardModal.tsx)
- [components/IdentityVerification.tsx](C:/Users/hp/projects/zwanga/components/IdentityVerification.tsx)
- [app/verification.tsx](C:/Users/hp/projects/zwanga/app/verification.tsx)

Travail:

- Ajouter `mode guide` et `mode manuel`.
- Montrer un exemple visuel avant chaque capture.
- Ajouter aide contextuelle: photo trop floue, trop sombre, carte incomplete.
- Ajouter raisons de rejet courtes et reessayables.

### Backend

Fichiers a modifier:

- `src/users/users.service.ts`
- `src/users/entities/kyc-document.entity.ts`
- `src/common/services/kyc-validation.service.ts`

Evolutions:

- standardiser `rejectionCode`
- standardiser `rejectionShortMessage`
- historiser les soumissions

### Contrats API

Exemple `GET /users/kyc/status`:

```json
{
  "status": "rejected",
  "rejectionCode": "document_blurry",
  "rejectionShortMessage": "La photo du document est floue.",
  "canRetry": true
}
```

### Acceptance Criteria

- Un utilisateur comprend en une phrase pourquoi le KYC a echoue.
- Le retry ne recommence pas tout inutilement.

---

## KIN-07 - Permissions Demandees Au Bon Moment

### Pourquoi

Les demandes de permissions trop tot font peur et augmentent l'abandon.

### Frontend

Fichiers a modifier:

- [app/onboarding.tsx](C:/Users/hp/projects/zwanga/app/onboarding.tsx)
- [app/background-location-disclosure.tsx](C:/Users/hp/projects/zwanga/app/background-location-disclosure.tsx)
- [hooks/useUserLocation.ts](C:/Users/hp/projects/zwanga/hooks/useUserLocation.ts)
- [app/trip/navigate/[id].tsx](C:/Users/hp/projects/zwanga/app/trip/navigate/[id].tsx)
- [app/booking/navigate/[id].tsx](C:/Users/hp/projects/zwanga/app/booking/navigate/[id].tsx)

Travail:

- Ne plus envoyer automatiquement vers la disclosure apres onboarding.
- Demander la localisation:
  - a la recherche proche de moi
  - au demarrage de navigation
  - au partage live du trajet

### Backend

Optionnel:

- `experience/mobile-config` peut piloter `deferredLocationPermission`

### Acceptance Criteria

- Aucun utilisateur ne voit la localisation en arriere-plan avant un usage justifie.

---

## KIN-08 - Mode Faible Connexion

### Pourquoi

Le produit doit rester lisible et utile meme en mauvais reseau.

### Frontend

Fichiers a modifier:

- [store/api/baseApi.ts](C:/Users/hp/projects/zwanga/store/api/baseApi.ts)
- [app/(tabs)/index.tsx](C:/Users/hp/projects/zwanga/app/(tabs)/index.tsx)
- [app/search.tsx](C:/Users/hp/projects/zwanga/app/search.tsx)
- [app/support.tsx](C:/Users/hp/projects/zwanga/app/support.tsx)
- [components](C:/Users/hp/projects/zwanga/components)

Travail:

- Ajouter banniere `connexion faible`.
- Ajouter cache des derniers trajets consultes.
- Ajouter `retry` visibles.
- Ajouter vue de recherche sans carte.

### Backend

Travail:

- Ajouter endpoints `lite` quand utile:
  - `GET /trips/lite`
  - `GET /support/faq/lite`
  - `GET /experience/mobile-config`
- Garder les payloads compacts.

### Acceptance Criteria

- L'application reste navigable et comprehensible avec plusieurs requetes en echec.

---

## KIN-09 - Langues Et Contenus Locaux

### Pourquoi

Le francais actuel est trop standard ou trop technique pour une partie du public cible.

### Frontend

Fichiers a modifier:

- [app/settings.tsx](C:/Users/hp/projects/zwanga/app/settings.tsx)
- [constants](C:/Users/hp/projects/zwanga/constants)
- [app/support.tsx](C:/Users/hp/projects/zwanga/app/support.tsx)
- [app/auth.tsx](C:/Users/hp/projects/zwanga/app/auth.tsx)

Travail:

- Introduire une vraie cle `locale`.
- Support initial:
  - `fr-simple`
  - `fr`
  - `ln`

### Backend

Fichiers a modifier:

- `src/faq/entities/faq-entry.entity.ts`
- `src/faq/dto/faq.dto.ts`
- `src/faq/faq.service.ts`
- `src/support/entities/support-config.entity.ts`

Nouvelles colonnes proposees:

- `locale`
- `audience`
- `keywords`
- `shortTitle`

### Acceptance Criteria

- La langue ne doit plus etre un simple texte statique dans les parametres.
- Les FAQ et labels support peuvent varier selon la locale.

---

## KIN-10 - Support Vocal, Demande De Rappel Et Tickets Enrichis

### Pourquoi

Beaucoup d'utilisateurs preferent la voix ou l'appel au texte long.

### Frontend

Fichiers a modifier:

- [app/support.tsx](C:/Users/hp/projects/zwanga/app/support.tsx)
- nouveau [app/support-ticket/[id].tsx](C:/Users/hp/projects/zwanga/app/support-ticket)
- nouveau `store/api/supportApi.ts`

Travail:

- Ajouter `Demander qu'on me rappelle`.
- Ajouter creation de ticket assistee.
- Ajouter envoi de note vocale ou photo si retenu.

### Backend

Fichiers a modifier:

- `src/support/support.controller.ts`
- `src/support/support.service.ts`
- `src/support/dto/support-ticket.dto.ts`
- `src/support/entities/support-ticket.entity.ts`

Nouveaux objets:

- `callback requests`
- pieces jointes de ticket

Nouveaux endpoints:

- `POST /support/callback-requests`
- `POST /support/tickets/:id/attachments`

### Acceptance Criteria

- Un utilisateur peut demander de l'aide sans devoir taper un long texte.

---

## KIN-11 - Paiement Et Prix Explicites

### Pourquoi

La confiance se joue beaucoup sur `combien`, `quand`, `comment`.

### Frontend

Fichiers a modifier:

- [app/publish.tsx](C:/Users/hp/projects/zwanga/app/publish.tsx)
- [app/trip/[id].tsx](C:/Users/hp/projects/zwanga/app/trip/[id].tsx)
- [app/request.tsx](C:/Users/hp/projects/zwanga/app/request.tsx)
- [app/request/[id].tsx](C:/Users/hp/projects/zwanga/app/request/[id].tsx)

Travail:

- Afficher clairement:
  - prix par place
  - gratuit ou payant
  - cash accepte
  - mobile money accepte
  - moment du paiement

### Backend

Fichiers a modifier:

- `src/trips/entities/trip.entity.ts`
- `src/trips/dto/trip.dto.ts`
- `src/bookings/entities/booking.entity.ts`

Nouvelles colonnes proposees:

- `acceptedPaymentMethods`
- `paymentTiming`
- `currency`

### Acceptance Criteria

- Un trajet affiche un mode de paiement compréhensible avant reservation.

---

## KIN-12 - Nettoyage Du Modele De Roles

### Pourquoi

Le produit promet implicitement un usage mixte, mais le modele metier reste surtout binaire.

### Frontend

Fichiers a modifier:

- [components/auth/steps/ProfileStep.tsx](C:/Users/hp/projects/zwanga/components/auth/steps/ProfileStep.tsx)
- [app/auth.tsx](C:/Users/hp/projects/zwanga/app/auth.tsx)
- [README.md](C:/Users/hp/projects/zwanga/README.md)

Travail:

- Decider clairement:
  - soit `passager` et `conducteur` restent les seuls roles UX
  - soit on ajoute un vrai mode `mixte`

### Backend

Fichiers a modifier:

- `src/users/entities/user.entity.ts`
- `src/auth/dto/auth.dto.ts`
- `src/auth/auth.service.ts`

Decision recommandee:

- Garder `role principal`
- Ajouter flags de capacite:
  - `canBook`
  - `canPublish`
  - `isDriver`

### Acceptance Criteria

- Le vocabulaire utilisateur et le modele backend racontent la meme histoire.

## Fichiers Frontend A Prevoir En Plus

Nouveaux fichiers recommandés:

- `store/api/supportApi.ts`
- `store/api/placesApi.ts`
- `store/api/experienceApi.ts`
- `components/support/SupportChannelCard.tsx`
- `components/search/PlaceSuggestionList.tsx`
- `components/home/SimpleHomeActions.tsx`
- `components/kyc/KycHelpCard.tsx`

## Fichiers Backend A Prevoir En Plus

Nouveaux modules recommandés:

- `src/places`
- `src/experience`

Nouvelles migrations probables:

- `favorite_places` enrichi
- `faq_entries` enrichi
- `support_config`
- `places`
- `trip payment metadata`

## Sprint 1 Recommande

Si on doit lancer le chantier tout de suite, je recommande cet ordre:

1. KIN-01
2. KIN-02
3. KIN-03
4. KIN-04

## Risques A Suivre

- divergence de contrat entre `users/favorite-locations` et `favorite-places`
- double source de verite pour la FAQ si le mobile garde encore du contenu en dur
- dette de role si on laisse subsister la promesse `les deux`
- complexite KYC si la regle passager/conducteur n'est pas stabilisee tot

## Definition Of Done Transverse

Un ticket n'est pas termine si:

- le mobile n'a pas d'etat `loading`, `error`, `empty`
- l'API n'a pas de DTO et validation explicites
- les contrats ne sont pas documentes
- le texte utilisateur reste trop technique
- le parcours ne peut pas etre teste avec un reseau faible ou interrompu
