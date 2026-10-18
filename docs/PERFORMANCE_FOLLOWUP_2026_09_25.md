# Contre-audit de performance — 25 septembre 2026

**Suivi :** les quatre points ci-dessous ont ensuite reçu les
[correctifs documentés ici](PERFORMANCE_FOLLOWUP_FIXES_2026_09_25.md).
Le texte conserve les constats et résultats au moment de l'audit, avant correction.

## Périmètre et conclusion

Relecture du mobile après les corrections du précédent audit, l'ajout du contact
des réservations et la simplification du portefeuille. Contrôles ciblés des
coordinateurs, GPS, cartes, abonnements RTK Query, lectures d'écran et retrait des
jetons ; lecture des contrats backend locaux de position passager et de retraits.
Ce n'est pas un audit exhaustif du backend ni un profilage natif.

Aucun nouveau défaut P0/P1 confirmé sur les chemins vérifiés. Trois points P2 et
une optimisation P3 restent proposés ci-dessous. Cela ne garantit pas l'absence
de crash : la consommation mémoire, le temps des frames et la chauffe n'ont pas
été mesurés sur téléphone. Les simulations ne donnent pas ces mesures.

**Intervention : documentation uniquement. Aucun correctif applicatif, appel à
la production, changement de paiement ou déploiement dans ce contre-audit.**
Les six défauts du précédent audit ont leurs correctifs documentés dans
[PERFORMANCE_RELIABILITY_FIXES_2026_09_25.md](PERFORMANCE_RELIABILITY_FIXES_2026_09_25.md).

## P2 — 1. Attente GPS manuelle sans délai applicatif

- **Sources :** `hooks/useUserLocation.ts:134`, notamment l'appel à
  `getCurrentPositionAsync` ; `hooks/home/useHomeUserLocation.ts:104`.
- **Problème :** sans dernière position suffisamment récente, « Ma position »
  attend la résolution native sans délai maximum côté application. La position
  de secours n'est utilisée qu'après un rejet, pas pendant une attente prolongée.
  Le chargement du recentrage reste actif tant que cette attente ne se termine
  pas et que l'écran reste actif. Les formulaires de publication/demande utilisent
  aussi cette lecture ponctuelle.
- **Preuve :** hook réel chargé avec les helpers de tests du projet ; GPS simulé
  sans réponse et horloge simulée avancée de quatre minutes : la promesse reste
  en attente. Elle se termine lorsque la simulation fournit une position.
  Cela ne prouve pas qu'un système natif attend toujours quatre minutes.
- **Solution proposée, non appliquée :** borner l'attente, libérer le chargement,
  utiliser une position de secours suffisamment fiable ou afficher un message
  permettant de réessayer ; ignorer les résultats tardifs et dédupliquer les
  tentatives. Un simple `Promise.race` ne suffit pas à annuler le travail natif.
- **À conserver :** flux GPS continu, limites de fraîcheur/précision, choix manuel
  d'une adresse et protections contre un recentrage après changement d'écran.

## P2 — 2. Lectures répétées dans le chemin GPS passager

- **Sources :** `services/passengerBackgroundLocationTask.ts:41` et `:244`,
  `services/background/passengerGpsProfile.ts:28` et `:76`,
  `services/background/passengerTaskLifecycle.ts:8` et `:40`.
- **Problème :** chaque callback actif relit la session dans AsyncStorage, puis
  la relit lors de l'application du profil. Même si le profil est inchangé,
  `hasStartedUpdates()` vérifie encore la disponibilité de TaskManager et
  l'existence de la tâche native avant de consulter la clé de profil appliquée.
- **Preuve :** tâche et gestionnaire réels, stockage et API natives simulés,
  session active inchangée, envoi réseau volontairement court-circuité par la
  protection d'envoi en cours. Pour **100 callbacks** après démarrage :
  **200 lectures AsyncStorage, 100 vérifications TaskManager et 100 vérifications
  Location**, sans aucun redémarrage natif. Il s'agit de nombres d'appels, pas
  de millisecondes CPU ou d'une mesure de batterie.
- **Solution proposée, non appliquée :** conserver la session en mémoire dans le
  même runtime, actualisée à chaque écriture/arrêt, et vérifier l'état natif aux
  changements de session, à la reprise et à une cadence bornée de récupération.
- **À conserver :** sérialisation, protection contre les anciens callbacks,
  redémarrage après perte effective de la tâche, passage du GPS économe au GPS
  précis et arrêt à la fin du transport. Ne pas simplement supprimer les contrôles.

