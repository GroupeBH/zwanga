# Sécurité et annonces de mise à jour — 7 octobre 2026

## Périmètre et problème

La page de sécurité décrivait la suppression des contacts au lieu de guider
l’utilisateur. Le partage devait être formulé simplement et un accès SOS police
devait rester disponible. L’application n’avait pas de flux dédié pour annoncer
une nouvelle version disponible sur les stores, dans l’app et par notification push.

## Solutions effectivement appliquées

### Partage et SOS

- Texte commun : « Partagez votre trajet avec vos proches pour votre sécurité. »
- Page Sécurité défilable avec accès aux trajets et bouton « SOS — Police ».
- Choix des numéros existants directement dans la page, sans nouveau modal natif
  ni permission d’accès au répertoire. Les numéros configurés n’ont pas été modifiés.
- Aucun appel au simple affichage ou à l’ouverture du choix : l’utilisateur choisit
  explicitement un numéro. Verrou synchrone contre les doubles appuis et erreur
  affichée dans le panneau si le téléphone ne peut pas ouvrir le composeur.
- Les SOS et partages déjà présents pendant un trajet sont conservés.

Fichiers mobile : `app/security.tsx`, `components/trip/TripShareAction.tsx`,
`components/PoliceContactPanel.tsx`.

### Application mobile

- Modal « Mise à jour disponible » sur l’accueil, masqué pendant un trajet actif
  ou une proposition conducteur prioritaire. Il remplace le bandeau initial.
  Il utilise `RideModal inApp` (superposition React Native, priorité information),
  sans nouvelle présentation native UIKit. La carte reste montée.
- Boutons « Mettre à jour » (ouvre directement la fiche du store) et « Plus tard ».
  Nouveautés défilables sur petit écran, actions séparées, état de chargement,
  verrou synchrone anti-double appui et erreur locale avec possibilité de réessayer.
  Une ouverture réussie du store reporte aussi le rappel, sans prétendre que
  l’application a effectivement été mise à jour.
- Écran `app/app-update.tsx` : nouveautés, bouton vers le store correspondant au
  téléphone, retour/« Plus tard ». Aucun téléchargement ou installation forcés.
- Le modal peut être reporté de 24 heures ; deux clés de stockage au maximum,
  une par plateforme. Une autre annonce reste indépendante de ce report.
- Lecture de la version **du binaire installé**, pas de la version du manifeste OTA,
  via le module ExpoApplication déjà présent transitivement dans expo-notifications
  et expo-auth-session. Aucun nouveau paquet. Un binaire inconnu/Expo Go ou un
  module absent désactive prudemment ce contrôle.
- Comparaison numérique version puis build, distincte iOS/Android. Les appareils
  déjà à jour ou plus récents ne voient pas d’annonce pour une ancienne version.
- Requête RTK Query seulement sur écran actif, cache une heure, invalidation à la
  réception/ouverture d’un push de mise à jour. Pas de polling permanent.
- Une erreur de vérification masque le modal plutôt que d’affirmer la disponibilité.
  Un retrait peut toutefois rester en cache jusqu’à la prochaine vérification.
- Enregistrement discret plateforme/version/build pour l’utilisateur connecté :
  délai initial 5 s, une seule reprise après 30 s si nécessaire, puis au prochain
  retour au premier plan. Déduplication en mémoire pendant une heure.
- Réutilisation de la permission et du token push existants, sans nouvelle demande
  de permission. Pas d’enregistrement depuis un bundle JavaScript `__DEV__`.
- Liens App Store/Google Play fixés dans le code. Une notification ne peut pas
  imposer une URL externe arbitraire.
- L’écran de mise à jour est public, mais les écrans privés restent protégés par
  la session. Cela permet de consulter le store même après expiration de session.

Fichiers : `features/app-updates/{updatePolicy,nativeVersion}.ts`,
`hooks/{useAppUpdate,useAppUpdateClient}.ts`, `store/api/appUpdatesApi.ts`,
`components/{AppUpdatePrompt,AppUpdateCoordinator}.tsx`, `app/app-update.tsx`.
`AppUpdateBanner.tsx` supprimé et prop `updateNotice` retirée de `HomeHeader`.
Intégration dans `ReduxProvider`, `app/(tabs)/index.tsx`,
`AuthGuard`, `ProtectedAppStack`, `NotificationHandler`,
`utils/notificationNavigation.ts`, et nouveau tag `AppUpdate` dans `baseApi`.

### Backend NestJS

Dans le projet voisin `zwanga-backend` :

- Migration `1780000049000-AddAppUpdates.ts` : catalogue des versions annoncées et
  métadonnées du téléphone courant. Une annonce active par plateforme et une identité
  unique plateforme/version/build. Index et clés étrangères explicites.
