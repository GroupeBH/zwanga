# Journal des changements techniques

Ce journal commence le 22 septembre 2026. Chaque nouvelle modification doit
décrire le problème, la solution appliquée, les fichiers concernés et la validation.
Il ne prétend pas reconstituer les interventions antérieures non documentées.

Documents complémentaires déjà présents :

- [Caméra de navigation et consommation GPS](NAVIGATION_CAMERA_AND_GPS.md)
- [Réduction du travail des écrans inactifs](SCREEN_IDLE_PERFORMANCE.md)

## 22 septembre 2026 — Charge JavaScript de la navigation conducteur

### 1. Recherche répétée sur toute la géométrie du trajet

**Problème.** À chaque mise à jour visuelle acceptée, le listener cherchait le
segment donnant le cap via `getRouteAlignedPosition`, puis parcourait encore
la route via `distanceFromCoordinateToPolyline` pour détecter une déviation.
La recherche de progression utilisée par l'alerte de prise en charge parcourait
aussi la route et recalculait sa longueur. Ce coût croissait avec le nombre de points.

**Solution appliquée.** Une analyse géométrique commune, locale à l'écran :

- `utils/navigation/routeSegmentIndex.ts` construit un arbre équilibré de boîtes
  englobant les segments, une seule fois par géométrie/contexte. Pas de tri ni
  de copie des sous-tableaux ; construction en O(N).
- `utils/navigation/routeAnalysis.ts` normalise la route et précalcule ses
  distances cumulées. La progression devient une lecture du préfixe plus la
  distance partielle sur le segment, sans reconstruire toute la portion parcourue.
- La recherche commence autour du dernier segment trouvé, puis examine toutes
  les branches pouvant contenir un meilleur candidat. Elle n'est PAS limitée
  à une fenêtre en avant : demi-tours, croisements, routes parallèles et sauts
  de position ne sont pas exclus de la recherche globale.
- Une branche n'est éliminée que si sa boîte est en dehors du rayon englobant
  les deux meilleures distances connues. Une marge de 1 cm protège les arrondis.
- Les deux formules antérieures sont conservées : projection du cap et projection
  métrique pour progression/déviation. Les remplacer l'une par l'autre aurait
  pu déplacer les seuils de décision. En cas d'égalité, le premier segment gagne,
  comme dans les anciennes boucles. La règle existante des 2 m pour le point de
  progression est également conservée.

**Cache et cycle de vie.** `useDriverNavigationRefs` possède un seul cache par
écran : une route, un index, des distances cumulées et au maximum deux résultats
de positions (conducteur et point fixe de prise en charge). Ce cache ne contient
aucun historique de trajets et ne déclenche ni rendu React, ni action Redux,
ni requête réseau. Remplacer le tableau de route ou changer le contexte
`tripId:destinationId` invalide le cache. Après plus de 10 secondes sans analyse,
les résultats et l'indice de proximité sont réinitialisés ; l'index reste réutilisable.
À l'avenir, les routes doivent continuer à être remplacées, pas mutées sur place.

**Intégration.** `features/driver-navigation/driverLocationListener.ts` consomme
le résultat commun pour le cap et la déviation. `utils/navigation/routeProgress.ts`
exporte sa projection existante sans modifier son calcul. Les anciennes fonctions
restent disponibles pour les autres consommateurs et servent de références aux tests.

**Limites.** Une géométrie très imbriquée peut encore nécessiter O(N) examens.
Le nombre de résultats retenus est borné à deux, mais l'index lui-même est O(N).
Les coordonnées restent limitées à la RDC par la normalisation existante : cet
index n'est pas une nouvelle implémentation mondiale traversant l'antiméridien.

### 2. Calcul prématuré lors de la détection d'une prise en charge dépassée

**Problème.** `useDriverNavigationDestination` calculait la progression avant
même de vérifier si une prise en charge était concernée ou si le conducteur
s'était suffisamment approché puis éloigné. Le même point fixe était reprojeté.

**Solution appliquée.** Dans
`hooks/driver-navigation/useDriverNavigationDestination.ts`, les vérifications
rapides précèdent maintenant la géométrie : arrêt actif, passager non encore
embarqué/déposé, alerte non présentée, proximité observée et éloignement suffisant.
L'analyse de la position du conducteur et du point de prise en charge utilise
ensuite le cache commun. Le point fixe est réutilisé tant qu'il reste dans ce cache.

