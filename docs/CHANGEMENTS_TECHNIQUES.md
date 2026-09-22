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

## Format pour les prochaines entrées

Pour chaque problème corrigé : date/périmètre, problème constaté, solution
effectivement appliquée, fichiers concernés, comportements conservés, vérifications
et limites. Référencer les documents spécialisés si le détail devient volumineux.
