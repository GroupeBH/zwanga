# Confirmations manuelles et connexion instable — application mobile

État initial du code local vérifié le **14 septembre 2026**, libellés actualisés le **16 septembre 2026**. Ce document décrit ce qui est effectivement implémenté, pas une fonctionnalité supposée déjà déployée sur les stores.

Voir aussi le [bilan détaillé de la conversation](MODIFICATIONS_CONVERSATION.md) et le [résumé mobile/backend](ride-recovery.md).

## 1. Réponse directe : où est l’implémentation mobile ?

Elle n’est ni dans `.env`, ni dans le layout des onglets. Elle est branchée sur les **deux écrans de navigation d’un trajet en cours**.

| Utilisateur | Écran et point d’entrée | Texte visible | Condition importante |
| --- | --- | --- | --- |
| Conducteur | [Navigation conducteur](<../app/trip/navigate/[id].tsx>), composant `RideRecoveryControl` dans l’en-tête | « Confirmer l’embarquement », « Confirmer la dépose » ou « Embarquement ou dépose » selon les actions disponibles | Le trajet doit avoir le statut mobile `ongoing`. |
| Passager | [Navigation passager](<../app/booking/navigate/[id].tsx>), même composant dans le panneau inférieur | « Je suis à bord » puis « Je suis arrivé » | Le trajet doit être `ongoing` et la carte ne doit pas être agrandie. |
| Les deux | [RideRecoveryControl](../features/ride-recovery/RideRecoveryControl.tsx) | Modal « Confirmer une étape » | Ouverture volontaire par le bouton ; hauteur déclarée de 85 % du conteneur disponible. |

Si aucune réponse supplémentaire n’est disponible, le bouton indique « Voir les confirmations ». Son libellé utilise les mêmes règles de disponibilité que le modal, y compris les déclarations sauvegardées hors connexion. Les icônes voiture, drapeau ou liste remplacent la main ; un groupe représente les différentes étapes possibles côté conducteur. Le changement reste visuel : l’ouverture ne confirme rien et ne lance aucune requête supplémentaire.

Repères lors de l’audit : intégration conducteur vers la ligne 5333 ; passager vers la ligne 2409. Les noms de composants sont des repères plus durables que les numéros de ligne.

Le bouton n’est actuellement **pas ajouté** à l’accueil, au détail ordinaire d’un trajet, au détail d’une demande ou au formulaire de réservation. Une demande acceptée n’est pas nécessairement un trajet déjà démarré. En outre, un trajet interrompu peut repasser au statut `upcoming` : il relève alors du parcours d’interruption, pas de ce bouton réservé au trajet en cours.

### Pourquoi on peut ne rien voir

Vérifier dans cet ordre :

1. Le téléphone utilise-t-il réellement le code mobile contenant les nouveaux fichiers ? Un déploiement backend seul ne modifie pas l’interface du téléphone.
2. Est-on dans `/trip/navigate/:id` pour le conducteur ou `/booking/navigate/:id` pour le passager, et non dans `/request/:id` ?
3. Le statut mobile du trajet est-il `ongoing` ? Le statut correspondant dans le backend est `TripStatus.ACTIVE`.
4. Côté passager, réduire la carte si elle est agrandie : le panneau contenant le bouton est masqué dans ce mode.
5. Les données du trajet sont-elles disponibles ? Un premier accès entièrement hors ligne, sans données mémorisées, ne peut pas inventer une réservation.
6. Si le bouton est présent mais la transmission échoue, vérifier ensuite le backend compatible et sa migration. Une API absente explique un refus de transmission, pas à elle seule l’absence du bouton dans un écran correctement chargé.

Dans l’état Git observé, `RideRecoveryControl`, le moteur de file, le coordinateur, le slice et l’API font partie des nouveaux fichiers **non encore suivis par Git**. Les deux écrans de navigation sont des fichiers suivis mais modifiés. Il faut livrer l’ensemble. Cela ne permet pas de conclure, sans examiner le mode de construction, que tout outil de build exclut systématiquement les fichiers non suivis.

## 2. Ce que « passer en manuel » signifie réellement

Il ne s’agit pas d’un interrupteur qui désactive tous les automatismes du trajet.