**Comportements conservés.** Chaque position validée continue de passer par les
vérifications métier, même si la carte n'est pas redessinée. Les seuils existants
(approche à 90 m, éloignement à 160 m, progression de 120 m), le recours au cap
en l'absence de route, l'alerte et son action restent inchangés. Aucun ralentissement
du flux d'embarquement ou de dépose n'a été ajouté.

### 3. Animation du marqueur trop longue sur le thread JavaScript

**Problème.** L'animation de 750 ms utilisait `useNativeDriver: false` et fournissait
aussi `latitudeDelta` et `longitudeDelta`, inutiles pour déplacer le marqueur.
Cette animation partage le thread avec le suivi et les interactions utilisateur.

**Solution appliquée.** Dans `driverLocationListener.ts`, sur iOS et Android :

- durée réduite à 250 ms, uniquement sur latitude et longitude ;
- `isInteraction: false` pour ne pas maintenir un verrou d'interaction pendant
  cette animation ; cela ne la déplace PAS sur le thread natif ;
- placement immédiat lors du premier point et après une interruption prolongée
  des mises à jour, au lieu d'animer depuis une ancienne position ;
- annulation de l'animation précédente conservée ; callback de fin protégé pour
  qu'une ancienne animation ne puisse pas effacer la référence d'une plus récente ;
- cadence visuelle de 2 secondes, seuil de mouvement de 2 m et arrêt des
  animations en arrière-plan conservés.

La déclaration TypeScript de `AnimatedRegion.timing` dans la version installée
de react-native-maps (1.20.1) exige une région complète, alors que son implémentation
n'anime que les propriétés fournies. Une assertion locale commentée permet
d'omettre les deux deltas, sans élargir les types du reste du projet.

**Piste différée.** Le passage Android à `animateMarkerToCoordinate` n'a PAS
été activé : l'implémentation installée démarre un `ObjectAnimator` sans exposer
sa poignée d'annulation. Remplacer directement le chemin actuel ferait perdre
la maîtrise des animations au changement d'écran ou de course. Ce changement
natif nécessite un travail séparé et des essais sur Android physique.

### 4. Vérification et mesure reproductibles

**Problème.** Un index plus rapide n'est utile que s'il conserve les décisions
et si son gain peut être mesuré sans confondre CPU JavaScript et rendu natif.

**Solution appliquée.** Ajout de tests différentiels et d'un benchmark :

- `tests/routeAnalysis.test.js` compare les résultats aux anciennes fonctions
  exhaustives : longues routes, marche arrière, points éloignés, croisements,
  routes parallèles, égalités, doublons, segments courts, coordonnées invalides,
  seuils de recalcul et invalidation du cache. Inclut 500 comparaisons sur des
  routes pseudo-aléatoires reproductibles.
- `tests/driverPickupAnalysis.test.js` vérifie que les cas non éligibles ne
  déclenchent aucun calcul de géométrie, que le point fixe est réutilisé et que
  les alertes existantes sont conservées, y compris sans route.
- `tests/driverLocationListener.test.js` vérifie l'animation, les callbacks
  tardifs, la reprise, les fréquences métier, ainsi que le recalcul après deux
  positions hors route et son délai minimal de 12 secondes.
- `scripts/benchmark-driver-route.cjs` et `npm run benchmark:driver-route`
  comparent l'ancien double parcours au nouvel index, construction comprise.
  `npm run test:navigation` inclut désormais les nouveaux tests de géométrie
  et de prise en charge.

Mesure locale Node.js sur une trace synthétique de **8 000 points / 500 positions
distinctes**, le 22 septembre 2026 :

| Mesure | Ancien double parcours | Analyse indexée |
| --- | ---: | ---: |
| Temps total | 2 570 ms | 33 ms, construction comprise |
| Projections de segments | 7 999 000 | 18 992 |

Ce scénario n'est ni un trajet enregistré, ni une garantie de gain identique
sur toutes les routes. Il ne mesure pas la mémoire native, les FPS de la carte,
la batterie ou la température d'un iPhone/Android. Aucun test chronométrique
fragile n'est imposé dans la suite : le test de coût vérifie le nombre de segments.

