# Audit performance et stabilité native — 7 octobre 2026

> Suivi du 7 octobre : les correctifs S01–S03 et les contrôles de compilation S04
> sont décrits dans [les correctifs appliqués](CORRECTIFS_STABILITE_PRODUCTION_2026_10_07.md).
> Ce rapport conserve les constats avant correction. La synchronisation iOS et la
> recette native release restent à réaliser ; elles ne sont pas déclarées validées.

## Périmètre et limites

Audit du mobile dans son état local, y compris les modifications non commitées :
démarrage, modaux, cartes et itinéraires, GPS, événements socket, notifications,
caméra, caches, configuration de compilation et diagnostics.

Aucun correctif applicatif, changement de dépendance, migration, déploiement,
opération financière ou modification de compte n'a été effectué. Seuls ce rapport
et sa référence dans le journal sont ajoutés. Les travaux déjà présents sont conservés.

Les constats ci-dessous sont issus du code et de tests JavaScript avec entrées
synthétiques. Aucun crash natif iOS ou Android de production n'a été reproduit.
Ni les rapports Crashlytics/App Store/Play Console, ni un artefact release récent
n'ont été analysés. Seul un APK debug est présent dans les sorties Android locales.
Il ne permet pas de valider le binaire des stores.

## Points à corriger ou renforcer

### S01 — Priorité haute : terminer la sécurisation des transitions de réservation

**Constat confirmé dans le code :**

- `hooks/trip-detail/useTripBookingSubmission.ts:275` ferme le formulaire et
  ouvre le succès dans la même continuation asynchrone (`:283`).
- `features/trip-detail/TripBookingSuccessModal.tsx:22` utilise directement le
  `Modal` React Native, contrairement au formulaire utilisant `FormModal`/`RideModal`.
  Ce succès ne participe donc pas à l'arbitrage commun des overlays. Il n'a pas de
  `onRequestClose` pour le retour Android.
- `hooks/trip-detail/useTripBookingWizard.ts:146` ferme ce succès et appelle
  immédiatement `router.push`, sans attendre sa fermeture native.
- Les temporisations d'ouverture/restauration du sélecteur de position (`:67`,
  `:79`) n'ont pas d'annulation ni de contrôle de génération/focus.

**Vérification JavaScript :** le vrai hook, chargé avec React et les minuteries
simulés, exécute fermeture puis navigation immédiatement. Une ouverture de sélecteur
différée reste exécutée après fermeture du formulaire. Cela confirme l'ordre des
actions, pas une exception UIKit.

**Impact possible :** présentation concurrente avec une fermeture native iOS,
écran ou modal bloqué, sélecteur rouvert après annulation/changement de parcours.
Le crash iOS reste une hypothèse à tester sur appareil.

**Solution proposée, non appliquée :** faire participer le parcours complet à un
overlay de portée écran, ou séquencer explicitement les présentations et la navigation
sur la fermeture effective ; supprimer/annuler les temporisations obsolètes ;
ajouter le retour Android. Conserver la confirmation serveur, les verrouillages de
soumission et les choix du passager. Ne pas simplement augmenter un délai arbitraire.