- La détection automatique existante continue de fonctionner.
- Le bouton manuel reste accessible pendant la navigation en cours, même avant qu’une panne soit détectée.
- Quand la validation tarde, chaque personne peut déclarer ce qui s’est réellement passé.
- Une déclaration est d’abord sauvegardée sur le téléphone, puis transmise quand l’application peut joindre le serveur.
- Pour la voie **manuelle**, le serveur exige les réponses concordantes du conducteur et du passager concerné avant la transition définitive.
- La détection **automatique** conserve ses propres règles : elle n’exige pas systématiquement deux clics manuels.
- Une sauvegarde locale n’est ni une preuve de réception serveur, ni une confirmation d’embarquement définitive, ni une preuve de paiement.

Le conducteur répond réservation par réservation. Sa réponse pour un passager ne confirme pas automatiquement tous les autres passagers du véhicule.

## 3. Quand l’accès manuel est mis en évidence

Le composant accentue son bouton lorsque l’un de ces cas est présent :

| Situation | Effet |
| --- | --- |
| Connexion déclarée indisponible par l’état réseau RTK Query | Mise en évidence ; côté passager, explication de l’enregistrement local. |
| Échec de lecture des confirmations serveur | Mise en évidence ; le modal signale que les données peuvent ne pas être à jour. |
| Déclaration locale non confirmée, attente de l’autre personne ou désaccord serveur | Mise en évidence ; le libellé reste lié à l’action disponible ou à la consultation des confirmations. |
| Proximité d’un point d’embarquement/d’arrivée maintenue par l’état de l’écran pendant 20 secondes | Mise en évidence avec proposition de confirmer si la validation tarde. |

La fonction [isNearRideStop](../features/ride-recovery/rideRecoveryModel.ts) exige, lors de son évaluation : une position datée d’au plus 30 secondes, non future, une précision renseignée comprise entre 0 et 100 mètres et une distance d’au plus 200 mètres du point visé. Avant embarquement, le point visé est l’origine de la réservation ; ensuite, sa destination, avec le repli de destination fourni par l’écran lorsque disponible.

Il ne s’agit pas d’une preuve d’embarquement ni d’une garantie de détection exacte à 20 secondes : ce retour visuel dépend des positions et rendus reçus par l’écran. Aucun nouveau suivi GPS n’est ouvert par ce composant. Si le GPS manque, est imprécis ou ne dispose pas du point d’origine, l’aide de proximité peut ne pas s’activer ; **le bouton manuel reste utilisable**.

Aucun modal ne s’ouvre automatiquement devant le conducteur. Le texte du modal lui demande d’effectuer l’action à l’arrêt.

## 4. Parcours dans le modal

### 4.1 Embarquement

1. Ouvrir « Manuel » ou « Confirmation manuelle ».
2. Le conducteur voit les réservations concernées ; le passager voit sa réservation.
3. Choisir « Passager à bord » côté conducteur ou « Je suis à bord » côté passager.
4. Une zone de vérification demande si l’embarquement a bien eu lieu.
5. « Retour » annule cette sélection sans créer de déclaration.
6. « Enregistrer ma réponse » attend l’écriture locale, puis retire la zone de vérification.
7. Le statut indique la sauvegarde locale, l’envoi, puis l’attente de l’autre personne ou la validation.

Pendant l’écriture locale, les boutons de cette zone et la fermeture sont neutralisés. Si l’écriture échoue, le composant affiche une erreur en français et ne prétend pas que la déclaration est sauvegardée.

### 4.2 Arrivée

Les actions deviennent « Passager arrivé » et « Je suis arrivé ».

Le mobile autorise la déclaration d’arrivée si l’embarquement est déjà validé par les données serveur, **ou** si cette personne a une confirmation locale d’embarquement qui n’est ni bloquée ni en désaccord. Cela permet d’enregistrer embarquement puis arrivée pendant une coupure prolongée.

Ce confort local ne change pas l’ordre métier : le serveur refuse provisoirement l’arrivée tant que l’embarquement n’est pas réellement confirmé. Le code `RIDE_PICKUP_REQUIRED` maintient alors l’action en attente pour un nouvel essai.

### 4.3 Désaccord