- Module `src/app-updates/` : contrôle public de disponibilité, enregistrement
  authentifié du téléphone, liste/publication/retrait réservés aux administrateurs.
- Confirmation explicite de disponibilité exigée par le serveur ; versions
  normalisées et validées, texte limité à 500 caractères, routes sensibles limitées.
- Transactions courtes avec verrou par plateforme pour deux publications concurrentes.
  Republier exactement la même version est idempotent, y compris après retrait :
  cela ne réactive pas une ancienne annonce.
- Préparation de 100 notifications au maximum toutes les 30 secondes, via la file
  transactionnelle existante. Clé unique par annonce et utilisateur ; pas d’appel
  à Expo/FCM pendant une transaction SQL.
- Revalidation avant envoi/reprise : compte actif, plateforme, version, annonce encore
  active et empreinte du token courant. Un token de téléphone remplacé ne reçoit pas
  une annonce ciblée selon les métadonnées de l’ancien téléphone.
- Push ordinaire de type `app_update`, pas de sonnerie conducteur, pas de catégorie
  d’appel ni d’interruption prioritaire. Les notifications de réservation sont conservées.
- Mise en service derrière `APP_UPDATES_ENABLED` (désactivé par défaut).
- Le contrôle public ne renvoie pas l’identité de l’administrateur ayant publié.

Fichiers existants adaptés : `src/app.module.ts`,
`src/database/migrations/index.ts`, `src/notifications/notifications.service.ts`.

### Administration

Dans le **back-office web séparé** `zwanga-admin`, entrée « Mises à jour ».
Il n’existe aucun écran d’administration dans l’application mobile utilisateur :

- Plateforme, version publique, numéro de build et nouveautés.
- Lien de vérification du store et case de confirmation **non précochée** :
  version téléchargeable pour tous les utilisateurs ciblés, sans déploiement progressif.
- Bouton « Annoncer la mise à jour », verrou anti-double envoi, erreurs et résultats
  en français. Les nouveautés/versions modifiées décochent la confirmation.
- Historique des 50 dernières annonces, statut et retrait avec confirmation en ligne.
- Le retrait bloque les futurs envois après revalidation ; il ne rappelle pas un
  push déjà reçu et une requête d’envoi déjà engagée peut encore aboutir.

Fichiers : `app/(admin)/app-updates/{page.tsx,page.module.css}`,
`lib/features/appUpdates/appUpdatesApi.ts`, tag dans `baseApi.ts`,
entrée dans `app/components/admin/Sidebar.tsx`.
Le guide d’interface a conduit à une présentation sobre formulaire/historique,
sans cartes décoratives. Le guide PostgreSQL a orienté les index, l’idempotence,
les lots bornés et l’absence d’appels réseau sous verrou.

## Déclenchement retenu et limites

**Il ne s’agit pas d’un détecteur automatique des publications Apple/Google.**
La disponibilité est confirmée depuis l’administration, puis l’annonce dans l’app
et l’envoi des push sont automatiques. Aucun envoi réel n’a été déclenché pendant
le développement. Les webhooks/connecteurs des comptes développeurs restent différés.

Un statut de publication ne garantit pas à lui seul la disponibilité pour tous
les pays, appareils compatibles ou participants d’un déploiement progressif :
vérifier le déploiement complet avant l’annonce. Ne pas utiliser les versions
TestFlight ou de test Google Play comme annonces publiques.

Le premier binaire comprenant ce mécanisme doit être installé puis ouvert et
authentifié au moins une fois pour enregistrer les métadonnées de ciblage push.
Les anciens binaires qui ne possèdent pas ce code ne peuvent pas être ciblés de
façon fiable par plateforme/version ; **aucune diffusion aveugle à ces appareils**.
Le modèle existant conserve un seul token courant par utilisateur : pas de nouvelle
gestion multi-appareils. Les push dépendent des permissions, du réseau et des OS ;
aucune garantie de livraison immédiate ou exactement une fois par le fournisseur.

Le report 24 h ne planifie pas un réveil natif. L’annonce est réévaluée au retour
dans l’app. Le cache et les lots peuvent introduire un délai. Les notifications
en arrière-plan utilisent le transport push existant, pas un socket permanent.