Référence native : [React Native Modal](https://reactnative.dev/docs/modal.html)
documente `onDismiss` et `onRequestClose`.

### S02 — Priorité moyenne : borner et valider les itinéraires des formulaires

**Constat :** `utils/routeApi.ts:25` décode intégralement la polyline sans budget
de longueur ou validation des coordonnées décodées, puis la conserve (`:247`,
`:255`). Le cache est bien limité à 64 entrées, mais pas en poids par itinéraire.
Les fonctions `getRenderableRouteCoordinates` des modèles publication/demande
retournent ce tableau sans réduction. Leur cadrage utilise
`Math.min(...latitudes)`/`Math.max(...)` :

- `features/publish/publishModel.ts:65`, `:98` ;
- `features/trip-request/requestFormModel.ts:232`, `:265`.

**Vérification synthétique du vrai code :** une réponse factice de 150 000 points
conserve 150 000 points jusqu'à l'aperçu de publication ; le calcul du cadrage lève
un `RangeError` sous Node. Une polyline factice décodant une latitude hors plage
est également acceptée par `getRouteInfo`.

**Limite :** ces réponses ont été fabriquées pour éprouver les limites. Rien ne
prouve que le serveur réel envoie de tels tracés, et le seuil exact sous Hermes
n'a pas été mesuré. Il ne s'agit pas d'un crash natif démontré.

**Solution proposée :** décodeur partagé avec validation structurelle/coordonnées,
limite d'entrée et de points, réduction avant stockage et rendu, bornes calculées
par boucle plutôt que par expansion d'arguments ; repli explicite sur un aperçu
simple si le tracé est invalide. Préserver les extrémités et ne pas réutiliser un
tracé simplifié pour modifier la tarification ou les règles d'embarquement.
Les décodeurs de navigation conducteur/passager ont déjà des protections de
coordonnées et une réduction ; ne pas annoncer leur absence partout.

### S03 — Priorité moyenne : protéger la frontière socket avant distribution

**Constat :** `services/trackingSocket.ts:174` suppose que `payload.locations`
est un tableau et appelle directement `forEach`. Les protections entourant chaque
listener ne protègent pas cette étape préalable. Les types TypeScript ne valident
pas les données reçues à l'exécution.

**Vérification JavaScript :** avec un transport simulé et le vrai service,
`passenger_locations` recevant `{ locations: {} }` lève un `TypeError` hors du
callback. Aucun paquet de ce genre n'a été observé sur le serveur réel.

**Point connexe :** `services/chatSocket.ts:30` distribue les messages sans isoler
les exceptions entre listeners ; une exception d'un abonné interrompt les suivants.
Ce second point est constaté statiquement, non reproduit sur appareil.

**Solution proposée :** valider le conteneur et chaque entrée avant diffusion,
borner les lots, ignorer une entrée invalide sans perdre les entrées valides,
isoler les abonnés et tracer une erreur technique limitée sans contenu personnel.
Conserver les protections de session et la reconnexion existantes. Ajouter des
tests de lots absents, mal typés, mixtes et surdimensionnés.

### S04 — Priorité de validation avant release : étendre les contrôles natifs

**Constat confirmé :** `scripts/validate-android-native.cjs:5` contrôle la présence
de trois bibliothèques centrales par ABI. Il vérifie l'en-tête ELF de
`libc++_shared.so`, mais pas les segments ELF de toutes les bibliothèques natives,
ni leur alignement 16 Ko ou celui de l'APK. Un résultat positif n'est donc pas une
certification complète de compatibilité des SDK natifs embarqués.

**Solution proposée :** vérifier toutes les bibliothèques des artefacts release,
les alignements ELF et APK ainsi que le chargement réel sur environnement 16 Ko.
Ce rapport ne conclut pas qu'une bibliothèque embarquée est incompatible.
Procédure officielle : [Android — prise en charge des pages 16 Ko](https://developer.android.com/guide/practices/page-sizes).

**Observation iOS à vérifier :** le `Podfile.lock` local et le projet Xcode ne
contiennent pas encore l'intégration Crashlytics que le package JavaScript déclare.
Un prochain `pod install` peut synchroniser le module et sa phase de configuration
par autolinking : cette différence ne prouve pas son absence du dernier binaire
store. `services/diagnostics.ts:18` rend le reporter optionnel si son chargement
échoue ; la vérification doit donc porter sur une archive release et la réception
effective d'un événement de test, avec symboles exploitables, pas uniquement sur
la présence de la dépendance npm. Ne pas déclencher un crash sur un compte/app de
production utilisé normalement.

Référence : [React Native Firebase — Crashlytics](https://rnfirebase.io/crashlytics/usage).

## Vérifications effectuées

| Contrôle | Résultat réel |
| --- | --- |
| `node --test ./tests/*.test.js` | 1 507 tests réussis, 0 échec, 0 ignoré ; environ 99,4 s |
| `npx.cmd tsc --noEmit` | Réussi |
| `node scripts/check-network-boundaries.js` | Réussi : aucun HTTP direct hors frontière RTK Query selon ce contrôleur |
| `node scripts/check-source-size.cjs` | 1 040 sources, aucune au-dessus de 400 lignes |
| `node scripts/validate-android-crashlytics.js` | Configuration Gradle acceptée ; pas une preuve de réception des rapports |
| Probes synthétiques du vrai code, transport/React/minuteries simulés | S01 : séquence immédiate et ouverture différée non annulée ; S02 : `RangeError` et coordonnée hors plage acceptée ; S03 : `TypeError` |
| `node scripts/benchmark-driver-route.cjs` | 8 000 points / 500 positions : ancien calcul 978 ms, calcul indexé 8 ms, construction comprise |
| `node scripts/benchmark-passenger-route.cjs` | 8 000 points / 500 positions : ancien calcul 2 161 ms, calcul actuel 440 ms, construction comprise |

Les benchmarks sont des mesures Node synthétiques sur cette machine, une seule
exécution : pas des mesures de fluidité, chauffe, batterie ou mémoire iOS/Android.
Le script temporaire des probes a été retiré après exécution ; aucune donnée
réseau réelle ni authentification n'y était utilisée.

Protections existantes vérifiées, à conserver : suivi GPS partagé avec nettoyage,
libération des cartes de navigation hors écran, remise à zéro des mutations GPS,
garde de cycle de vie de la caméra de profil, cache de routes borné en nombre,
optimisations géométriques, pagination/virtualisation de la messagerie et service
Notifee de premier plan désactivé pour la notification de trajet en cours.
L'ancien `KycWizardModal` n'a pas de consommateur trouvé dans les parcours inspectés :
ses limites ne sont pas présentées comme une cause active de crash.

## Validation native restante

1. iPhone physique, archive release/TestFlight : réserver puis ouvrir immédiatement
   Mes réservations ; aller/retour sélecteur de position ; notification entrante
   pendant un modal ; caméra/WhatsApp puis retour. Répéter avec réseau lent.
2. Android release, appareil modeste et environnement 16 Ko : mêmes parcours,
   retour matériel/gestuel, carte et notification en veille, refus/révocation GPS,
   rotation et reprise après arrière-plan.
3. Session de navigation prolongée : mémoire, images/cartes natives, CPU, images
   perdues, ANR et consommation avec instruments natifs. Confronter les mesures
   aux rapports symboliqués de la version exacte déployée.

Aucune disparition de crash ou amélioration native mesurée n'est annoncée. Les
solutions S01–S04 sont des propositions à implémenter après accord.