Lorsque le serveur indique que l’autre personne a confirmé et que l’utilisateur n’a pas encore répondu, le modal propose « Ce n’est pas exact ».

- La contestation passe par une confirmation explicite et la même sauvegarde locale.
- Un désaccord reçu par le serveur empêche les transitions automatiques concernées de continuer comme si tout était confirmé.
- Une réponse déjà enregistrée n’est pas librement remplaçable par une réponse opposée.
- Une contestation reçue après une étape déjà appliquée ne l’annule pas rétroactivement : `RIDE_ALREADY_CONFIRMED` oriente vers l’assistance.
- Aucun écran de résolution de litige, d’arbitrage ou de remboursement forcé n’a été ajouté par ce lot.

Le bouton de contestation dépend des déclarations serveur connues. Si la confirmation adverse n’a jamais été téléchargée et que le téléphone est hors ligne, le mobile ne peut pas la deviner.

### 4.4 Présentation et accessibilité

Le modal utilise le [FormModal partagé](../components/forms/FormLayout.tsx), une feuille à coins arrondis, un fond assombri, une liste défilante et une zone de confirmation séparée. Les actions ont des libellés explicites, des rôles de bouton et des messages annoncés via `accessibilityLiveRegion`.

Le pied respecte la protection des barres système Android et les insets iOS. « Actualiser les confirmations » relit le serveur lorsque l’écran est actif et connecté ; il ne force pas un second paiement ou une nouvelle déclaration.

## 5. Répartition du code mobile

| Fichier | Responsabilité |
| --- | --- |
| [RideRecoveryControl.tsx](../features/ride-recovery/RideRecoveryControl.tsx) | Bouton, modal, réponses par réservation, état visuel et lecture des confirmations. |
| [rideRecoveryModel.ts](../features/ride-recovery/rideRecoveryModel.ts) | Types, messages, délais de nouvelle tentative, limites et proximité GPS. |
| [rideOutboxEngine.ts](../features/ride-recovery/rideOutboxEngine.ts) | Moteur testable : sauvegarde durable, dédoublonnage, reprise et transmission séquentielle. |
| [rideOutbox.ts](../services/rideOutbox.ts) | Adaptateur concret : AsyncStorage, UUID, compte connecté et appels RTK Query. |
| [rideRecoverySlice.ts](../store/slices/rideRecoverySlice.ts) | Projection sérialisable de la file pour l’interface. |
| [rideRecoveryApi.ts](../store/api/rideRecoveryApi.ts) | Lectures et déclaration HTTP via l’API RTK Query existante. |
| [RideOutboxCoordinator.tsx](../components/RideOutboxCoordinator.tsx) | Un coordinateur partagé pour toute l’application, indépendant de l’ouverture du modal. |
| [ReduxProvider.tsx](../components/ReduxProvider.tsx) | Monte le coordinateur global à côté du suivi actif existant. |
| [store/index.ts](../store/index.ts) et [zwangaApi.ts](../store/api/zwangaApi.ts) | Enregistrement du slice, isolation de session et injection des endpoints. |
| [offlineRideSnapshots.ts](../features/ride-recovery/offlineRideSnapshots.ts) | Copies bornées des informations essentielles du trajet/de la réservation. |
| [useOfflineRideData.ts](../hooks/navigation/useOfflineRideData.ts) | Choix entre données serveur et copie locale lors d’une erreur temporaire. |
| [notificationNavigation.ts](../utils/notificationNavigation.ts) | Ouvre la navigation correspondant au rôle du destinataire. |

L’état d’ouverture du modal, le choix non validé et l’indicateur d’écriture restent dans React. La file visible est dans Redux Toolkit. Sa copie durable est dans AsyncStorage. Les réponses serveur restent dans RTK Query. Les références natives de carte, promesses et objets de localisation ne sont pas placés dans le nouveau slice.

## 6. Chaîne complète d’une confirmation

```text
Navigation conducteur ou passager
  → RideRecoveryControl : choix puis confirmation explicite
  → rideOutbox.enqueue : identité capturée, dédoublonnage, UUID
  → AsyncStorage : écriture réussie
  → rideRecoverySlice : l’interface peut annoncer « enregistré »
  → RideOutboxCoordinator : application active + réseau disponible
  → rideRecoveryApi : PUT authentifié via RTK Query
  → Backend : droits, état métier, idempotence, accord des deux personnes
  → Réponse serveur : attente / validé / désaccord / refus
  → AsyncStorage + Redux : mise à jour de la file
  → Relectures serveur, notifications et rafraîchissement des réservations
```

