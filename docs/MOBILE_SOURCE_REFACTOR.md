# Découpage des sources mobiles — 15 septembre 2026

## Résultat et périmètre

Le contrôle des 786 fichiers d’implémentation mobile ne trouve plus de fichier dépassant 400 lignes physiques. Les lignes vides et les commentaires comptent : la limite n’est pas obtenue en supprimant les retours à la ligne.

Le contrôle couvre `app`, `components`, `config`, `constants`, `contexts`, `features`, `hooks`, `lib`, `services`, `store`, `types` et `utils`. Les dépendances, projets natifs générés, documents et fixtures de tests ne sont pas des modules d’implémentation mobile. Ce lot ne modifie ni le backend ni `.env`.

Quelques points d’entrée après découpage :

| Fichier | Lignes |
| --- | ---: |
| `app/trip/navigate/[id].tsx` | 353 |
| `app/booking/navigate/[id].tsx` | 285 |
| `app/trip/[id].tsx` | 388 |
| `app/trip/manage/[id].tsx` | 380 |
| `app/publish.tsx` | 339 |
| `app/(tabs)/trips.tsx` | 371 |
| `app/auth.tsx` | 200 |
| `app/wallet.tsx` | 226 |
| `app/subscriptions/payment.tsx` | 325 |
| `components/PassengerArrivalPaymentCoordinator.tsx` | 333 |

Les composants, hooks et modèles extraits respectent eux aussi la limite. Les chiffres représentent le code local, pas une version déjà distribuée sur les stores.

## Organisation

Les routes Expo Router restent les points d’entrée. Elles composent les vues et utilisent un contrôleur métier. Ce contrôleur assemble des hooks plus ciblés ; il ne contient pas un nouvel ensemble de requêtes concurrent du précédent.

| Domaine | Contrôleur et logique | Affichage et modèles |
| --- | --- | --- |
| Navigation conducteur | `hooks/driver-navigation/` | `features/driver-navigation/` |
| Navigation passager | `hooks/passenger-navigation/` | `features/passenger-navigation/` |
| Détail de trajet et réservation | `hooks/trip-detail/` | `features/trip-detail/` |
| Gestion d’un trajet publié | `hooks/manage-trip/` | `features/manage-trip/` |
| Publication | `hooks/publish/` | `features/publish/` |
| Liste « Mes trajets » | `hooks/trips/` | `features/trips/` |
| Authentification | `hooks/auth/` | `features/auth/` et `components/auth/` |
| Portefeuille | `hooks/wallet/` | `features/wallet/` |
| Paiement d’abonnement | `hooks/subscription-payment/` | `features/subscription-payment/` |
| Paiement après arrivée/interruption | `hooks/arrival-payment/` | `features/arrival-payment/` |

Les contacts d’urgence, avis, support, notifications, réservations, favoris, parrainage et historique des paiements ont également leurs modules dédiés. La capture des documents d’identité est séparée en état du parcours, actions de capture et vues.

Les styles déjà extraits restent dans `features/screen-styles/`. Les types de domaine et les modules d’API conservent leurs points d’export publics.

## Répartition des états et des requêtes

- Redux Toolkit conserve les états partagés existants, notamment l’authentification, les brouillons et la reprise des confirmations.
- Les données serveur restent dans RTK Query : aucun nouveau cache concurrent de trajets, paiements ou réservations n’est créé pour ce découpage.
- Les saisies, étapes de formulaire et ouvertures de modals restent locales aux hooks du parcours. Les placer toutes dans un état global rendrait leur durée de vie moins claire.
- Les références natives, abonnements GPS, temporisations et verrous restent dans des refs. Ils ne sont pas sérialisés dans Redux.
- Les paramètres des hooks et composants sont typés. Les composants extraits protègent les données encore absentes avant de les afficher.

Le contrôle `check:network` continue de vérifier la frontière HTTP. Les connexions temps réel existantes restent gérées par leurs services partagés ; le découpage n’ajoute pas de seconde connexion.

## Navigation conducteur

`useDriverNavigationController` assemble notamment :

- `useDriverNavigationFoundation` : données, état de carte, refs persistantes, réservations, destination active et sortie de navigation ;
- `useDriverNavigationSession` : notifications de progression, reprise au premier plan, suivi temps réel et suivi GPS ;
- `useDriverNavigationRoute` et `useDriverNavigationStepProgress` : calcul du parcours et progression entre les instructions ;
- les actions de réservation, d’embarquement, d’interruption et de fin de trajet ;
- les modèles d’affichage de la navigation et des passagers.

