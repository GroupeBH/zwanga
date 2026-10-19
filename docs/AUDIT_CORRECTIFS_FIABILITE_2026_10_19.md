# Correctifs de l’audit mobile — 19 octobre 2026

## Périmètre et constats

Ce lot traite les défauts relevés dans l’audit de performance, robustesse et
cohérence UX du mobile, ainsi que la demande de trois couleurs distinctes pour
les actions conducteur de Home. Il ne modifie pas le backend, les données,
les versions natives ni les paramètres privés. Aucun déploiement n’est lancé.

Les défauts confirmés dans le code étaient une rotation de jeton push perdue
pendant un enregistrement occupé, une attente native susceptible de bloquer
définitivement cet enregistrement, un bandeau de synchronisation superposé aux
cartes prioritaires, des contrastes insuffisants sur certains boutons, une
simulation native manquante dans un test et une télémétrie confondant route
visible et écran utilisable. Ce ne sont pas des preuves de la cause des crashs
rapportés sur les téléphones : aucune nouvelle trace native n’a été reproduite.

## Solutions appliquées

### Notifications : reprise bornée et rotation conservée

- `services/pushRegistrationAttempt.ts` borne une tentative à 30 secondes,
  permet son annulation, abandonne les requêtes HTTP dont elle est propriétaire
  et observe les rejets tardifs pour éviter une promesse rejetée non traitée.
  Une opération native ne pouvant pas être annulée peut continuer ; son résultat
  tardif ne valide plus la tentative abandonnée.
- `hooks/auth/usePushRegistration.ts` conserve le dernier jeton reçu pendant
  une tentative, puis le traite à sa sortie. Les rotations intermédiaires sont
  regroupées, sans lancer plusieurs enregistrements concurrents. Un échec de
  rotation invalide l’ancien état de capacité, afin que la reprise reste possible.
  Les résultats d’un ancien compte ou d’une ancienne session sont ignorés.
- `services/pushNotifications.ts` borne la vérification d’autorisation et libère
  le verrou d’attente en cas de problème natif. Une boîte de permission OS encore
  ouverte est partagée entre les reprises, jamais dupliquée. Un choix utilisateur
  déjà terminé n’est pas redemandé en boucle.
- `services/notifeeBackgroundHandler.ts` intercepte les erreurs des actions
  de notification en arrière-plan, notamment stockage, rejet d’une réponse et
  charge utile mal formée. Le callback headless ne rejette plus ces erreurs ;
  le nouveau message de diagnostic est fixe, sans charge utile personnelle.

Conservés : premier enregistrement différé de 1,2 seconde, reprise toutes les
60 secondes seulement au premier plan et en ligne si l’enregistrement est
incomplet, séparation push ordinaire/capacité interactive, jeton Expo sur iOS,
gestionnaire headless requis pour Android data-only et repli v3 vers v2 uniquement
sur refus de validation HTTP 400. Les règles d’acceptation/refus, de sonnerie et
de synthèse vocale ne changent pas. Les refus de permission et réglages système
restent respectés ; aucune garantie de livraison en veille n’est ajoutée.

### Home et boutons : clarté sans nouvelle animation

- `constants/actionColors.ts` centralise les fonds d’action : bleu nuit
  `#1E2A4A`, vert `#12813C`, orange `#D1430F`, avec texte blanc.
- `features/home/homeDashboardTheme.ts`,
  `features/home/HomeTripsSheet.styles.ts` et
  `components/home/HomeTripsSheet.tsx` appliquent **bleu à Publier un trajet**,
  **vert à Chercher un trajet**, **orange à Commander** côté conducteur.
  Les destinations, dimensions, ordre et libellés des boutons sont conservés.
- `constants/styles.ts` et
  `features/request-detail/requestSummaryStyles.ts` utilisent le même orange
  pour leurs boutons pleins concernés. Le contraste calculé texte blanc/fond
  des trois couleurs dépasse 4,5:1. L’orange de marque et le point de localisation
  ne changent pas ; il ne s’agit pas d’une recoloration globale de l’application.
- `components/ActiveRideResumeCoordinator.tsx` expose le statut d’entrée via
  `features/navigation/homeEntryStatusContext.ts`.
  `components/home/HomeEntryStatus.tsx` affiche `EntrySyncBanner.tsx` au début
  du panneau déroulant Home, sans position absolue ni superposition sur la carte.

Conservés : taille et position de la carte, cartes prioritaires, tab bar,
navigateur monté en permanence et budget visuel d’entrée existant. Le bandeau
est visible dans le panneau ouvert ; le repli manuel du panneau le masque aussi.
Les indications ne reposent pas uniquement sur la couleur : textes, icônes et
libellés d’accessibilité restent présents. Aucune dépendance ni animation ajoutée.

### Mesurer un écran disponible plutôt qu’une route

- `components/AnalyticsTracker.tsx` renomme l’ancien événement trop optimiste
  en `app_first_route_visible`.
- `hooks/useMainScreenReady.ts` et `services/mainScreenReadiness.ts` ajoutent
  `app_main_screen_ready` une seule fois par démarrage JS : après layout de la
  vue utile, focus, données minimales disponibles, disparition du cache d’entrée
  et fin des interactions en cours. Les callbacks annulés ne publient rien.