Le coordinateur n’est pas propriétaire d’un second client HTTP. [services/rideOutbox.ts](../services/rideOutbox.ts) déclenche les endpoints RTK Query avec le dispatch du store. Les résultats des mutations sont libérés et les lectures impératives se désabonnent après utilisation.

## 7. Données d’une déclaration

Exemple de forme de payload ; les identifiants ci-dessous sont des paramètres explicatifs, pas un corps prêt à envoyer :

```ts
{
  eventId: '<UUID v4 stable pour cette déclaration>',
  actorUserId: '<identifiant du compte au moment de la sauvegarde>',
  stage: 'pickup', // ou 'dropoff'
  decision: 'confirm', // ou 'reject'
  occurredAt: '<date ISO de l’enregistrement sur le téléphone>'
  // latitude, longitude et accuracy peuvent aussi être renseignés.
}
```

`bookingId` est utilisé dans le chemin HTTP. `tripId` est conservé dans l’événement local pour retrouver le trajet et ses actions, mais n’est pas transmis dans le corps PUT de cet endpoint. Le rôle conducteur/passager n’est pas une autorité fournie par le client : le serveur le détermine à partir de la réservation et du trajet.

L’entrée locale ajoute `state`, `attempts`, `nextAttemptAt` et un message éventuel. Une position récente peut accompagner la réponse ; elle est facultative et ne valide jamais seule la déclaration manuelle.

## 8. États : ne pas confondre sauvegarde, réception et validation

### 8.1 États de la file mobile

| État | Signification | Traitement suivant |
| --- | --- | --- |
| `queued` | Écriture locale réussie ; réception serveur inconnue | Essai d’envoi quand les conditions et le délai le permettent. |
| `sending` | Un envoi est engagé | Attendre sa réponse ; après redémarrage du processus, reprendre avec le même identifiant. |
| `received` | Le serveur a accusé réception, sans validation finale connue | Relire son état ; ne plus renvoyer la déclaration. |
| `confirmed` | Étape confirmée d’après le serveur | Aucun nouvel envoi pour cette entrée. Cela ne signifie pas « paiement encaissé ». |
| `disputed` | Réponses incompatibles connues | Pas de boucle de renvoi ; recours à l’assistance. |
| `blocked` | Ancienneté ou refus métier empêchant la reprise automatique | Message explicite ; pas de suppression silencieuse de la preuve locale. |

### 8.2 États d’étape exposés par le serveur

| État | Sens |
| --- | --- |
| `none` | Aucune déclaration pertinente reçue. |
| `awaiting_other` | Une personne a répondu ; l’autre est attendue. |
| `ready` | État intermédiaire de la politique de déclarations ; ne pas le présenter comme une transition métier définitive. |
| `confirmed` | Étape appliquée/confirmée. |
| `disputed` | Désaccord à traiter. |

L’interface combine les indicateurs définitifs de la réservation (`pickedUp`, `droppedOff`), les états lus sur le serveur et la file locale. Une contestation locale bloquée conserve son message d’assistance même si le serveur indique que l’étape est déjà confirmée.

## 9. Persistance, compte utilisateur et dédoublonnage

La clé de file est `@zwanga/ride-outbox/v1/<userId>`.

- Les écritures sont sérialisées pour éviter que deux clics ou une réponse réseau écrasent une autre entrée.
- L’identité est capturée au clic, avant d’attendre les autres écritures. Un changement de compte pendant cette attente empêche de sauvegarder sous le mauvais compte.
- Le même compte ne crée pas deux déclarations locales pour la même réservation et la même étape. Un double clic avec la même décision retrouve l’entrée et son UUID.
- Une décision opposée ne remplace pas une décision déjà stockée.
- Le réseau n’est pas exécuté sous le verrou d’écriture locale.
- Au rechargement, les entrées restées `sending` repassent `queued` : une réponse a pu se perdre, mais l’identifiant d’événement est conservé.
- Une réponse d’un ancien compte ne doit pas être publiée dans le Redux du nouveau compte.
- Une file illisible ou incohérente n’est pas remplacée silencieusement par une file vide.