La carte, les commandes, la barre des passagers et les modals sont des composants distincts. Les refs de parcours et de callbacks sont mises à jour aux mêmes étapes du rendu qu’avant l’extraction.

### Traitement des positions

`useDriverLocationTracking` garde la responsabilité des permissions, du démarrage du suivi et du nettoyage de l’abonnement natif.

`features/driver-navigation/driverLocationListener.ts` contient la fonction `createDriverLocationListener`. Chaque abonnement possède ses propres compteurs de fréquence, comme auparavant. Le callback conserve :

- les contrôles de validité, fraîcheur, précision et cohérence du GPS ;
- la protection contre plusieurs chargements initiaux de l’itinéraire ;
- les seuils et délais de recalcul en cas de sortie du parcours ;
- les limites de fréquence d’envoi au backend, de mise à jour de l’état et de progression des étapes ;
- l’arrêt de l’ancienne animation du marqueur avant la suivante ;
- l’absence de nouvelle animation native si la carte n’est pas prête ou si l’application est en arrière-plan.

Le signal `isCancelled()` lit le drapeau de l’effet propriétaire. Il ne s’agit pas d’une copie du booléen au moment de l’inscription : dès que l’effet est nettoyé, un ancien callback GPS ne doit plus agir. Les contrôles de démontage et de sortie de navigation restent également actifs.

## Navigation passager et connexion instable

Le contrôleur passager sépare les données, les coordonnées, les notifications de progression, la synchronisation du conducteur, le partage de position, la détection d’arrivée et les actions d’interruption.

`usePassengerLocationSharing` conserve le partage temps réel et son repli HTTP via RTK Query, les protections contre les réponses tardives et le nettoyage des abonnements. Le signal de confirmation locale n’est pas transformé en état serveur confirmé.

Les copies de navigation hors ligne, `RideRecoveryControl`, la file persistante de confirmations et leurs règles restent en place. Le découpage ne change ni leurs délais ni l’autorité du backend. Voir [le guide des confirmations manuelles](RIDE_RECOVERY_MOBILE.md).

## Paiements et formulaires

Le portefeuille sépare stockage de la référence, surveillance du paiement, retour de la page bancaire, initiation de recharge et transfert. Le paiement d’abonnement possède la même séparation par responsabilité. Les références de transactions, la restauration après interruption et les conditions de succès restent celles du parcours existant.

Le paiement après arrivée/interruption conserve son état de réservation, ses demandes au fournisseur, sa vérification et son récapitulatif. Un callback tardif ou une simple fermeture de page bancaire n’est pas converti en confirmation de paiement.

La publication est composée d’étapes route, date/heure, véhicule, prix et confirmation. Les formulaires de modification, d’acceptation, d’identité et de contacts conservent les composants de protection des zones système Android/iOS. Le test des modals pointe maintenant vers les fichiers extraits, sans retirer les assertions sur cette protection.

Ce lot est structurel : il n’introduit pas de nouveau calcul de prix, de nouvelle condition d’identité ou de nouvelle règle de règlement après interruption.

## Vérifications

```sh
npm run check:source-size
npm run check:network
npx tsc --noEmit
node --test tests/*.test.js
```

Sous PowerShell avec l’exécution des scripts désactivée, employer `npm.cmd`, `npx.cmd` ou `node node_modules/typescript/bin/tsc --noEmit`.

La suite comprend les tests existants de prix, places, notifications, identité, reprise réseau et cycle de vie des cartes. Les comparaisons de styles et de définitions d’endpoints restent présentes.

`tests/driverLocationListener.test.js` ajoute cinq vérifications ciblées : répétition intensive des callbacks, annulation/démontage/sortie, rejet des mauvaises positions, réinitialisation des compteurs entre abonnements et absence d’animation native sur carte masquée.

Ces contrôles ne remplacent pas un essai sur téléphone. Avant distribution, vérifier notamment une navigation prolongée Android/iOS, les passages premier plan/arrière-plan, les connexions lentes, l’embarquement, les interruptions et les retours de paiement. Aucun gain de mémoire ou de temps de rendu chiffré n’a été mesuré dans ce lot.

## Maintenir le découpage

Ajouter un sous-composant ou un hook métier avant de dépasser 400 lignes. Ne pas masquer un fichier trop long par une exclusion du contrôle, une minification ou un déplacement intégral dans un autre fichier géant.

Une nouvelle lecture serveur doit réutiliser RTK Query. Toute nouvelle temporisation ou inscription native doit définir sa condition d’activation, son nettoyage et son comportement après changement d’utilisateur ou de trajet.
