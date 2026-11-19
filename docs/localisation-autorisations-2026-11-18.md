# Localisation et autorisations — 18 novembre 2026

## Périmètre et constats

Signalement de production sur Android et iPhone : point choisi perdu dans le sélecteur après appui sur « Ma position » (précision apportée par l’utilisateur), absence de parcours clair pour réactiver la localisation, autorisations arrière-plan/plein écran mal reconnues. Pas de reproduction instrumentée sur les téléphones concernés ; les défauts ci-dessous sont établis par lecture du code et tests JavaScript.

- Le formulaire de commande démontait `LocationPickerContent` dès que `isScreenActive` devenait faux. Une fenêtre système pouvait ainsi détruire le brouillon local avant son retour.
- Les raccourcis Maison/Travail effaçaient également leur sélection sur une simple interruption de l’application, sans distinguer celle-ci d’un changement de route.
- Le délai de 15 secondes du bouton de position englobait le temps de réponse à la permission système. Cette demande ne passait pas par le verrou partagé des autorisations.
- Les autorisations arrière-plan et plein écran étaient relues à la variation de la propriété `active`, mais pas lors d’un cycle Android `blur`/`focus` sans changement d’AppState, ou d’une interruption trop brève pour être rendue par React.

## Solutions appliquées

- `components/trip-request/HomeRequestScreen.tsx` garde le brouillon du sélecteur monté, tout en suspendant la carte native. `hooks/location-picker/useLocationPicker.ts` recentre la carte sur le dernier point sélectionné au retour. Une confirmation refusée explicitement par le formulaire ne ferme plus le sélecteur (`hooks/trip-request/useHomeRequestFlow.ts`).
- `components/home/HomeDestinationShortcuts.tsx` distingue l’interruption système du changement de route/session. La validation reste interdite hors écran actif ; l’état est effacé lors d’une vraie navigation ou d’un changement de compte.
- `services/foregroundLocationAccess.ts` sépare permission refusée, permission bloquée et GPS désactivé. Lectures natives bornées à huit secondes ; dialogue humain sans limite artificielle ; acquisition GPS conservant ses propres délais et son annulation.
- `hooks/location-picker/useLocationRecovery.ts`, `components/location/LocationRecoveryAction.tsx`, `components/LocationPickerModal.tsx` et `components/home/HomeLocationButton.tsx` ajoutent une action de réactivation. L’accueil vérifie l’accès avant de se recentrer ; si nécessaire, il affiche une explication et un bouton dédié avant d’ouvrir les réglages. Après une ouverture explicite des réglages, le retour relit l’état réel et relance la position seulement si l’accès est effectivement accordé. Un choix manuel sur la carte annule cette reprise GPS.
- Android : réglages de localisation du téléphone si le GPS est désactivé, réglages de l’application si sa permission est bloquée. iOS : réglages publics de l’application et indication du chemin vers le service global de localisation ; aucun lien privé ni activation forcée du GPS.
- `hooks/usePermissionReturn.ts` observe les retours `change` et Android `blur`/`focus`, sans polling, ouverture de l’application ou demande automatique de permission. Utilisé par `useNearbyLocationPermission.ts` et `useDriverFullScreenPermission.ts` pour relire les droits réels. `hooks/useUserLocation.ts` partage désormais le même verrou de dialogue avec le sélecteur et les parcours arrière-plan.
- `components/home/HomeDashboard.tsx` transmet l’activité réelle au bouton de position et recrée sa récupération lors d’un changement de compte. `features/location-picker/locationAccessMessage.ts` centralise les explications selon la plateforme. Le point et les adresses restent modifiables manuellement lorsque les autorisations sont refusées.

## Comportements conservés

Pas de modification des services de livraison des alertes, des canaux Notifee, de la sonnerie, de l’arrêt audio, des boutons Accepter/Ignorer, de la politique plein écran native ni des tâches GPS de trajet. Aucun changement backend, de base, de version, de configuration native ou de production.

Le consentement arrière-plan reste explicite, facultatif et lié au compte. Ouvrir les réglages ne vaut jamais autorisation. Un retour ne démarre pas le suivi conducteur sans consentement. Une version sans plein écran continue de renvoyer un état indisponible ; iOS ne sollicite pas l’autorisation Android. La nouvelle action GPS ne demande que la permission au premier plan.

## Vérifications et limites

- Suites ciblées : conservation du brouillon/caméra, validation refusée, choix manuel prioritaire sur GPS tardif, refus permanent, GPS coupé, double appui, délai humain de deux minutes, lecture bloquée, retour sans changement d’AppState, consentement arrière-plan, retrait de permission et invalidation au démontage/changement de compte.
- TypeScript `--noEmit` et ESLint ciblé réussis. Premiers ensembles ciblés : 107 puis 99 tests réussis. Le sélecteur compte ensuite 24 tests réussis, dont le parcours exact « Ma position » : attente de deux minutes dans la permission native simulée, réception GPS avant le retour React à l’état actif, conservation du point et transmission unique au formulaire.
- Premier contrôle intégral : 4 047 tests, 4 044 réussis, deux échecs, un ignoré. Les deux échecs de `tests/performanceGpsPlaces.test.js` provenaient de simulations natives incomplètes après l’ajout de la lecture de permission/GPS : ajout de `getForegroundPermissionsAsync`, `hasServicesEnabledAsync` et `AppState`. Aucune assertion de libération des watchers ou de priorité du choix manuel n’a été retirée ; les dix tests de cette suite repassent.
- **Contrôle intégral final : `node scripts/check-release.cjs` terminé avec le code 0.** Compatibilité URI/Metro, parité des sources natives, TypeScript, ESLint (erreurs), frontières réseau et taille des sources réussis. Suite complète : **4 048 tests, 4 047 réussis, aucun échec, un ignoré** (politique Ruby, Ruby absent sous Windows). Le parcours « Ma position » ajouté après la précision utilisateur est inclus. Journal local : `.expo/location-permission-release-check-final-2026-11-18.log`. ESLint ciblé sans avertissement et diff contrôlés également.
- Les tests utilisent les modules réels avec interfaces natives simulées. Ils ne certifient ni la délivrance push en production, ni les réglages de chaque constructeur Android, ni le fonctionnement en veille d’un iPhone.
- Environnement local : Node 24.11.0 sous Windows ; `package.json` demande Node `>=24.22.1 <25`. La validation locale ne remplace donc pas le contrôle sur l’environnement de compilation cible.
- À la fin du contrôle statique initial, l’émulateur Android était détecté mais aucun serveur Metro n’était actif ; aucun parcours natif n’était alors validé. Une [recette connectée ultérieure sur émulateur](tests-localisation-autorisations-2026-11-18.md) complète désormais ce contrôle, avec ses propres résultats et limites. Aucun essai physique Android/iPhone, aucune compilation native ni aucun déploiement effectué.
- À valider sur appareils avant diffusion : sélection puis permission/retour réglages, GPS global coupé/réactivé, refus puis autorisation « Toujours », plein écran Android 14+ activé puis retiré, réception d’une commande écran verrouillé et arrêt de sonnerie à l’acceptation.

Références : [événements AppState React Native](https://reactnative.dev/docs/0.81/appstate), [restrictions plein écran Android 14](https://developer.android.com/about/versions/14/behavior-changes-14#secure-fsi). Les méthodes Expo utilisées ont été vérifiées dans la dépendance installée `expo-location` 19.0.8 ; la documentation Expo publique consultée redirigeait vers une version plus récente.