Le modal ajouté le 7 octobre ouvre le store : **il ne télécharge ni n’installe
directement un binaire**. Sur iOS, l’utilisateur poursuit la mise à jour dans
[l’App Store](https://support.apple.com/en-us/102629). Android dispose aussi d’un
[flux natif Google Play In-App Updates](https://developer.android.com/guide/playcore/in-app-updates),
qui peut télécharger/installer avec consentement. Cette intégration native
supplémentaire est **différée**, aucune nouvelle dépendance n’a été ajoutée.

## Mise en service

1. Backend : relire les migrations en attente, sauvegarder la base et déployer.
   Commandes disponibles : `npm run migration:show`, puis `npm run migration:run`.
   Elles appliquent **toutes les migrations en attente** : ne pas les lancer sans
   revue de l’environnement ciblé. Aucune de ces commandes n’a été lancée sur la base applicative ici.
2. Après migration, activer la configuration serveur `APP_UPDATES_ENABLED` à
   `true` puis redémarrer le backend. Pour arrêter les annonces, désactiver le flag
   ou retirer l’annonce ; ne pas supprimer les tables et leur historique en production.
3. Administration : `npm run build`, puis déploiement habituel.
4. Mobile : préparer les builds habituels `eas build --platform ios --profile production`
   et `eas build --platform android --profile production`, puis circuits de test et stores.
   Aucun build ni soumission n’a été déclenché ici. Aucun ajout natif propre à cette
   correction ; un nouveau build distribué permet de vérifier les vrais numéros installés.
   Les modifications natives des précédentes interventions demandent toujours leur build.
5. Après disponibilité effective : administration → Mises à jour → renseigner les
   valeurs **du build réellement distribué** → confirmer → annoncer séparément
   pour iOS et Android. La numérotation EAS distante peut différer du fichier local.

Attention : le profil EAS `dev` actuel configure iOS en simulateur ; il ne convient
pas à un test push sur iPhone physique. Utiliser un build physique de test approprié
ou TestFlight avec backend de recette. L’enregistrement du ciblage est volontairement
désactivé en `__DEV__` : tester avec un bundle release.

## Vérifications et recette

Tests ajoutés : `tests/appUpdates.test.js`, adaptation des fixtures de routes
publiques et du cycle de vie accueil ; backend `app-updates.spec.ts` et
`app-updates-postgres.spec.ts`.

- Tests backend ciblés : **33 réussis**, dont **6 scénarios sur PostgreSQL 17
  temporaire isolé**, et tests existants notifications/conducteur. Le premier essai
  du cluster a été empêché par le sandbox ; relance autorisée réussie. Le cluster
  et ses données de test synthétiques ont été supprimés après arrêt.
- TypeScript mobile, backend et administration : contrôles sans émission réussis.
- ESLint ciblé des nouveaux fichiers mobiles et du panneau SOS : aucune erreur.
  Contrôle élargi aux fichiers d’intégration : aucune erreur, deux avertissements
  restants (dépendance `dispatch` d’un effet dans `AuthGuard`, import déjà placé
  après des déclarations dans `notificationNavigation`). Ces éléments ne sont
  pas modifiés dans cette correction.
- Contrôle des sources : 1 031 fichiers, aucun au-dessus de 400 lignes.
  Frontière réseau : aucun nouvel appel HTTP hors RTK Query.
- Suite mobile complète après remplacement du bandeau par le modal :
  **1 431 tests réussis, 0 échec** (1 429 avant ce remplacement). Deux fixtures de
  navigation qui énuméraient les anciennes routes publiques ont été adaptées
  pour inclure la route de mise à jour ; les gardes privés restent testés.

Commandes locales de contrôle :

```text
# Mobile
node --test tests/*.test.js
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-source-size.cjs
node scripts/check-network-boundaries.js

# Backend — tests unitaires, PostgreSQL séparé opt-in
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/app-updates/app-updates.spec.ts src/notifications/driver-action-notifications.spec.ts src/notifications/notifications.service.spec.ts
# APP_UPDATES_TEST_POSTGRES_BIN désigne uniquement les binaires PostgreSQL de test :
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/app-updates/app-updates-postgres.spec.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json

# Administration
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Recette **restant à effectuer sur appareils physiques** iOS/Android, backend et
compte de test isolés :

1. Binaire ancien enregistré : annoncer une version supérieure pour sa plateforme,
   vérifier le modal, les nouveautés, le lien store et le report.
2. App fermée/téléphone verrouillé : vérifier le push, puis son ouverture vers
   l’écran de mise à jour. Pas de sonnerie de réservation sur ce push.
3. Installer la version annoncée, rouvrir l’app : absence de modal/push futur.
   Tester aussi autre plateforme, refus de permission et connexion intermittente.
4. Retirer l’annonce avant un envoi et vérifier sa suppression au prochain contrôle ;
   republier la même annonce ne doit pas générer de doublons.
5. Pendant un trajet et une invitation conducteur, vérifier que le modal ne gêne
   pas les actions prioritaires et que les alertes existantes restent fonctionnelles.
6. Sécurité/partage : contrôler texte, grandes polices et SOS inline. Vérifier
   uniquement l’ouverture du composeur ; **ne pas appeler la police pour un test**.

Aucun essai natif, test visuel navigateur authentifié, mesure de chauffe/mémoire
ou validation de disponibilité des numéros de police n’a été réalisé ici.
Ne pas conclure à la disparition des crashs iOS ni à une livraison push réelle.