La limite est de **100 événements par compte**. Les anciennes entrées déjà confirmées peuvent être retirées ; si nécessaire, une entrée confirmée plus récente peut aussi céder sa place. Une entrée en attente n’est pas sacrifiée pour accepter une nouvelle action. Si toutes les places sont occupées par des entrées non évictables, la nouvelle sauvegarde échoue explicitement.

Au-delà de **72 heures**, les entrées encore traitables automatiquement deviennent bloquées lors d’un passage du moteur. Ce délai n’est pas un effacement automatique de toutes les données à la seconde exacte : les preuves en attente sont conservées pour assistance, et le nettoyage s’effectue lors des opérations du mécanisme.

AsyncStorage n’est pas présenté ici comme un coffre chiffré. Cette file ne contient pas de code PIN ni de secret de paiement, mais contient des identifiants et éventuellement un point GPS. Ne pas la copier intégralement dans des journaux de production ou la supprimer pour « réparer » une synchronisation sans examiner les confirmations en attente.

## 10. Reprise réseau et coût de fonctionnement

### 10.1 Conditions d’exécution

Le coordinateur tourne seulement si un utilisateur est connecté, si sa file est chargée, si elle contient des entrées `queued`/`sending`/`received`, si l’app est active et si RTK Query indique une connexion disponible.

Il lance un passage, puis attend cinq secondes avant le passage suivant. Il n’y a pas de minuteur propre à chaque position GPS. La file ne lance pas deux passages simultanés. Chaque entrée possède son échéance : un réveil de cinq secondes n’implique pas un appel HTTP toutes les cinq secondes pour chaque entrée.

Le traitement s’arrête entre deux requêtes si le compte, le réseau ou l’état actif change. Il n’y a pas de garantie d’annulation instantanée d’un PUT déjà parti : sa réponse peut être reçue plus tard, d’où l’importance de l’idempotence.

### 10.2 Délais

| Résultat | Politique mobile |
| --- | --- |
| Coupure, erreur de transport, 5xx, 408 ou 429 | Réessais espacés : base de 3 s multipliée par une puissance de deux, décalage aléatoire jusqu’à 20 %, plafond de 120 s. L’exécution réelle dépend aussi du réveil du coordinateur. |
| `RIDE_PICKUP_REQUIRED` | Attendre 30 s, puis réessayer l’arrivée. |
| 401 persistant après la gestion d’authentification | Attendre 60 s et demander de se reconnecter. |
| `RIDE_ACCOUNT_CHANGED` | Attendre 60 s ; reconnecter le compte qui a émis la confirmation. |
| Autre refus 4xx non temporaire | Bloquer l’entrée avec un message métier ; ne pas marteler le serveur. |
| Réception déjà connue mais étape encore en attente | Relire après 60 s ; la déclaration n’est plus renvoyée. |

Lors d’un même passage, les lectures d’état peuvent être réutilisées pour plusieurs étapes d’une réservation. Les requêtes utilisent l’authentification et le délai par défaut de `baseApi` : **20 secondes** pour ces nouveaux endpoints. Les anciens endpoints critiques qui disposent d’un délai de 60 secondes sont un autre périmètre.

### 10.3 Lecture depuis l’interface

Le composant relit les déclarations toutes les **30 secondes** lorsqu’il est monté sur un écran actif et connecté. Cette lecture existe même si le modal est fermé. Elle est suspendue lorsque l’écran n’est plus actif ; la reconnexion et le retour au premier plan permettent également la relecture.

Il faut distinguer cette lecture d’écran du coordinateur global de file. Les deux ont des rôles différents ; la conception ne promet pas qu’aucune lecture de confirmation ne pourra jamais se recouper. Le cache de cet endpoint est conservé 60 secondes après le dernier abonnement.

## 11. Informations du trajet consultables lors d’une coupure

Une deuxième persistance, distincte de la file, utilise `@zwanga/active-ride-snapshots/v1/<userId>`.