## P2 — 3. Abonnements RTK Query conservés après vérification d'identité

- **Source :** `store/api/userApi.ts:20`, `:26`, `:36`, `:83` et `:97`.
- **Problème :** les rafraîchissements impératifs du profil et du statut d'identité
  utilisent `initiate(..., { forceRefetch: true })` sans `subscribe: false` et
  sans `unsubscribe()`. Chaque appel laisse un abonnement jusqu'au nettoyage du
  cache global, même après sortie du parcours. Les invalidations peuvent donc
  encore rafraîchir ces lectures sans consommateur d'écran.
- **Preuve :** callbacks réels de `userApi.ts`, store et middleware RTK réels,
  transport et dépendances d'identité simulés. Dix synchronisations réussies,
  mutations libérées après chaque appel : **10 abonnements profil + 10 statut
  d'identité restent présents**. Aucune requête réelle et aucun token utilisés.
- RTK déduplique les requêtes de même clé : vingt abonnements ne signifient pas
  vingt appels HTTP simultanés. Le défaut concerne leur durée de vie et le cache
  maintenu artificiellement actif, pas une boucle réseau infinie démontrée.
- **Solution proposée, non appliquée :** lectures impératives non abonnées ou
  libération systématique en `finally`, puis simplification des invalidations
  redondantes avec un test comptant les abonnements après plusieurs synchronisations.
- **À conserver :** renouvellement d'authentification et actualisation du profil,
  du statut d'identité et de l'éligibilité conducteur après validation.

## P3 — 4. Polling des retraits sans opération à suivre

- **Source :** `hooks/wallet/useWalletWithdrawal.ts:45`, notamment `:52`.
- **Problème :** lorsque l'écran est actif et la configuration de retrait existe,
  l'historique est interrogé toutes les 30 secondes, même vide ou entièrement
  terminé, et même lorsque la section visuelle est repliée.
- Le polling est bien suspendu hors écran ; ce n'est pas un polling global au
  repos. L'endpoint backend est borné à 50 entrées : pas d'historique illimité
  constaté ici. L'ordre de grandeur configuré est deux interrogations par minute
  d'écran actif, hors chargement initial et invalidations.
- **Solution proposée, non appliquée :** première lecture conservée, polling
  conditionné aux opérations non terminales ou à une intention incertaine ;
  rafraîchissement au retour sur l'écran et après mutation.
- **À conserver :** reprise idempotente des retraits incertains, rapprochement
  d'une réponse perdue, actualisation des montants et erreurs visibles.

## Vérifications et limites

- `tsc --noEmit --incremental false` : réussi.
- Suite JavaScript complète : **1 019 tests, 1 016 réussis, 3 échoués**.
  - Deux assertions historiques de `tests/sourceExtractions.test.js` : empreinte
    des styles de réservations ; empreinte de `userApi` pour le parcours PIN.
    Elles comparent d'anciennes signatures aux sources actuelles. Vérifier les
    changements attendus avant de réviser ces références, sans les régénérer aveuglément.
  - `tests/tripListCards.test.js:115` : le mock fournit encore les anciens setters
    de contact, alors que le composant utilise `setContactBookingId`. Ce setter
    existe bien dans `useManageTripState`. Mettre le test et ses assertions à jour,
    en gardant la vérification du destinataire et des conditions d'annulation.
    Cet échec ne démontre pas un crash du bouton dans l'application réelle.
- Reproductions ponctuelles GPS/RTK exécutées en mémoire : résultats ci-dessus ;
  elles ne sont pas ajoutées comme tests de régression permanents dans cet audit.
- Frontière réseau : réussie, aucun HTTP direct hors RTK Query détecté.
- Taille des sources : **947 fichiers contrôlés, aucun au-dessus de 400 lignes**.
- Carte d'accueil conditionnelle hors écran, GPS partagé, protections de fin de
  transport et pagination du portefeuille toujours présents ; pas de régression
  identifiée sur ces protections par les vérifications effectuées.
- Aucun essai prolongé iPhone/Android, mesure Instruments/Perfetto, validation
  d'APK/AAB de release ou inspection Crashlytics de production dans cette passe.
  Avant publication : tester un trajet long, veille/reprise, plusieurs passagers,
  réseau coupé/rétabli, paiement et fermeture des modals, puis navigation entre
  onglets après fin de trajet. Mesurer mémoire, CPU et fluidité sur une release.