### 5. Documentation systématique des prochains changements

**Problème.** Les corrections successives doivent rester explicables et traçables.
**Solution appliquée.** Création de ce journal et d'un `AGENTS.md` à la racine
qui demande, pour chaque future intervention, le problème, la solution réellement
appliquée, les fichiers, les vérifications et les limites. Cette règle ne modifie
aucun comportement de l'application.

### Invariants et périmètre

- Pas de modification du backend, des requêtes RTK Query, des sockets ou des
  données persistées ; aucun nouveau timer ni abonnement GPS.
- Validations GPS, cadence d'envoi au serveur, suivi métier, instructions,
  détection de déviation et recalcul automatique restent en place.
- Pas de modification des paiements, des modals, de la navigation passager,
  des réglages de gel/détachement Android ou des permissions.
- Aucun secret ou fichier `.env` n'est utilisé dans les tests ou la documentation.

### Validation native restante

Avant généralisation, comparer deux builds release sur le même téléphone et le
même parcours, dont un Android modeste et un iPhone. Faire une navigation de
30–60 minutes avec plusieurs prises en charge/déposes, recalcul hors route,
demi-tour, réseau lent, modals, passage en veille/reprise et sortie de navigation.
Relever fluidité, CPU, mémoire et chauffe. Vérifier que l'animation raccourcie reste
lisible. Les tests JavaScript ne permettent pas d'annoncer l'absence de freeze/crash.

### Résultats des contrôles

- TypeScript : réussi (`node node_modules/typescript/bin/tsc --noEmit`).
- ESLint ciblé : réussi, sans erreur ni avertissement.
- Navigation ciblée : 55 tests réussis sur 55 (`npm run test:navigation`).
- Frontières réseau : réussi, aucun HTTP direct hors RTK Query.
- Taille : les fichiers applicatifs de cette intervention sont sous 400 lignes ;
  le contrôle global signale toujours `app/wallet.tsx` à 414 lignes, hors périmètre.
- Suite complète : **682 tests réussis sur 684**
  (`node --test --test-concurrency=2 tests/*.test.js`). Les deux échecs sont
  les snapshots déjà en défaut dans `tests/sourceExtractions.test.js` : styles
  de `features/screen-styles/app/bookings/index.ts` et endpoints PIN de
  `store/api/userApi.ts`. Ces fichiers et leurs snapshots ne sont pas modifiés
  par cette intervention ; ils restent à traiter séparément.
- `git diff --check` : réussi.

## 22 septembre 2026 — Surveillance globale de l'activité personnelle

**Problème.** Plusieurs coordinateurs et hooks d'accueil relisaient périodiquement
les listes personnelles, y compris sans trajet actif. La déduplication RTK
ne supprimait pas le coût des listes ni tous les rendus liés au chargement.

**Solution appliquée.** Endpoint authentifié `/api/v1/me/activity` dans le backend,
un coordinateur RTK mobile (60 s au repos / 30 s en activité), empreintes par
catégorie et relecture uniquement des catégories modifiées ou en échec.
Sélecteurs minimaux pour les abonnés globaux ; suppression de la double relance
AppState du coordinateur GPS ; signal de préarmement passager ; cohérence de la
lecture d'activité des réservations en contournant son ancien cache de liste.

**Précautions.** Lectures initiales, reprise du paiement, tâches GPS natives,
mutations, sockets, annonces visibles et pollings des détails/listes dédiés
conservés. Erreurs réessayées sans vider l'état connu, changement de compte
protégé, lectures concurrentes regroupées. Repli sur les anciens pollings si
le nouveau backend n'est pas encore déployé (404/405 uniquement).