| Écran | Données sauvegardées |
| --- | --- |
| Conducteur | `trip:<tripId>` et `trip-bookings:<tripId>` pour le trajet en cours. |
| Passager | `booking:<bookingId>` lorsque la réservation est acceptée ; `trip:<tripId>` lorsque le trajet est en cours. |

Règles :

- Six copies au maximum par compte, accessibles pendant 72 heures.
- Une copie est refusée si son JSON dépasse **150 000 caractères**. Le code mesure la longueur de chaîne, pas un plafond exact de 150 Ko de stockage.
- Écriture différée de 500 ms, écritures sérialisées ; contenu identique non réécrit pendant dix minutes.
- Les champs de position live `currentLocation`, `lastLocationUpdateAt`, `passengerLocationCoordinates`, `passengerLocationUpdatedAt` sont neutralisés dans la copie.
- Les positions d’origine et de destination utiles restent des données de trajet ; ce filtrage n’anonymise pas l’ensemble de la réservation.
- Un état terminal connu provoque le retrait de la copie correspondante selon le hook.

Le hook garde d’abord les données serveur disponibles. Il utilise la copie disque en repli si ces données manquent **et** si l’échec est `FETCH_ERROR`, `TIMEOUT_ERROR` ou un statut numérique 5xx. Il ne contourne pas un 401, 403 ou 404 avec une ancienne copie autorisée autrefois.

Le repli n’est pas injecté dans RTK Query comme une réponse fraîche. L’écran indique l’absence de connexion au lieu d’annoncer une position « LIVE » issue du disque. Une erreur de stockage de cette copie ne doit pas empêcher la navigation en ligne.

Ce mécanisme n’enregistre pas les tuiles cartographiques, ne garantit pas le recalcul d’itinéraire hors ligne et n’archive pas une trajectoire GPS complète. Il ne garantit pas non plus un affichage instantané au premier lancement hors connexion : un résultat ou une copie préexistante reste nécessaire.

## 12. Notifications et ancien bouton conducteur

Le type de notification `ride_confirmation_required` est traité dans [notificationNavigation.ts](../utils/notificationNavigation.ts) :

- Destinataire passager + `bookingId` : `/booking/navigate/<bookingId>`.
- Destinataire conducteur + `tripId` : `/trip/navigate/<tripId>`.

Le rôle est celui de cette réservation, pas simplement la possibilité générale du compte d’être conducteur. Le routage est prioritaire sur une interprétation générique de l’identifiant de demande.

Dans la navigation conducteur, le traitement existant `handleConfirmBypassedPickup` utilise maintenant `rideOutbox.enqueue`. Il ne marque plus immédiatement le passager comme définitivement embarqué dans les états locaux. Le retour vocal annonce l’enregistrement et l’attente de validation ; les indicateurs définitifs proviennent du serveur.

## 13. Contrat backend indispensable au mobile

Les sources sont dans le dépôt frère `zwanga-backend`, principalement `src/ride-declarations/`, `src/bookings/bookings.service.ts` et `src/bookings/entities/booking.entity.ts`.

### 13.1 API authentifiée

| Méthode | Chemin relatif à l’API | Usage et autorisation |
| --- | --- | --- |
| GET | `ride-declarations/booking/:id` | État des deux étapes, pour le passager concerné ou le conducteur du trajet. |
| GET | `ride-declarations/trip/:id` | États des réservations, pour le conducteur du trajet. |
| PUT | `ride-declarations/booking/:id` | Une déclaration personnelle avec le payload décrit plus haut. |

Le serveur compare l’identité authentifiée à `actorUserId`, détermine le rôle réel et vérifie l’accès à la réservation. Une déclaration nouvelle doit correspondre à un trajet actif et à une réservation acceptée. Les contrôles d’identité métier existants restent applicables.

L’événement ne doit pas dater de plus de 72 heures, être plus de cinq minutes dans le futur ou précéder le démarrage de plus de cinq minutes. L’heure du téléphone est donc un élément de diagnostic ; le mobile n’obtient pas le droit d’antidater librement une transition.

### 13.2 Idempotence et concurrence

Les reçus sont conservés par réservation, étape et participant. Le même événement avec un contenu différent est refusé ; une répétition sémantique de la même réponse ne réapplique pas la transition.