- Branchement sur `components/home/HomeDashboard.tsx`,
  `app/trip/navigate/[id].tsx`, `app/booking/navigate/[id].tsx` et
  `app/request/[id].tsx`. `hooks/request-detail/useRequestDetailController.ts`
  expose l’état de focus existant pour cette mesure.

Cette mesure utilise le début JS existant, pas le lancement natif du processus.
Elle n’attend ni les tuiles de carte ni un fix GPS. Elle ajoute seulement une
catégorie d’écran et un délai, pas d’identifiant de trajet/compte aux paramètres.
Les tableaux de bord utilisant `app_first_screen_ready` doivent être adaptés.
Aucun gain de temps de démarrage réel n’est revendiqué sans mesure sur appareil.

### Contrôle avant builds de production

- `scripts/check-release.cjs` et le script `check:release` de `package.json`
  exécutent TypeScript, ESLint (erreurs), frontières réseau, taille des sources
  et tous les tests Node découverts dans `tests/`, avec concurrence limitée à 2.
  Chaque sous-processus est borné à 20 minutes ; erreur, signal ou code non nul
  font échouer le contrôle. Aucun build ni publication n’est lancé par ce script.
- `.eas/workflows/create-production-builds.yml` ajoute un job `quality` dont
  dépendent les deux builds. La dépendance `needs` bloque les builds de ce
  workflow si le contrôle échoue, conformément à la
  [syntaxe officielle EAS Workflows](https://docs.expo.dev/eas/workflows/syntax/).
  Un `eas build` lancé directement ne passe pas automatiquement par ce workflow.
- `tests/ongoingTripBanner.test.js` simule la frontière native manquante, sans
  supprimer l’assertion métier ni désactiver un test. Les fixtures Home,
  navigation, détail de demande et reprise d’entrée sont adaptées aux nouveaux
  points de mesure et au contexte du bandeau.

## Vérifications

- Tests supplémentaires dans `tests/pushRegistration.test.js` et
  `tests/pushPermissions.test.js` : rotations Android/iOS pendant une opération,
  dernière rotation conservée, blocage de chacune des cinq étapes, reprise après
  échéance, rejet tardif, changement de compte, permission lente et dialogue
  natif partagé. Vérification aussi du cas où le jeton précédent avait réussi
  mais la rotation suivante échoue.
- `tests/releaseAuditFixes.test.js` couvre couleurs/contrastes, styles partagés,
  bandeau non superposé, télémétrie conditionnelle et unique, propagation d’échec
  du contrôle qualité et absence de rejet des actions headless simulées.
- Suite complète Node : **2 224 tests, 2 223 réussis, 0 échec, 1 ignoré**.
  Le test ignoré nécessite Ruby, absent sur cette machine Windows.
- Contrôle agrégé `node scripts/check-release.cjs` (cible de
  `npm run check:release`) : terminé avec code 0. TypeScript `--noEmit`,
  ESLint sans erreur, frontières réseau et contrôle de taille passent :
  1 139 sources contrôlées, aucune au-dessus de 400 lignes. Le passage final
  de la suite Node ci-dessus dure environ 288 secondes sur ce poste ; ce temps
  de tests n’est pas une mesure de performance de l’application. Contrôle
  d’espacement Git et six tests ciblés du lot également réussis.
- Contrôles existants de configuration Android Crashlytics et du bornage des
  lots GPS : réussis. Les tests du bornage compilent/exécutent aussi un petit
  banc Java ; cela ne constitue pas un essai du processus Android réel.
- `validate-ios-crashlytics.cjs` signale que le `ios/Podfile.lock` local ne
  contient pas les pods Crashlytics. Le Podfile, l’autolinking et la phase de
  symboles sont présents, mais le verrou n’a pas été fabriqué sous Windows.

## Limites et recette native restante

Ce lot ne certifie pas l’absence de crash iOS/Android, de chauffe ou de perte de
notification. Les tests utilisent majoritairement des simulations des modules
natifs. Aucun appareil physique, profilage CPU/mémoire, compilation Xcode/Gradle
complète, réception push réelle ou symbolication de crash n’a été validé ici.

Avant diffusion :

1. Sur macOS, résoudre les pods dans `ios` et vérifier le verrou généré ainsi que
   `npm run check:ios-crashlytics`. Conserver le contrôle EAS post-install existant,
   sans le désactiver pour contourner un échec. La mise à jour Didit du lot
   précédent nécessite elle aussi des binaires natifs à jour.
2. Produire des builds Android/iOS et tester connexion, création de compte,
   reprise d’un trajet, annulation passager, KYC et passage veille/premier plan.
3. Tester installation neuve et mise à jour, permission autorisée/refusée,
   réseau coupé/rétabli, demandes/réservations en veille, puis acceptation/refus.
   Confirmer que la sonnerie/synthèse respectent les règles existantes.
4. Sur un Android ARM64 peu doté en mémoire et un iPhone/iPad, contrôler les
   traces Crashlytics/logcat et la réception des symboles avant de conclure sur
   les plantages. Une erreur native ne peut pas être neutralisée par un simple
   `try/catch` JavaScript.

Différés : résolution CocoaPods sur macOS, exécution distante du workflow,
validation visuelle sur appareils, mesures de disponibilité/performance et
diagnostic des crashs natifs à partir de traces du binaire réellement testé.