**Documentation détaillée.** [Coordination de l'activité personnelle](ACCOUNT_ACTIVITY_COORDINATION.md)
décrit les problèmes et solutions par fichier, le contrat, les cadences, les
limites SQL, la compatibilité, les tests et l'ordre de déploiement backend/mobile.

**Validation.**

- Neuf tests mobiles ciblés et onze tests backend ciblés réussis (quatre suites).
- TypeScript mobile/backend et ESLint ciblé : réussis.
- Suite mobile complète : **691 tests réussis sur 693**. Les deux échecs restent
  ceux constatés avant cette intervention dans `tests/sourceExtractions.test.js`
  (styles de réservations et empreintes des endpoints PIN). Aucun snapshot
  n'a été remplacé pour masquer ces écarts.
- Frontières réseau et `git diff --check` : réussis.
- Taille : nouveaux fichiers applicatifs sous 400 lignes ; seule alerte mobile
  globale préexistante, `app/wallet.tsx` à 414 lignes (880 sources contrôlées).

Aucune mesure de température/FPS sur appareil physique ni déploiement n'a été
réalisé : cette intervention ne garantit pas à elle seule l'absence de plantage.

## 22 septembre 2026 — Noter l'application sur les stores

**Problème.** Les évaluations des conducteurs/passagers ne sont pas des avis
App Store ou Google Play ; le profil n'offrait pas d'accès dédié à ces derniers.

**Solution appliquée.** Bouton « Noter l’application » dans le menu du profil,
avec le nom du store et ouverture de la fiche officielle pour noter et commenter.
Liens iOS/Android configurés dans `app.config.js`, fallback HTTPS si l'ouverture
native échoue, message français en cas d'échec. Pas d'API native à quota sur ce
bouton explicite, pas de nouvelle dépendance ni de modification backend.

**Précautions.** Doubles appuis verrouillés, chargement local, réponses tardives
neutralisées au démontage/à la perte de focus, aucune sollicitation automatique
ou activité périodique. Pas de filtrage selon la satisfaction, pas de faux accusé
de publication. Les avis sur les trajets et l'aide/support restent inchangés.

**Détail par fichier et limites.** [Notes et avis sur l'application](APP_STORE_REVIEWS.md).
La publication dépend de l'utilisateur et du store ; aucun test physique,
build, déploiement ou avis réel n'a été effectué pendant l'implémentation.

**Contrôles.** Neuf tests dédiés réussis ; 31/31 tests ciblés avec le profil et
les écrans inactifs ; TypeScript réussi ; lint sans erreur (un avertissement
préexistant dans `app.config.js`). Frontières réseau et `git diff --check` réussis.
Suite mobile complète : **700/702 réussis**, avec les deux mêmes échecs
préexistants de `tests/sourceExtractions.test.js` (styles des réservations et
endpoints PIN), sans changement de leurs snapshots.

## 22 septembre 2026 — Notation native après trajet et confirmation du cash

**Problème.** Le profil ouvrait le store sans sollicitation native après un trajet
réussi. Il fallait respecter les seuils choisis (1er, 10e, 20e, puis dizaines),
limiter les sollicitations et éviter une fenêtre supplémentaire pendant les
paiements/navigation. Le statut cash `not_required` ne prouvait pas un encaissement.

**Solution mobile.** Ajout de `expo-store-review ~9.0.9`. Modules séparés
`features/store-review/` pour l'éligibilité, le quota, la persistance et l'adaptateur
natif ; `StoreReviewCoordinator` observe les caches RTK existants sans polling.
Compteurs par rôle, quota commun de trois tentatives sur 365 jours, trace AsyncStorage
par compte, dédoublonnage borné, écriture avant appel natif. Fenêtre demandée sur
l'accueil après trois secondes calmes, une activité serveur fraîche depuis la
reprise et la fermeture des modals. Le reçu conducteur participe désormais au
registre `RideModal`. Aucun fallback automatique vers un navigateur/store.

**Solution cash autorisée par l'utilisateur.** Contrôle réutilisable de confirmation
dans les réservations conducteur et les reçus de dépose. Mutation RTK dédiée et
nouvelle commande backend authentifiée `PUT /bookings/:id/cash-receipt` : conducteur,
dépose, montant et devise revérifiés. Migration nullable pour les trois champs
du reçu ; écriture conditionnelle idempotente, protection contre les saves obsolètes
et changements concurrents du mode/montant. Projection d'activité et contrats
mobiles enrichis. Aucun transfert, crédit de revenus ou calcul de subvention ajouté.

**Conservé et limites.** Aucun critère de satisfaction, changement de prix ou
confirmation automatique du cash. Les liens explicites du profil restent disponibles.
Compteurs locaux à cette installation, sans reprise exhaustive de l'historique :
la fenêtre d'activité existante de 48 h peut manquer des réussites pendant une
longue absence. Les stores décident de l'affichage ; une tentative ne prouve pas
un avis publié. Nouveaux builds natifs et migration backend nécessaires, non exécutés.

**Vérifications.** 31/31 tests ciblés avis/cash mobile et 20/20 tests backend cash/
activité réussis. Suite mobile complète : **723/725 réussis** ; les deux échecs
préexistants concernent toujours l'extraction des styles réservations et les
endpoints PIN de `userApi`. Seule l'empreinte du NOUVEL endpoint `confirmCashReceipt`
a été ajoutée au snapshot ; les empreintes préexistantes défaillantes sont inchangées.
TypeScript mobile/backend sans émission, lint mobile ciblé, frontières réseau et
`git diff --check` réussis. 890 sources mobiles contrôlées ; seule l'exception
préexistante `app/wallet.tsx` (414 lignes) reste au-dessus de 400 lignes.
Pas d'essai physique, de migration PostgreSQL réelle, de mesure de chauffe ou
de garantie d'absence de freeze natif. Repositories/SDK/stockage simulés dans les tests.

**Détails et fichiers.** [Notation native, cash et procédure de déploiement](NATIVE_STORE_REVIEW.md).
Le backend possède aussi `docs/CASH_RECEIPTS_AND_APP_REVIEWS.md`.
Le guide `supabase-postgres-best-practices` a orienté les types des colonnes,
l'écriture atomique et l'absence d'appels externes sous verrou.

## 23 septembre 2026 — Bouton du profil : notation native sans redirection

**Problème.** Le bouton « Noter l’application » ouvrait encore une fiche externe,
contrairement au parcours souhaité sans quitter Zwanga.

**Solution appliquée.** `hooks/useStoreReview.ts` utilise désormais l'adaptateur
natif `features/store-review/nativeReview.ts`, vérifie sa disponibilité puis
appelle `expo-store-review`. Aucun fallback vers le store/navigateur. Message
français en cas d'indisponibilité détectée ou d'erreur. Sous-titre et accessibilité
du `ProfileStoreReviewButton` adaptés, icône de lien externe remplacée par un
chevron. Ancien utilitaire de redirection `utils/storeReview.ts` supprimé.

**Précautions et conservé.** Verrou des doubles appuis, contrôles de focus,
montage, génération, premier plan natif et registre des overlays après les
attentes. Promesse native partagée pour éviter les appels simultanés entre
consommateurs/remontages ; aucune hypothèse sur la fermeture réelle du dialogue
iOS. Aucun polling ni appel réseau supplémentaire. Compteurs, quota AsyncStorage
et déclenchement automatique après trajet inchangés ; le bouton volontaire
reste distinct de ce quota de sollicitations automatiques. Aucun paiement,
calcul de prix, reçu cash ou backend modifié dans cette intervention.

**Vérifications.** 51/51 tests ciblés profil/notation/cash réussis. TypeScript
sans émission et ESLint ciblé réussis. Frontières réseau et `git diff --check`
réussis. 889 sources contrôlées ; seule l'exception préexistante `app/wallet.tsx`
(414 lignes) dépasse 400. La suite complète n'a pas été relancée pour ce correctif.
SDK et cycles de vie simulés : aucun essai physique, build ou déploiement réalisé.

**Limites.** Le store peut ne pas afficher sa fenêtre malgré un appel réussi ;
aucun avis publié ne peut être déduit de ce retour. Les binaires doivent inclure
`ExpoStoreReview` ; un ancien binaire sans ce module affiche une information,
sans crash de chargement attendu ni redirection. Cela ne constitue pas une
garantie générale d'absence de freeze/crash natif.

**Détails et recette.** [Notation depuis le profil](APP_STORE_REVIEWS.md).
La documentation [Notation après trajet](NATIVE_STORE_REVIEW.md) renvoie maintenant
vers ce comportement actualisé du bouton volontaire.

## 23 septembre 2026 — Sortie du paiement à l'arrivée après erreur FlexPay

**Problème.** Une erreur 502 de vérification conservait un bouton « Vérification… »
et des lectures périodiques sans limite. Le message était peu visible et fermer
la fenêtre n'arrêtait pas la surveillance ; un résultat tardif pouvait la rouvrir.
Un 404 distinct révélait aussi des appels passagers à la liste des réservations
réservée au propriétaire conducteur, contrat confirmé dans le backend local.

**Solution appliquée.** Monitoring borné : arrêt sur erreur, garde de lecture
25 s, délai de 12 s après réponse, pause après deux minutes sans confirmation.
Action « Vérifier à nouveau » sur la référence existante, état d'attente sans
spinner permanent, message visible au-dessus des actions et sortie toujours
utilisable. Fermeture/veille annulent uniquement la lecture en cours ; les
références et mutations financières sont conservées. Le récapitulatif tardif
respecte le choix de fermeture. Lectures conducteur limitées au propriétaire
dans l'accueil, le détail et la notation ; côté passager, réservations personnelles.

**Fichiers et précautions.** Hooks `arrival-payment/useArrivalPaymentMonitoring`
et `useArrivalPaymentState`, constantes `paymentPolicy`, composant extrait
`ArrivalPaymentActions`, `PassengerArrivalPaymentCoordinator`, `ArrivalPaymentFields` ;
hooks `useHomeDriverActivity`, `useTripDetailData`, `useTripDetailSafetyActions`,
`useRatingData` et contrat `RatingParticipantSelector`. Aucun élargissement de
droits, nouveau paiement automatique, changement de montant ou interprétation
d'une erreur réseau comme un paiement échoué. Toutes les requêtes restent RTK.

**Vérifications.** 42/42 tests ciblés réussis, dont treize nouveaux scénarios.
Suite complète : **738/740 réussis** ; les deux défauts préexistants de
`sourceExtractions.test.js` (styles réservations et endpoints PIN) sont inchangés.
TypeScript, lint ciblé, frontières réseau et `git diff --check` réussis.
890 sources contrôlées ; seule `app/wallet.tsx` reste à 414 lignes, hors périmètre.
Aucun paiement réel, build, déploiement ou test physique réalisé. La connexion
backend–FlexPay reste un sujet distinct : l'UI ne rétablit pas le service tiers.

**Détails, limites et recette.** [Vérification des paiements à l'arrivée](ARRIVAL_PAYMENT_VERIFICATION.md).

## 23 septembre 2026 — Changer de moyen de paiement après un échec confirmé

**Problème.** Après un paiement refusé ou annulé, les options redevenaient
sélectionnables mais aucune action visible ne guidait le passager vers un autre
moyen. Une recharge de complément refusée dès sa création pouvait également
être enregistrée comme une transaction encore à surveiller.

**Solution appliquée.** Action « Changer de mode de paiement » dans le pied du
formulaire après un statut serveur `failed` ou `cancelled`, pour le règlement
électronique ou la recharge complémentaire des jetons. Cette action retire la
sélection courante et ramène aux options dans la même fenêtre. Le passager
choisit puis valide explicitement ; sélectionner n'envoie aucune requête.
Les réponses de création déjà refusées ne déclenchent ni ouverture de page
de paiement ni enregistrement d'une nouvelle référence en attente.

**Fichiers et précautions.** Hooks `useBookingPaymentMode`, `useArrivalPaymentState`,
`useArrivalPaymentSubmission`, `useArrivalPaymentCompletion`, `useArrivalPaymentMonitoring` ;
`ArrivalPaymentActions`, `ArrivalPaymentFields`, `PassengerArrivalPaymentCoordinator`.
Verrouillage conservé tant qu'une référence reste incertaine, pendant une opération
et après un paiement confirmé. Une erreur HTTP 502 ne vaut pas refus du paiement.
Cash seulement après arrivée/dépose ; mêmes APIs RTK Query, règles tarifaires et
confirmation d'encaissement. Backend local consulté, mais non modifié.

**Vérifications.** 34/34 tests paiement ciblés réussis, dont neuf nouveaux tests.
Suite complète : 747/749 réussis, avec les deux mêmes échecs préexistants de
`sourceExtractions.test.js` (styles réservations, endpoints PIN), hors périmètre.
TypeScript, ESLint ciblé, frontières réseau et contrôle du diff réussis.
Tous les fichiers applicatifs modifiés restent sous 400 lignes ; seule l'exception
préexistante `app/wallet.tsx` reste à 414 lignes. Aucun paiement réel, déploiement
ou essai natif iOS/Android : la recette sur appareils reste nécessaire.

**Détails.** [Changement de mode et protections](ARRIVAL_PAYMENT_VERIFICATION.md#changement-de-mode-apres-echec-confirme).

## 23 septembre 2026 — Action de changement de paiement toujours visible

**Problème constaté.** L'action précédente remplaçait le bouton principal
uniquement après réception d'un refus financier et selon un indicateur en mémoire.
Après une erreur de vérification 502, ou une réouverture sans cet indicateur,
le passager ne voyait donc pas où changer de moyen de paiement.

**Solution appliquée.** « Changer de mode de paiement » est une action distincte,
toujours affichée pour un paiement non réglé, sous le bouton de paiement/vérification
et au-dessus de la fermeture. Elle est utilisable sans attendre un indicateur
d'échec local, lorsque le changement est autorisé. Une transaction non résolue
ou une opération en cours la grise ; un texte explique le verrouillage en attente.
Un compteur local de demandes de sélection ramène aux options même si aucun mode
n'est sélectionné au moment d'un nouvel appui. Aucun appel réseau au clic.

**Fichiers et précautions.** `ArrivalPaymentActions`, `ArrivalPaymentFields`,
`PassengerArrivalPaymentCoordinator`, `useBookingPaymentMode`,
`useArrivalPaymentState` et message de `useArrivalPaymentMonitoring`.
Références incertaines conservées, cash seulement après dépose, bouton de relance
et fermeture inchangés. Pas de modale supplémentaire ni timer/animation de défilement.

**Vérifications.** 36/36 tests paiement ciblés réussis, dont visibilité sans
indicateur d'échec, action présente mais bloquée après erreur de vérification,
appuis répétés et absence de défilement lors de 100 rendus sans changement.
TypeScript, ESLint ciblé, frontières réseau et diff validés. Fichiers applicatifs
modifiés sous 400 lignes ; seule l'exception existante `app/wallet.tsx` reste à 414.
Suite complète non relancée pour ce correctif ciblé ; ses résultats précédents
ne sont pas une nouvelle validation. Aucun paiement réel ni essai iOS/Android.

**Détails.** [Visibilité de l'action](ARRIVAL_PAYMENT_VERIFICATION.md#visibilite-du-changement-de-mode).

## 23 septembre 2026 — Refus opérateur FlexPay et sélection directe du paiement

**Problème confirmé.** Une vérification FlexPay réussie retournait une transaction
refusée, avec le numéro de commande dans `reference` et sans `orderNumber` séparé.
Le backend exigeait les preuves complètes de crédit avant de traiter ce refus ;
il renvoyait donc une erreur 400 au lieu du statut financier `failed`. L'app
conservait logiquement l'ordre incertain et bloquait les choix alternatifs.
Le bouton ajouté pour changer de mode surchargeait par ailleurs le formulaire.

**Solution appliquée.** Backend : séparation des preuves nécessaires pour
enregistrer un refus et de celles exigées pour créditer des jetons. Un refus
vérifié et correctement rattaché à l'ordre devient `failed`, avec un message
français ; les contrôles des identifiants, des montants/devises fournis et des
preuves de succès sont conservés. Mobile : suppression du bouton supplémentaire
et de son compteur local. Après refus confirmé, retour automatique vers les
cartes de paiement et sélection directe d'un autre mode, puis validation.

**Fichiers.** Backend : `src/payments/payments.service.ts`,
`wallet-topup-check-evidence.ts`, `wallet-topup-decline.spec.ts`.
Mobile : `ArrivalPaymentActions`, `ArrivalPaymentFields`,
`PassengerArrivalPaymentCoordinator`, `useBookingPaymentMode`, `useArrivalPaymentState`
et tests `arrivalPaymentModeRecovery`/`arrivalPaymentVerification`.

**Précautions et résultats.** 97/97 tests backend ciblés, 36/36 tests mobile
ciblés réussis. Aucun crédit wallet sur refus, aucune nouvelle requête au choix
d'un mode ; cash disponible seulement après dépose. Erreurs HTTP génériques
toujours distinctes d'un refus financier. TypeScript mobile et backend production
sans émission validés ; typage backend incluant tous les tests en échec dans des
fixtures hors périmètre non modifiées, détaillées dans le document spécialisé.
ESLint mobile ciblé et nouveaux modules backend, frontières réseau et diffs
vérifiés. Aucune migration, modification de solde, tentative de paiement réel,
mise en production ou validation native iOS/Android effectuée.

**Déploiement et détails.** [Refus FlexPay et modes de paiement](FLEXPAY_REFUSALS_AND_PAYMENT_MODES.md).
Le backend corrigé doit être redémarré/redéployé ; une nouvelle vérification de
l'ordre existant permet ensuite à l'app de recevoir le refus et de déverrouiller
les choix. Le mobile ne déduit pas un échec financier d'une ancienne erreur 400.

## 23 septembre 2026 — Priorités distinctes sur l’accueil et indicateurs compacts en recherche

**Périmètre et problème.** Les priorités de l’accueil utilisaient la même carte
neutre pour une réservation reçue, un départ proche et une demande à accepter.
Les indicateurs de places/offres en recherche manquaient de différenciation.
La demande porte uniquement sur la présentation, sans agrandir les cartes de recherche.

**Solution appliquée.** Trois variantes visuelles statiques de `CompactTripCard` :
réservation reçue en vert avec une icône de billet, départ proche en bleu avec
une horloge, demande à accepter en orange avec une icône d’envoi. Fond légèrement
teinté, liseré latéral hors flux et libellé existant conservé : la couleur de
catégorie ne transforme pas une réservation en attente en réservation acceptée.
Dans les résultats de recherche, bordure neutre, date bleue et prix contrasté ;
places disponibles en vert, places demandées en orange, offres en bleu et places
indisponibles/inconnues en gris. Les mêmes textes occupent les mêmes lignes.
Les rehauts inline ne changent ni padding, ni graisse, ni hauteur de ligne.
Aucun nouveau statut métier n’est inventé et aucun badge supplémentaire n’est ajouté.

**Fichiers.** `components/trip/CompactTripCard.tsx` et nouveau
`CompactTripCard.variants.ts`, `components/home/HomeActivityCards.tsx`,
`HomeRequestHighlightCard.tsx`, `components/search/SearchResultCard.tsx` et
`SearchRequestResultCard.tsx`. Tests : `tests/compactCardAppearance.test.js`
et `tests/homeActivityCards.test.js`.

**Comportements conservés.** Dimensions et espacements de base des cartes,
photos, prix par place, budget, plage horaire, véhicule, accès au détail, état
désactivé, ordre des priorités et masquage par swipe/accessibilité inchangés.
Les variantes sont opt-in : les autres listes et aperçus gardent leur aspect.
Aucun nouvel effet, timer, abonnement Redux, appel réseau, animation ou image.
La mémoïsation existante, la virtualisation et les gardes de cycle de vie restent
en place. Le guide frontend a orienté le choix de teintes sobres et d’icônes
informatives, sans ajout d’animations décoratives.

**Vérifications et limites.** Suite `test:ui-stability` : **224/224 tests réussis**,
dont cinq nouveaux tests de variantes, conservation de la géométrie déclarée,
contenu accessible et contraste des petits textes (au moins 4,5:1). TypeScript
sans émission, ESLint ciblé, frontières réseau et `git diff --check` validés.
Contrôle de taille : 891 sources, seule exception préexistante `app/wallet.tsx`
à 414 lignes ; aucun fichier applicatif modifié ici ne dépasse 400 lignes.
Les comparaisons de rendu sont des tests JavaScript avec composants natifs simulés,
pas des mesures de pixels, de mémoire ou de fluidité sur appareils. Aucun essai
visuel natif iOS/Android ni build de production effectué pour cette retouche :
vérifier les petits écrans, les grandes polices, les noms longs et le swipe sur
appareils avant diffusion. Pas de promesse de suppression des crashs ou de chauffe.

## Format pour les prochaines entrées

Pour chaque problème corrigé : date/périmètre, problème constaté, solution
effectivement appliquée, fichiers concernés, comportements conservés, vérifications
et limites. Référencer les documents spécialisés si le détail devient volumineux.