Une transaction prend les verrous dans l’ordre **trajet puis réservation**. Elle enregistre les déclarations et, lorsque les conditions sont réunies, les indicateurs définitifs `pickedUp`/`droppedOff` avec la méthode `manual_dual_confirmation`. La date métier définitive est celle de l’application côté serveur ; la date déclarée du téléphone reste une information de l’événement.

Les automatismes utilisent des mises à jour conditionnelles pour ne pas écraser un désaccord reçu en parallèle. Les passages automatiques en absence/incertitude tiennent compte d’une déclaration d’embarquement déjà reçue. Une réservation annulée ou devenue incompatible n’est pas réactivée par une ancienne file mobile.

### 13.3 Paiement et effets différés

Aucun appel de paiement ou notification externe n’est exécuté sous les verrous précédents. Les effets à traiter sont conservés dans la réservation puis repris par un worker backend : passage toutes les 30 secondes, lot de 20, réservation temporaire de traitement de deux minutes et contrôle de version.

La confirmation finale d’arrivée utilise ensuite le règlement et les protections financières existants. Le mobile n’envoie ni montant à prélever ni nouvelle commande carte/Mobile Money dans sa file de confirmations.

Les effets externes sont exécutés avec une sémantique **au moins une fois**. Une notification répétée reste possible après une interruption du traitement. Il ne faut pas transformer l’idempotence des déclarations en promesse d’unicité absolue de toutes les communications externes. Les paiements nécessitent toujours la vérification des protections du service financier en recette.

### 13.4 Migration et anciens clients

La migration `1780000035000-AddRideDeclarations.ts` ajoute notamment les déclarations JSONB, les étapes d’effets en attente, une version, une date de reprise et un index partiel de traitement. Les colonnes de reçus ne sont pas sélectionnées par défaut par l’entité pour éviter leur écrasement par d’anciennes sauvegardes de positions.

Les anciens endpoints manuels de réservation sont redirigés vers cette logique de déclaration. Leur nom historique ne signifie donc plus « un seul clic suffit à finaliser ». Il faut coordonner backend et clients pour que l’autre participant dispose de l’interface permettant de répondre.

Aucune migration ni aucun déploiement n’a été exécuté lors de cette documentation. La migration comporte une protection contre un retour arrière destructif des reçus : une stratégie d’archivage et de retour arrière doit être préparée avant toute intervention sur ces données.

## 14. Exemple complet en connexion instable

| Moment | Conducteur | Passager | État attendu |
| --- | --- | --- | --- |
| Début, après chargement du trajet | Perd Internet | Perd Internet | Les copies déjà disponibles permettent de conserver les informations essentielles. |
| Embarquement | Déclare « Passager à bord » | Déclare « Je suis à bord » | Deux événements indépendants sauvegardés sur les deux téléphones. Pas encore de validation serveur. |
| Arrivée sans réseau | Peut déclarer l’arrivée après sa déclaration d’embarquement | Même possibilité | Les arrivées sont sauvegardées ; aucune preuve locale de paiement. |
| Le conducteur retrouve Internet | Envoie son embarquement | Toujours hors ligne | Le serveur attend le passager ; une arrivée trop précoce reste en attente. |
| Le passager se reconnecte | Relit les confirmations | Envoie son embarquement | Le serveur peut confirmer l’embarquement commun. |
| Les arrivées parviennent ensuite au serveur | Confirme l’arrivée | Confirme l’arrivée | Le serveur applique l’arrivée concordante, puis traite les effets métier. |
| Une réponse réseau se perd | Réessaie avec le même UUID | Aucun clic supplémentaire requis pour dédoublonner | Pas de nouvelle déclaration contradictoire créée par le simple réessai. |

Si, entre-temps, le trajet a été annulé ou a atteint un état incompatible, le résultat peut être un blocage demandant assistance : le système ne rejoue pas aveuglément toute l’histoire comme si le serveur n’avait pas changé.

## 15. Limites explicites du lot

1. Pas de garantie de transmission lorsque l’application est fermée ou suspendue par Android/iOS ; la reprise se fait quand elle redevient active et connectée.
2. Pas de carte intégralement hors ligne, de téléchargement de région ou de recalcul garanti sans Internet.
3. Pas de file hors ligne générique pour réserver, payer, annuler, démarrer, interrompre ou modifier n’importe quel trajet. Cette file couvre `pickup` et `dropoff`, avec accord ou désaccord.
4. Pas de bannière globale des confirmations sur l’accueil ; l’affichage détaillé reste dans les navigations concernées.
5. Pas de modal manuel automatique. Le signal visuel de proximité est une aide, pas une transition de mode obligatoire.
6. Pas de paiement confirmé uniquement parce que les deux téléphones affichent une sauvegarde locale.
7. Pas de récupération d’une file après désinstallation ou effacement des données du téléphone ; AsyncStorage n’est pas une sauvegarde distante.
8. Pas de réactivation silencieuse des réservations `no_show`, `boarding_uncertain`, annulées ou incompatibles. Le modal filtre actuellement les réservations `accepted` et `completed`.
9. Pas de résolution de désaccord intégrée dans le nouveau modal.
10. Les tests de hooks avec composants natifs simulés ne prouvent pas le rendu sur un appareil ni l’absence de crash natif.

## 16. Vérifications effectuées et recette restante

Vérifications relancées le 14 septembre 2026 pendant la préparation de cette documentation :

- Suite mobile complète : **207 tests réussis**.
- TypeScript mobile : aucune erreur.
- Contrôle des frontières HTTP : réussi.
- Suites backend `bookings.service.spec` et `ride-declaration` : **72 tests réussis dans 3 suites**. Il ne s’agit pas de la suite backend entière.

Les tests dédiés sont [rideRecovery.test.js](../tests/rideRecovery.test.js), [rideRecoveryUI.test.js](../tests/rideRecoveryUI.test.js) et [notificationNavigation.test.js](../tests/notificationNavigation.test.js). Ils couvrent notamment les états, les réessais, la persistance, les doubles actions, les changements de compte, le cache local, les boutons et le routage. Les services backend sont testés avec des doubles de persistance : un PostgreSQL réel n’a pas été soumis ici à des transactions concurrentes.

Commandes de vérification depuis la racine mobile :

```powershell
npm.cmd run test:ride-recovery
npm.cmd run test:notifications
node --test --test-reporter=dot tests/*.test.js
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
npm.cmd run check:network
```

Depuis la racine backend :

```powershell
node node_modules/jest/bin/jest.js "bookings.service.spec|ride-declaration" --runInBand --no-cache --silent
```

### Recette sur deux téléphones avant diffusion

| Scénario | Résultat à vérifier |
| --- | --- |
| Trajet commencé, conducteur et passager | Les deux points d’entrée sont visibles aux emplacements décrits. |
| Passager avec carte agrandie | Le panneau est absent ; il revient après réduction de la carte. |
| Mode avion, sauvegarde puis fermeture/réouverture | Même événement retrouvé ; aucune nouvelle déclaration créée simplement par la reprise. |
| Coupure après PUT mais avant réponse | Dédoublonnage serveur ; cohérence des indicateurs et du règlement. |
| Embarquement puis arrivée hors ligne | L’arrivée ne contourne pas l’attente de validation de l’embarquement. |
| Un téléphone reste hors ligne longtemps | Message d’attente précis ; pas de faux statut de paiement. |
| Désaccord, puis concurrence avec la détection automatique | Aucun accord fabriqué ; assistance lorsque nécessaire. |
| Annulation du trajet pendant une coupure | Ancienne déclaration bloquée plutôt que réactivation du trajet. |
| Changement de compte pendant une écriture ou un envoi | Aucune déclaration du premier compte publiée dans le second. |
| Stockage saturé ou illisible | Message d’échec local, aucune confirmation mensongère de sauvegarde. |
| API ancienne, migration absente, 404/503 | Message explicite ; aucun accès indu avec une copie locale. |
| Redémarrage backend après validation mais avant effets | Reprise du suivi, contrôle des écritures financières et éventuelles notifications répétées. |
| Android à trois boutons et iPhone | Boutons accessibles, retour/fermeture fonctionnels, absence de modal empilé. |

Cette recette, l’application de la migration et la publication de binaires restent des opérations distinctes ; elles ne sont pas revendiquées comme effectuées par la rédaction de ce document.
