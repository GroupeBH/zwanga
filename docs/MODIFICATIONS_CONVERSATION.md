# Documentation détaillée des évolutions de l’application Zwanga

**Référence : code local et historique Git examinés le 14 septembre 2026.**

Ce document rassemble les demandes de cette conversation, leur traduction dans le code mobile, les dépendances backend et les limites de validation. Il regroupe les demandes répétées et les messages « continue » dans les chantiers auxquels ils se rapportent.

Pour la dernière fonctionnalité, lire en priorité [Confirmations manuelles et connexion instable — mobile](RIDE_RECOVERY_MOBILE.md). Ce guide détaille les boutons réellement présents, les conditions d’affichage, les états Redux, la sauvegarde sur le téléphone, les appels RTK Query et la reprise réseau.

## 1. Comment lire ce bilan

### Ce que ce document affirme

- Les comportements décrits comme présents ont été rapprochés des fichiers actuels, de leurs tests ou des documents techniques spécialisés du dépôt.
- L’historique aide à situer les lots ; un intitulé de commit ne constitue pas à lui seul une preuve de résolution d’un incident.
- Les demandes anciennes sont documentées selon leur **forme finale actuelle**, après les corrections demandées ensuite. Par exemple, le choix du véhicule se fait dans un modal d’acceptation, et non dans une section de proposition ajoutée au détail.
- « Implémenté localement » ne signifie ni « publié », ni « validé sur tous les téléphones », ni « incident de production certainement résolu ».
- Ce bilan est fonctionnel et architectural, pas une attribution ligne par ligne de l’auteur de chaque changement. Il n’est pas possible de reconstruire chaque étape intermédiaire uniquement à partir des messages et des commits regroupés.

### État de livraison observé

Le dépôt mobile est au commit `2704096`, avec des modifications locales du dernier lot. Le dépôt backend est au commit `f12a436`, également avec des modifications locales.

Les deux écrans de navigation, le provider Redux, le store et le routage des notifications sont modifiés. Les fichiers `features/ride-recovery/`, `services/rideOutbox.ts`, `components/RideOutboxCoordinator.tsx`, `store/api/rideRecoveryApi.ts`, `store/slices/rideRecoverySlice.ts` et `hooks/navigation/useOfflineRideData.ts` existent localement mais ne sont pas encore suivis par Git à cette date.

La migration backend `1780000035000-AddRideDeclarations.ts` et le module `src/ride-declarations/` sont également nouveaux. Une livraison qui ne reprendrait que les fichiers backend ou seulement les fichiers mobiles déjà suivis serait incomplète. Aucun commit, aucune migration et aucun déploiement n’ont été exécutés pendant la rédaction de ce bilan.

## 2. Carte des demandes de la conversation

| Demande / problème signalé | Réponse dans le code actuel | Où lire les détails |
| --- | --- | --- |
| Clavier masquant les champs véhicule | Modal agrandi, champs défilants, actions séparées et gestion du clavier | § 4.1 et FORM_SAFE_AREA |
| Création/suppression véhicule incertaine sur Android | Mutations RTK Query avec délai adapté, invalidation et relecture de confirmation après erreur réseau ambiguë | § 4.2 |
| Calendrier indisponible quand Internet est lent, surtout iOS | Sélection native locale, découplée des estimations et du chargement réseau | § 5.1 |
| Erreurs « aborted », « server error » et anglais technique | Traduction centrale en messages utilisateur, traitement spécifique des erreurs métier et de vérification d’identité | § 3.2 et § 8 |
| Estimation absente bloquant une demande même avec prix saisi | Budget manuel autorisé ; estimation non indispensable à l’envoi d’un montant valide | § 5.2 |
| Choix d’un véhicule parmi ceux du conducteur à l’acceptation | Action Accepter conservée, sélection et validation dans un modal de 85 % | § 6.1 |
| Boutons cachés derrière la barre Android | Protection partagée des écrans et fenêtres natives de formulaires | § 4.1 |
| Passager vérifié sans véhicule / bouton Devenir conducteur | Deux parcours distincts ; terminologie « vérification d’identité » | § 8 |
| Paiement FlexPay débité mais solde de jetons à zéro | Suivi d’une référence existante, vérification serveur, normalisation et actualisation du wallet | § 9 |
| Wallet trop long et doubles points de recharge | Accès principal compact ; formulaires de recharge et partage dans des modals | § 9.2 |
| Détail de trajet et détail véhicule | Informations regroupées sur le trajet ; véhicule consultable dans un modal | § 7.1 |
| Photo sans validation claire ou sans aperçu | Aperçu réel avant envoi ; actions utiliser/reprendre/annuler | § 8.3 |
| Écran natif Android « redimensionner » problématique | Capture intégrée à l’application sur Android ; édition native du sélecteur désactivée | § 8.3 |
| Recherche des demandes en plus des trajets | Deux modes avec filtres/tri dédiés et une liste virtualisée | § 10.1 |
| Recherche limitée à deux places | Filtre porté de 1 à 4 places, liens entrants inclus | § 10.1 |
| Redondance sécurité, SOS, proches et ajout de contact | Actions compactes, modal SOS et ajout de proches depuis le parcours de sécurité | § 7.2 |
| Sécurité grisée avant réservation | Accès visuellement atténué et protégé selon le contexte passager/réservation | § 7.2 |
| Deuxième étape de demande trop haute / total des places | Horaire compact, total du budget et retrait du bloc d’offres encerclé | § 5.1–5.2 |
| Enlever « plus tard » et « demain » des suggestions | Suggestions réduites, choix personnalisé conservé | § 5.1 |
| Succès de demande sans redirection imposée | Modal proposant l’accueil ou le détail de la demande créée | § 5.3 |
| Repère rapide directement pris en compte | Sélection appliquée sans nouvelle saisie/validation intermédiaire inutile | § 11.1 |
| Refactorisation des très gros écrans | Découpage du formulaire de demande, du profil et de l’accueil ; d’autres écrans restent volumineux | § 12 |
| Demandes proches du conducteur prioritaires | Tri par distance géographique, puis carte de mise en avant pendant dix minutes | § 10.2 |
| Expiration différente selon acceptation | Départ au plus tard + 30 s sans conducteur ; + 2 h avec conducteur | § 6.2 |
| Notifications ouvrant la demande au lieu du trajet commencé/interrompu | Résolution centralisée des destinations et lien vers le trajet assigné | § 6.3 |
| Réserver davantage de places avec identité vérifiée | Application de la règle backend dès 3 places, en respectant la capacité | § 8.2 |
| Prix validé recalculé dans le trajet lié | Prix explicite transmis puis verrouillé après acceptation | § 5.4 |
| Prix non actualisé dans le formulaire de modification | Recalcul lorsque les critères tarifaires changent ; contrôle des réponses tardives | § 5.4 |
| Interruption : attendre ou payer la distance parcourue | Choix passager, devis serveur proportionnel, minimum plafonné au prix initial | § 7.3 |
| Carte lente, sortie de navigation difficile, crash prolongé | Gestion du cycle de vie natif, requêtes bornées, nettoyages et diagnostics | § 11 |
| Android Play Store ferme immédiatement | Correction de configuration native Crashlytics et garde de build ; cause du téléphone non confirmée par un journal | § 13 |
| Incrémenter la version Expo/iOS | Versions de configuration mises à jour ; numéros distants et natifs à contrôler lors du build | § 13.2 |
| Automatisme peu fiable sous réseau instable | Confirmations manuelles persistantes, accord des deux parties et reprise via RTK Query | § 14 et guide dédié |

## 3. Architecture réseau, états et erreurs

### 3.1 « Redux-query » : ce qui est réellement utilisé

Le projet utilise **Redux Toolkit et RTK Query**, et non un second client nommé `redux-query`.

| Nature de l’information | Propriétaire |
| --- | --- |
| Profil serveur, véhicules, demandes, trajets, réservations, paiements | Cache RTK Query des endpoints concernés. |
| Session utilisateur et états partagés métier d’interface | Slices Redux Toolkit existants. |
| Brouillon de demande de trajet | `requestDraftsSlice`, isolé par instance du formulaire. |
| Confirmations manuelles sauvegardées en attente | File AsyncStorage, projetée dans `rideRecoverySlice`. |
| Modal ouvert, saisie PIN/OTP temporaire, étape visuelle, référence native | État local React et refs, pas un objet natif dans Redux. |
| Messages et positions temps réel | Services de sockets ; réconciliation avec les caches/états appropriés. |

Le contrôle [check-network-boundaries.js](../scripts/check-network-boundaries.js) examine le code applicatif ciblé, y compris maintenant `features/`, et refuse l’introduction de `fetch`, `axios` ou `XMLHttpRequest` directs en dehors des couches autorisées.

Ces couches sont [baseApi.ts](../store/api/baseApi.ts) pour l’API Zwanga, [authRefreshApi.ts](../store/api/authRefreshApi.ts) pour la session, et [mapboxApi.ts](../store/api/mapboxApi.ts) pour les services cartographiques. Le jeton Zwanga n’est pas destiné à Mapbox.

Ce résultat ne signifie pas que tout trafic bas niveau d’un SDK natif ou d’une carte transite par Redux. Les SDK natifs, les notifications push et les connexions Socket.IO restent des mécanismes spécifiques ; Socket.IO peut lui-même utiliser des transports réseau internes. Le périmètre garanti par le contrôle est celui des appels HTTP écrits dans les sources applicatives examinées, pas celui de chaque dépendance tierce.

Les durées réseau centrales se trouvent dans [constants/network.ts](../constants/network.ts) : 20 secondes par défaut, 60 secondes pour certaines mutations critiques explicitement configurées. Après une réponse ambiguë, les vérifications utilisent les délais `[0, 900, 1800, 3600]` ms selon le parcours. Un timeout ne prouve pas que le serveur n’a rien enregistré.

Référence : [Frontières réseau](network-boundaries.md).

### 3.2 Messages compréhensibles

[errorHelpers.ts](../utils/errorHelpers.ts) centralise notamment :

- Coupure/abandon : demander d’actualiser pour vérifier si l’action a été prise en compte.
- Délai dépassé : expliquer que la connexion est trop lente, sans annoncer automatiquement un échec métier définitif.
- Session expirée : demander une reconnexion.
- Autorisation refusée : expliquer que l’action n’est pas autorisée.
- Donnée absente : signaler qu’elle a pu être supprimée ou modifiée.
- Erreur de formulaire : orienter vers les champs, lorsque c’est bien une erreur de validation.
- Indisponibilité serveur : expliquer le problème temporaire du service.
- Codes métier : prix verrouillé, identité requise, véhicule absent, quota de publication, etc.

[DialogProvider.tsx](../components/ui/DialogProvider.tsx) réutilise cette présentation pour les avertissements et erreurs. Le traitement évite notamment de faire correspondre n’importe quelle mention de « validation » à un formulaire incorrect : une panne du service de vérification d’identité doit rester une panne de service.

Les détails techniques utiles au diagnostic ne sont pas nécessairement supprimés de tous les journaux. L’objectif est de ne pas les afficher comme explication destinée au passager. Les messages des SDK ou d’écrans non passés par ce helper restent à surveiller ; le helper ne permet pas de garantir qu’aucune chaîne technique ne pourra jamais apparaître nulle part.

## 4. Véhicules, formulaires et zones de sécurité Android

### 4.1 Modal véhicule et pied des formulaires

[VehicleFormModal.tsx](../components/VehicleFormModal.tsx) affiche actuellement une carte de hauteur `90%`, bornée à `96%`, avec adaptation lorsque le clavier est visible. Les champs peuvent défiler ; les actions sont séparées du contenu des champs. L’en-tête et certains espacements se compactent avec le clavier. Les écouteurs clavier ne restent pas attachés lorsque le formulaire est fermé.

L’agrandissement seul ne résout pas les barres système. [FormLayout.tsx](../components/forms/FormLayout.tsx) ajoute une protection partagée :

1. Réserver les zones de sécurité dans la fenêtre effective de l’écran.
2. Mesurer séparément la fenêtre native d’un modal Android.
3. Fournir aux descendants les insets restant après protection, pour ne pas compter deux fois la barre de navigation.
4. Garder les providers hors des cartes animées et du défilement.
5. Éviter le cumul entre décalage manuel de hauteur de clavier et redimensionnement Android.

Les écrans de publication/demande, leurs modifications et plusieurs modals de réservation, véhicules, contacts, wallet, abonnement et support utilisent ce mécanisme. Le comportement iOS existant est préservé par l’adaptation spécifique Android du modal.

Il n’y a pas de hauteur supposée constante de la barre Android, ni de polling pour la mesurer. L’espacement visuel sous un bouton reste différent de la zone système réservée.

Référence et recette : [FORM_SAFE_AREA.md](FORM_SAFE_AREA.md). Les tests de structure ne remplacent pas les essais avec navigation gestuelle, trois boutons, petit écran et grand texte.

### 4.2 Création, mise à jour et suppression des véhicules

[vehicleApi.ts](../store/api/vehicleApi.ts) expose les opérations via RTK Query, avec un délai de 60 secondes pour les mutations. Après succès, les tags véhicule/profil sont invalidés ; une création est également ajoutée à la liste en cache en évitant un doublon d’identifiant.

[useProfileVehicles.ts](../hooks/profile/useProfileVehicles.ts) possède le brouillon local, valide le type/la marque/le modèle/la couleur/la plaque et gère les confirmations. Lorsqu’une mutation renvoie une erreur de réseau au résultat incertain, il relit la liste et vérifie si le résultat attendu est déjà présent : création retrouvée, modification appliquée ou suppression effective.

Ce mécanisme évite d’annoncer systématiquement un échec ou d’inviter à créer un doublon alors que l’opération a réussi côté serveur. Il ne constitue pas une file hors ligne générique de création de véhicule. Aucun diagnostic matériel précis n’a été fourni pour tous les Android signalés ; il faut distinguer cette robustesse ajoutée d’une preuve que toutes les causes de connectivité sont corrigées.

## 5. Demande de trajet : création, horaire, budget et modification

Sources principales : [écran de création](../app/request/index.tsx), [composants du formulaire](../components/trip-request/), [hooks du formulaire](../hooks/trip-request/) et [modèle](../features/trip-request/requestFormModel.ts).

### 5.1 Dates et heures utilisables sans estimation réseau

La sélection de date/heure est locale, à l’aide du sélecteur natif et de son adaptation Android/iOS. Elle ne doit pas attendre le calcul d’un prix ou le retour d’une requête cartographique.

Le bloc compact présente le départ et une rangée de suggestions. « Plus tard » et « Demain » ont été retirés des suggestions rapides ; l’heure immédiate, le raccourci de 30 minutes et le choix personnalisé restent disponibles. Dans l’affichage compact, les libellés sont notamment « 30 min » et « Choisir ».

Le mode personnalisé expose date, heure et marge de flexibilité dans des contrôles plus courts. Il ne supprime pas la possibilité de planifier un autre jour : cette possibilité passe par le choix explicite du calendrier.

Fichiers : [RequestScheduleFields.tsx](../components/trip-request/RequestScheduleFields.tsx), [RequestDatePickerModal.tsx](../components/trip-request/RequestDatePickerModal.tsx), [useRequestSchedule.ts](../hooks/trip-request/useRequestSchedule.ts). La publication conserve son propre écran et ses adaptateurs ; le refactoring du formulaire de demande ne doit pas être interprété comme un découpage complet de la publication.

### 5.2 Prix par place, total et estimation facultative

- Le budget reste un **prix par place**.
- Le total visible correspond au prix par place multiplié par le nombre de places souhaitées. Par exemple, 2 000 FC × 3 places = 6 000 FC.
- Le nombre de places et les restrictions de capacité restent vérifiés.
- L’estimation est une aide, pas une condition obligatoire si l’utilisateur définit un budget valide.
- L’interface gère le chargement et l’indisponibilité de l’estimation sans bloquer la saisie manuelle.
- Le bloc « Recevoir les offres dans ce budget » encerclé dans la conversation n’est plus présenté dans cette étape. Cela ne signifie pas que tous les anciens contrats d’offres ont été supprimés du backend.

[useRequestVehicleOptions.ts](../hooks/trip-request/useRequestVehicleOptions.ts) utilise une lecture RTK Query mutualisable, retardée de 250 ms puis après les interactions, avec distinction des résultats correspondant aux paramètres actuels. Une réponse concernant un ancien itinéraire ne doit pas remplacer les options du nouvel itinéraire.

Le brouillon utilisateur et la recommandation serveur sont des objets différents : une recommandation tardive ne doit pas écraser arbitrairement un choix manuel.

### 5.3 Envoi, réponse ambiguë et modal de succès

[useRequestSubmission.ts](../hooks/trip-request/useRequestSubmission.ts) gère la validation, la mutation, la protection contre les doubles envois et la recherche du résultat après une coupure ambiguë.

Le formulaire ne rejoue pas automatiquement un POST de création dont la réponse s’est perdue : il essaie de retrouver la demande existante par lecture. Le succès est présenté par [RequestSuccessModal.tsx](../components/trip-request/RequestSuccessModal.tsx), avec un choix entre revenir à l’accueil et consulter la demande. Il ne doit pas imposer une redirection immédiate derrière un écran de chargement vide.

Les actions de navigation utilisent l’identifiant de la demande créée/retrouvée. L’ouverture du détail reste dépendante de la disponibilité réelle de cette donnée ; une indisponibilité de lecture ne doit pas produire une deuxième création.

### 5.4 Prix figé après validation, recalcul pendant une modification autorisée

Il existe deux moments différents :

| Moment | Règle |
| --- | --- |
| Création ou modification avant acceptation | Calculer une recommandation si les critères changent ; laisser le passager valider son budget. |
| Acceptation et trajet lié | Utiliser le prix validé ; ne pas refaire silencieusement une estimation pour le conducteur. |

À la création, le mobile transmet explicitement `maxPricePerSeat`, y compris lorsque l’utilisateur accepte simplement le montant recommandé affiché. L’arrondi affiché fait ainsi partie du choix transmis, au lieu de laisser le backend déduire un autre montant parce que le champ serait absent.

[useEditRequestPricing.ts](../hooks/trip-request/useEditRequestPricing.ts) recalcule la recommandation lors d’une modification pertinente du départ, de l’arrivée, des repères, du type de véhicule ou des places. Le choix manuel reste valable pour les mêmes critères ; il ne doit pas rester accroché sans contrôle à un itinéraire devenu différent. Les réponses d’une ancienne demande d’estimation sont écartées.

Le prix confirmé est transmis au backend. Lors de l’acceptation, il est repris dans la sélection et le trajet lié. Le backend refuse ensuite les modifications incompatibles du prix ou de la gratuité avec `TRIP_REQUEST_PRICE_LOCKED`. Le mobile traduit cette règle et protège les formulaires concernés.

Les éventuelles réductions déjà prévues ou le règlement proportionnel après interruption ne sont pas une nouvelle estimation arbitraire du trajet. Les anciens enregistrements ne sont pas rétroactivement corrigés sans un traitement distinct.

Référence : [CONFIRMED_REQUEST_PRICE.md](CONFIRMED_REQUEST_PRICE.md). Tests : [tripRequestEditPricing.test.js](../tests/tripRequestEditPricing.test.js).

## 6. Acceptation, durée de vie d’une demande et trajet associé

### 6.1 Choisir son véhicule pour accepter

Dans le [détail d’une demande](<../app/request/[id].tsx>), l’action métier reste « Accepter la demande ». Elle ouvre un modal de hauteur et hauteur maximale `85%`.

Le conducteur choisit le véhicule à utiliser parmi les véhicules disponibles de son compte. Le `vehicleId` choisi est envoyé dans l’acceptation ; le véhicule n’est pas choisi arbitrairement dans le détail du trajet après coup. Les contraintes d’éligibilité et de capacité restent applicables.

Le modal regroupe les informations utiles, le choix et les actions finales, notamment « Accepter » et, lorsque proposé par le parcours, « Accepter et démarrer ». Les espacements bas et la protection Android rendent les actions accessibles sans les coller à la barre système.

Le choix n’est plus une grande section permanente ajoutée au détail ni une « proposition » tarifaire que l’utilisateur n’a pas demandée. Les actions d’ajout de véhicule ou de vérification restent des prérequis dans les contextes où le compte n’est pas prêt ; elles ne doivent pas remplacer l’acceptation d’une demande éligible pour un conducteur déjà équipé.

### 6.2 Expiration : point de départ des délais

La règle finale demandée remplace l’idée initiale d’une expiration identique pour tout le monde.

| Demande | Échéance |
| --- | --- |
| Aucun conducteur accepté | `departureDateMax + 30 secondes` |
| Conducteur sélectionné/accepté ou trajet lié | `departureDateMax + 2 heures` |

Ces délais partent de **l’heure de départ au plus tard souhaitée**, et non de la création de la demande ni du moment où un conducteur a cliqué. Exemple avec un départ au plus tard à 18 h : sans acceptation, échéance à 18 h 00 min 30 s ; avec acceptation, échéance à 20 h.

[requestExpiration.ts](../features/trip-request/requestExpiration.ts) reconnaît l’acceptation via le statut, le conducteur sélectionné, le trajet lié ou une offre acceptée. [tripRequestExpiration.ts](../store/middleware/tripRequestExpiration.ts) centralise l’actualisation temporelle des caches au lieu d’installer un intervalle par carte. Les listes peuvent ainsi retirer localement les éléments expirés sans attendre une nouvelle interaction utilisateur ; la cadence d’actualisation active est bornée à 30 secondes.

Le backend applique également l’échéance aux demandes. Une application suspendue ne peut pas promettre de repeindre son écran exactement à l’échéance : elle réévalue lors de la reprise. Les délais métier et la cadence de rafraîchissement sont deux notions distinctes.

**L’expiration de la demande n’annule pas à elle seule le trajet lié, ses réservations ou ses paiements.** Les écrans ne doivent pas perdre l’accès à un trajet réellement commencé simplement parce que son objet de demande d’origine n’est plus listé.

Tests : [tripRequestExpiration.test.js](../tests/tripRequestExpiration.test.js). Contexte financier : [TRIP_REQUEST_RESPONSE_EXPIRATION.md](finance/TRIP_REQUEST_RESPONSE_EXPIRATION.md).

### 6.3 Notifications et accès au bon détail

[notificationNavigation.ts](../utils/notificationNavigation.ts) centralise la destination. Les notifications de trajet accepté avec identifiant de trajet, démarré ou interrompu privilégient le trajet effectif lorsque le contexte le permet, au lieu de rouvrir systématiquement la demande initiale.

Les notifications d’offre, de nouvelle demande ou d’expiration restent rattachées au contexte de demande. Un identifiant de demande d’interruption n’est pas automatiquement un identifiant de demande de trajet : le type et le contenu de la notification comptent.

[assignedTripNavigation.ts](../features/trip-request/assignedTripNavigation.ts) aide le détail de demande à proposer l’accès au trajet associé et à gérer les cas de redirection correspondant au propriétaire et à l’état du trajet. Une erreur réseau temporaire peut conserver un lien déjà connu ; un refus d’accès ne doit pas être contourné de cette façon.

La navigation au clic n’attend pas inutilement la réussite de mutations secondaires de lecture de notification. Les nouvelles notifications de confirmation manuelle ont des routes directes vers les navigations conducteur/passager, détaillées dans le guide mobile.

Référence : [NOTIFICATION_NAVIGATION.md](NOTIFICATION_NAVIGATION.md).

## 7. Détail de trajet, sécurité et interruption

### 7.1 Informations et véhicule

Le [détail de trajet](<../app/trip/[id].tsx>) regroupe notamment état, origine/destination, départ, arrivée estimée, places, distance, prix, conducteur, véhicule et réservation selon le contexte.

La partie véhicule ouvre un modal d’informations du véhicule au lieu de rester une simple étiquette. Il permet de consulter les informations disponibles, utiles pour reconnaître le véhicule. Les informations absentes ne doivent pas être inventées pour remplir le modal.

Les heures d’arrivée et tracés restent des estimations ; les optimisations de cache ne les transforment pas en données garanties en temps réel.

### 7.2 SOS et proches

Le détail comporte une action SOS identifiable et un accès compact aux proches/notifications. [TripSecurityPanel.tsx](../components/trip/TripSecurityPanel.tsx) permet de sélectionner les proches existants et d’ajouter un nouveau contact, au lieu d’imposer un passage préalable par un autre écran uniquement pour pouvoir le cocher. Le formulaire intégré propose le nom, le téléphone et le lien avec le proche. Après création réussie, le proche est ajouté à la sélection pour ce trajet ; l’envoi reste une action distincte.

La présentation distingue les appels d’urgence/police, la gestion des contacts personnels et leur notification pour le trajet. La gestion des contacts ne vaut pas envoi d’une alerte : les mutations et confirmations associées restent explicites.

Pour un passager sans réservation donnant accès à la sécurité du trajet, les actions sont atténuées et protégées. Le « flou » demandé correspond dans les styles actuels à un traitement d’opacité/couleurs désactivées, pas à la garantie d’un filtre natif de floutage. Les contrôles d’accès sont nécessaires en plus de cet effet visuel.

Le conducteur du trajet et un passager autorisé ne sont pas traités comme un simple visiteur du détail. Cette protection d’interface n’est pas une garantie de prise en charge par les services d’urgence ; les contacts affichés et canaux doivent être vérifiés lors de la recette métier.

### 7.3 Interruption confirmée : attendre ou s’arrêter ici

Le parcours d’interruption est distinct du mode manuel hors connexion.

Après les confirmations d’interruption requises des passagers embarqués, le trajet passe en pause selon le modèle existant, avec un statut de trajet pouvant être `upcoming`. Le passager reçoit le choix entre attendre le redémarrage et terminer sa réservation à cet endroit avec le montant calculé.

- **Attendre** : conserve la réservation, l’embarquement et le prix initial ; pas de paiement final imposé par ce choix.
- **S’arrêter ici** : affiche le devis du serveur et termine la réservation concernée, avec le règlement selon les modes existants.
- Un accès « Voir le montant et choisir » permet de reprendre le choix.
- Le conducteur ne reprend qu’une fois les décisions requises obtenues selon le parcours.

Le montant est calculé sur le total initial de la réservation, après les règles de réduction applicables, et non en ajoutant un minimum par siège :

```text
part parcourue = distance parcourue / distance prévue
montant proportionnel = prix initial de la réservation × part parcourue
montant dû = min(prix initial, max(1 500 FC, montant proportionnel))
si trajet gratuit : montant dû = 0
```

Exemples pour 5 km parcourus sur 25 km :

| Prix initial total | 20 % du prix | Montant dû avec minimum et plafond |
| --- | --- | --- |
| 10 000 FC | 2 000 FC | 2 000 FC |
| 5 000 FC | 1 000 FC | 1 500 FC |
| 1 000 FC | 200 FC | 1 000 FC, sans dépasser le prix initial |
| Gratuit | 0 FC | 0 FC |

Le backend est l’autorité du calcul. Le mobile transmet l’identifiant du devis pour confirmer le choix, pas un montant libre modifiable par le client. La distance est déterminée avec les données d’itinéraire et le point d’interruption figé ; ce n’est pas une mesure certifiée d’odomètre. Si les données ne permettent pas un devis fiable, l’arrêt avec paiement n’est pas validé à partir d’un chiffre inventé ; l’attente reste possible.

La présentation du choix et du paiement évite l’empilement de fenêtres natives concurrentes, notamment sur iOS. Les devis sont lus lorsque nécessaires au parcours, pas recalculés en permanence sur chaque rendu.

Référence : [TRIP_INTERRUPTION_CHOICE.md](TRIP_INTERRUPTION_CHOICE.md), migration backend `1780000034000` décrite dans ce document et [tests d’interruption](../tests/interruptionChoice.test.js). L’application de cette migration n’est pas déduite de sa présence dans les sources.

## 8. Profil, vérification d’identité, places et photo

### 8.1 Identité passager et activation conducteur sont distinctes

[useProfileOnboarding.ts](../hooks/profile/useProfileOnboarding.ts) sépare :

1. Vérifier son identité comme passager, notamment pour les trajets exigeant des passagers vérifiés.
2. Devenir conducteur, avec les prérequis de véhicule et d’identité nécessaires à ce rôle.

Un passager ne doit pas devoir ajouter un véhicule pour simplement vérifier son identité. La réussite de cette vérification ne doit pas activer automatiquement son rôle conducteur. Le bouton de profil utilise le libellé court « Devenir conducteur » plutôt que « Compléter le profil pour conducteur ».

Le vocabulaire utilisateur privilégie « vérification d’identité ». Les noms de fichiers, variables, statuts et codes techniques peuvent conserver `kyc` pour la compatibilité : la demande de vocabulaire n’implique pas un renommage destructif des contrats API.

[useDiditKycFlow.ts](../hooks/useDiditKycFlow.ts) distingue création de session, ouverture du SDK/fenêtre, synchronisation, interruption, permission caméra, expiration et indisponibilité. Pour le cas signalé `503 / creating_session`, le message indique que le service de vérification est temporairement indisponible, pas que les informations du formulaire sont nécessairement fausses.

Cette amélioration du diagnostic ne rétablit pas par elle-même un fournisseur Didit indisponible ou une configuration backend incorrecte. Ces causes restent à examiner côté serveur si le 503 persiste.

### 8.2 Nombre de places

Le contrat constaté est une vérification d’identité obligatoire **dès 3 places**, et non seulement à partir de 4. La documentation [PASSENGER_IDENTITY_SEATS.md](PASSENGER_IDENTITY_SEATS.md) explicite cette différence avec la formulation initiale « plus de 3 ».

- Le passager peut choisir ses places dans le formulaire.
- S’il atteint le seuil sans identité approuvée, le parcours demande la vérification avant de finaliser l’action protégée.
- Les données du formulaire sont conservées pendant le passage par la vérification.
- Les règles s’appliquent à la réservation et à la demande de trajet selon leur contrat.
- Une identité vérifiée ne donne pas le droit de dépasser la capacité disponible du véhicule.
- Le filtre de recherche de 1 à 4 places ne remplace pas ces règles au moment de réserver.

Tests : [passengerSeats.test.js](../tests/passengerSeats.test.js).

### 8.3 Photo : capture, aperçu, validation, envoi

Le parcours de [useProfilePhoto.ts](../hooks/useProfilePhoto.ts) est maintenant :

```text
Choisir caméra ou galerie
  → obtenir une photo
  → préparer une version allégée
  → afficher réellement la photo dans le modal de confirmation
  → Utiliser cette photo / Reprendre ou choisir une autre / Annuler
  → envoyer uniquement après confirmation
  → mettre à jour le profil après réponse serveur
```

Le modal reçoit `previewImageUri` et n’est donc pas un simple texte accompagné de trois boutons. Sur Android, la capture passe par [ProfilePhotoCameraCapture.tsx](../components/profile/ProfilePhotoCameraCapture.tsx), à l’intérieur de l’application, pour éviter de dépendre de l’écran de capture/recadrage particulier du constructeur. Les sélecteurs utilisés ont `allowsEditing: false` : pas d’étape native obligatoire « redimensionner » avant notre confirmation.

[profilePhoto.ts](../utils/profilePhoto.ts) limite le plus grand côté à 1 024 pixels, conserve les proportions, produit une copie JPEG et libère les ressources natives de manipulation. Il ne recadre pas arbitrairement la photo et n’écrase pas l’original. Le chargement du manipulateur est différé ; un client natif trop ancien peut démarrer mais ne dispose pas magiquement d’un module absent.

Le hook gère également la récupération Android d’un résultat de galerie laissé en attente et le dédoublonnage temporaire des URI, pour éviter des traitements multiples d’une même sélection. L’envoi passe par la mutation utilisateur RTK Query avec `FormData`, puis le profil authentifié est actualisé.

## 9. Wallet et recharge de jetons

### 9.1 Argent débité, solde pas encore actualisé

Sources : [wallet.tsx](../app/wallet.tsx) et [walletApi.ts](../store/api/walletApi.ts).

Le parcours distingue la création d’un paiement, la validation chez le prestataire et le crédit du wallet confirmé par le backend. Un retour de navigateur ou la fermeture d’un écran carte n’est pas à lui seul une preuve de succès.

La référence de recharge est conservée localement avec le compte concerné. Lors d’un retour dans l’app, d’une reconnexion ou d’une reprise du parcours, le mobile vérifie cette référence existante. Le message invite à **vérifier la recharge**, plutôt qu’à payer de nouveau si l’argent a déjà été débité.

`walletApi` normalise les formes de réponse attendues, notamment certains noms camelCase/snake_case et les montants. Les tags wallet/historique sont invalidés lors des opérations pertinentes et lorsque le statut de paiement indique une réussite.

Après succès connu, l’écran arrête son suivi, efface la référence de reprise, actualise les données et prévoit une deuxième actualisation différée de 2,5 secondes si l’écran est encore monté. Cela couvre le délai de visibilité de certaines écritures serveur. Le polling reste borné et géré selon le cycle de vie ; une nouvelle tentative de vérification n’est pas une nouvelle commande de débit.

Limite importante : le mobile ne peut pas créer légitimement les jetons manquants si le backend n’a pas rapproché le paiement ou crédité le wallet. Si le solde reste faux, investiguer la référence, le statut prestataire, le callback/rapprochement, les écritures serveur et le compte destinataire. L’état local ne doit pas être modifié pour simuler un paiement réussi.

### 9.2 Présentation

L’écran privilégie le solde et les actions principales. Recharge et partage ouvrent des modals dédiés ; les formulaires ne sont plus imposés en permanence au milieu du wallet.

Le fait qu’un modal contienne son bouton de validation « Recharger » ne constitue pas le doublon de deux accès concurrents sur la page que la demande cherchait à supprimer. L’historique peut toujours nécessiter du défilement ; l’objectif n’est pas de rendre toute quantité de transactions visible sans aucun scroll.

Le suivi d’abonnement du profil a aussi été découpé et conserve sa référence de paiement isolée par compte. Il n’a pas été supprimé au profit de l’écran de paiement dédié sans analyse de reprise : les deux parcours ne doivent pas être fusionnés en sacrifiant la récupération d’un paiement en cours.

## 10. Recherche et accueil

### 10.1 Recherche de trajets et demandes

[search.tsx](../app/search.tsx) propose deux modes. Les trajets ont les tris « Moins cher » et « Plus tôt ». Les demandes proposent « Plus proches », « Meilleur budget » et « Plus tôt » ; « Meilleur budget » place les budgets les plus élevés en premier pour le conducteur, il n’est pas synonyme de « moins cher ».

Le tri de proximité utilise la distance au conducteur, conformément à la clarification de la conversation. Les coordonnées déjà disponibles sont utilisées ; le simple rendu d’une liste ne crée pas un nouveau suivi GPS.

Le filtre de places va de 1 à 4. Les paramètres de liens entrants restent bornés ; le seuil s’applique aux trajets et aux demandes. La saisie conserve son délai de 450 ms avant d’appliquer les recherches, et le mode non affiché n’effectue pas les mêmes calculs de filtrage inutiles.

La correction du grand vide montré sur la capture passe notamment par [SearchResultsToolbar.tsx](../components/search/SearchResultsToolbar.tsx) : compteur et tris occupent deux rangées de hauteur intrinsèque, avec retour à la ligne des boutons. Il n’y a pas d’espace distribué artificiellement entre ces rangées pour remplir l’écran.

La page conserve **une seule FlatList** avec l’en-tête et les filtres. Paramètres constatés : `initialNumToRender=5`, `maxToRenderPerBatch=5`, `windowSize=7`. Les tableaux et callbacks sont stabilisés lorsque leurs données ne changent pas. Les interactions clavier sont préservées.

Tests : [searchScreen.test.js](../tests/searchScreen.test.js).

### 10.2 Priorité géographique et mise en avant de dix minutes sur Home

[requestPriority.ts](../features/trip-request/requestPriority.ts) classe les demandes disponibles selon la distance du départ au conducteur. Le tri est appliqué avant la limite d’affichage des demandes proches. En l’absence de coordonnées utilisables, un ordre de repli temporel est utilisé ; le code ne prétend pas connaître une distance manquante.

[useHomeRequestHighlight.ts](../hooks/home/useHomeRequestHighlight.ts) et [HomeRequestHighlightCard.tsx](../components/home/HomeRequestHighlightCard.tsx) mettent en avant une demande proche pendant dix minutes afin d’augmenter ses chances d’être remarquée.

« Mise en avant » ne signifie pas `ongoing` ni « acceptée ». Le code ne crée pas une réservation parce qu’une carte est affichée. Les activités réellement prioritaires, telles qu’un trajet actif ou une réservation entrante, conservent leur place dans la hiérarchie de l’accueil.

Le délai commence lorsque la demande est présentée sur l’accueil actif. L’échéance est conservée à travers les remontages/changements d’onglet dans la session de l’app ; le temps en arrière-plan compte. Ce n’est pas un compte à rebours déclenchant un rendu chaque seconde. Le suivi est borné à 200 identifiants et réinitialisé au changement de compte/déconnexion.

Cette échéance n’est pas persistée comme un historique durable après destruction complète du processus. Elle est également distincte de l’expiration métier de la demande : une demande expirée ne doit pas rester mise en avant pour terminer ses dix minutes.

Référence : [HOME_ARCHITECTURE.md](HOME_ARCHITECTURE.md), [homeRequestPriority.test.js](../tests/homeRequestPriority.test.js).

## 11. Cartes, navigation longue et performance de production

### 11.1 LocationPickerModal

Le sélecteur a été séparé en [LocationPickerModal.tsx](../components/LocationPickerModal.tsx), [LocationPickerMap.tsx](../components/location-picker/LocationPickerMap.tsx), [useLocationPicker.ts](../hooks/location-picker/useLocationPicker.ts) et des fonctions/styles dédiés dans `features/location-picker/`.

Les points importants :

- Monter la session à l’ouverture, la libérer à la fermeture.
- Charger la carte après `Modal.onShow`, puis attendre sa disponibilité avant les commandes natives.
- Isoler la carte de la frappe dans la recherche et des variations du pied de page.
- Différer la recherche de 550 ms et ignorer les réponses obsolètes.
- Utiliser directement les coordonnées présentes dans un favori ou un résultat, sans requête de détail superflue.
- Appliquer directement un repère rapide, y compris dans les parcours qui utilisent le sélecteur partagé.
- Permettre de confirmer un point sans attendre son adresse textuelle ; le géocodage ne doit pas bloquer une coordonnée valide.
- Conserver un cache mémoire de 40 adresses pendant cinq minutes.
- Limiter le tracé **affiché** à 400 points, tout en gardant les points validés nécessaires à la sélection sur itinéraire.
- Désactiver le suivi GPS natif continu, les bâtiments et les intérieurs dans ce sélecteur ponctuel ; conserver le bouton « Ma position ».

Ces améliorations réduisent le travail de l’écran, mais le téléchargement des tuiles dépend toujours du réseau et du fournisseur. Elles n’ajoutent pas des cartes hors ligne. La validation visuelle du sélecteur sur les appareils affectés reste nécessaire.

Référence : [LOCATION_PICKER.md](LOCATION_PICKER.md).

### 11.2 Navigation conducteur et passager

Les correctifs se trouvent dans les deux écrans de navigation et dans les hooks [useNavigationMapLifecycle](../hooks/navigation/useNavigationMapLifecycle.ts), [useNavigationRequestGuard](../hooks/navigation/useNavigationRequestGuard.ts) et [useNavigationMarkerRefresh](../hooks/navigation/useNavigationMarkerRefresh.ts).

| Risque | Mesure appliquée |
| --- | --- |
| Commande envoyée à une carte non montée ou déjà libérée | Attendre la fin de transition, `onMapReady` et une taille valide ; ignorer les événements d’une ancienne instance. |
| Récréation/accumulation d’animations de position | Une instance `AnimatedRegion` maintenue ; animation précédente arrêtée avant la suivante et au nettoyage. |
| Double clic de sortie / transition native concurrente | Garde de navigation, retrait de la carte avant les sorties couvertes et récupération si la navigation échoue. |
| Réponses d’itinéraires ou de GPS tardives | Une requête en cours par catégorie dans l’écran ; annulation des lectures annulables et exclusion des réponses obsolètes. |
| Rafraîchissement excessif des marqueurs Android | Dédoublonnage par instance native et annulation au nettoyage. |
| Carte active pendant un écran caché ou l’arrière-plan | Montage et effets liés au cycle de vie ; polling d’écran suspendu. |

Les services natifs nécessaires au suivi d’un trajet actif ne sont pas tous arrêtés parce qu’une carte est cachée. Il faut distinguer la carte et les effets d’affichage du suivi métier en arrière-plan.

Le traitement des sorties répond aussi au bouton « quitter la navigation » qui pouvait paraître inactif sous charge : éviter de laisser la carte, les animations et des callbacks périmés travailler pendant la transition.

La cause exacte des fermetures iOS/Android signalées après une longue ouverture **n’est pas démontrée sans journaux du build concerné**. Une sortie du processus par pression mémoire peut ne pas produire d’exception JavaScript. Les correctifs réduisent des risques constatés dans le code ; ils ne constituent pas une certification d’absence de crash.

Référence et recette d’une heure sur appareils : [NAVIGATION_STABILITY.md](NAVIGATION_STABILITY.md).

### 11.3 Optimisations transversales

Le chantier documenté dans [PRODUCTION_PERFORMANCE.md](PRODUCTION_PERFORMANCE.md) comprend :

| Domaine | Évolution | Limite / point à garder en tête |
| --- | --- | --- |
| Démarrage | Restauration locale de session, rafraîchissement proactif différé, retrait d’une attente artificielle de splash | Vérifier les cas session expirée et démarrage sans réseau. |
| Activité réseau | Pont AppState/connectivité vers RTK Query ; polling lié à l’activité | Une requête déjà partie peut finir après le changement d’écran. |
| GPS | Annulation des démarrages asynchrones périmés, propriétaires de suivi mieux délimités | Préserver le suivi natif d’un vrai trajet actif. |
| Livraison GPS | Dédupliquer les positions confirmées livrées ; ne pas traiter un envoi socket sans accusé comme un succès REST | Ne pas créer une file d’anciennes positions à rejouer après coupure. |
| Sockets | Connexions/rooms partagées, comptage des abonnements, nettoyage et isolation du compte | Les transports restent hors du client HTTP applicatif. |
| Tracés | Cache LRU borné à 64 entrées, durée de dix minutes, repli plus court de 60 secondes | Une estimation en cache reste une estimation. |
| Estimations en liste | Calculs différés et nombre de lectures simultanées limité | Le N+1 n’est pas complètement éliminé si le backend ne fournit pas les durées utiles. |
| Messagerie | FlatList inversée/virtualisée, dédoublonnage HTTP/socket, suppression de copies inutiles de l’historique | L’API backend d’historique reste à paginer par curseur. |
| Autres listes | Pagination des notifications et conversations | Ne pas tronquer aveuglément trajets/réservations utilisés pour restaurer l’activité. |
| Photos | Redimensionnement avant aperçu/envoi, libération des buffers natifs | Le rendu réel dépend encore de l’appareil et des modules inclus. |
| Journaux | Retrait des logs informatifs de production au bundling, erreurs/avertissements utiles conservés | Le nombre de logs des SDK natifs n’est pas entièrement gouverné par cette transformation. |
| Diagnostic | Crashlytics, contexte de navigation/version, mesure de démarrage JS | Aucune mesure chiffrée de gain FPS, mémoire ou batterie n’est revendiquée ici. |

Les lectures de géocodage remplacées peuvent être annulées ; une opération financière ne doit pas être annulée/rejouée arbitrairement comme une simple recherche d’adresse. La nouvelle file manuelle ne change pas ce principe.

## 12. Découpage des composants géants

### 12.1 Demande de trajet

[app/request/index.tsx](../app/request/index.tsx) assemble maintenant les composants d’itinéraire, carte, horaire, budget, calendrier et succès. Le contrôleur est découpé en hooks de brouillon, horaire, options, soumission et géocodage.

Le brouillon Redux est isolé par formulaire, supprimé à son démontage et au changement de compte ; il ne faut donc pas le présenter comme une persistance garantie après fermeture de l’app. Les dates du slice sont sérialisables sous forme numérique. Les réponses tardives ne doivent pas recréer un brouillon supprimé.

Référence : [TRIP_REQUEST_ARCHITECTURE.md](TRIP_REQUEST_ARCHITECTURE.md). Ce document est daté du premier lot ; sa mention d’un profil restant à découper doit être lue chronologiquement, le profil ayant été découpé ensuite.

### 12.2 Profil

[profile.tsx](<../app/(tabs)/profile.tsx>) compose les sections de `components/profile/`. Les données, véhicules, PIN, onboarding et suivi d’abonnement sont répartis dans `hooks/profile/`, avec les styles dans `features/profile/`.

Les sections visibles sont conservées. Les anciens blocs déjà désactivés et leurs calculs devenus inutiles ont été retirés, sans annoncer le retrait d’une action qui était réellement proposée à l’utilisateur. Les PIN/OTP restent temporaires et locaux, pas recopiés dans un nouveau slice global.

Référence : [PROFILE_ARCHITECTURE.md](PROFILE_ARCHITECTURE.md).

### 12.3 Accueil

[index.tsx des onglets](<../app/(tabs)/index.tsx>) sert de composition. Les parties carte, marqueurs, en-tête, cartes d’activité, demandes et listes sont dans `components/home/` ; les contrôleurs/effets sont dans `hooks/home/`, les modèles/styles dans `features/home/`.

Le but est de rendre les responsabilités testables et d’isoler les mises à jour coûteuses. Déplacer des lignes dans un hook n’améliore pas automatiquement les performances : la stabilité des dépendances, le cycle de vie des effets et la propriété des données restent essentiels.

### 12.4 Ce qui reste volumineux

Comptage du code local au 14 septembre 2026, lignes de styles incluses :

| Fichier | Lignes |
| --- | ---: |
| `app/(tabs)/index.tsx` | 90 |
| `app/(tabs)/profile.tsx` | 253 |
| `app/request/index.tsx` | 213 |
| `app/request/[id].tsx` | 5 290 |
| `app/trip/[id].tsx` | 7 997 |
| `app/trip/navigate/[id].tsx` | 7 845 |
| `app/booking/navigate/[id].tsx` | 3 345 |

Il serait donc incorrect d’affirmer que tous les composants géants ont été découpés. Les détails de trajet/demande et les navigations constituent encore un chantier, à fractionner avec des tests de comportement et sans déplacer en masse des effets critiques de GPS/paiement.

## 13. Versions, builds iOS et fermeture Android au lancement

### 13.1 Configuration native Crashlytics

L’audit Android a trouvé le SDK Crashlytics déclaré côté dépendances/plugins Expo mais son plugin Gradle absent des fichiers Android versionnés.

Le correctif ajoute la dépendance de build et l’application du plugin dans `android/build.gradle` et `android/app/build.gradle`. Le script [validate-android-crashlytics.js](../scripts/validate-android-crashlytics.js) est branché au hook EAS de préinstallation pour contrôler cette cohérence avant le build.

La génération de l’identifiant de mapping Crashlytics a été vérifiée lors du correctif, selon [ANDROID_STARTUP.md](ANDROID_STARTUP.md). Cette anomalie peut provoquer un échec avant JavaScript ; aucun `try/catch` d’écran ne réparerait un tel démarrage natif.

Sans journal du téléphone ayant fermé l’app, cela reste une cause probable du signalement, pas une cause prouvée sur tous les appareils. Le correctif nécessite un nouveau binaire Android ; il ne peut pas être apporté uniquement par du JavaScript à un binaire privé de configuration native correcte.

Les scripts de postinstallation existants comprennent également les adaptations de dessin React Native et de header Swift ChottuLink. Ils sont des éléments de préparation native, distincts du code métier de trajet ; leur succès ne remplace pas un build release et son essai.

### 13.2 Versions observées et vigilance

| Source | Valeur locale observée |
| --- | --- |
| [app.config.js](../app.config.js), version Expo | `1.0.14` |
| [package.json](../package.json) | `1.0.14` |
| Configuration Expo iOS `buildNumber` | `104` |
| Configuration Expo Android `versionCode` | `121` |
| [eas.json](../eas.json) | `appVersionSource: remote`, `autoIncrement: true` dans le profil production |
| `android/app/build.gradle` versionné | `versionName "1.0.11"`, `versionCode 120` |

**Une divergence subsiste entre la configuration Expo et les valeurs Android versionnées.** Ce bilan la signale sans modifier la configuration. Selon le workflow natif/EAS, les valeurs réellement intégrées à l’artefact peuvent être pilotées ou remplacées pendant le build. Il faut contrôler le numéro du binaire produit et celui distribué dans les consoles, pas déduire l’absence de conflit de la seule version affichée dans `package.json`.

L’incrément de la version de l’application n’est pas une migration de version du SDK Expo : les dépendances indiquent Expo `~54.0.23`. Aucun accès à l’état distant EAS, App Store Connect ou Play Console n’a été effectué pour cette documentation.

Le document ancien `DEPLOYMENT_CHECKLIST.md` est une checklist historique de démarrage ; il ne doit pas être considéré comme la procédure de release validée et actualisée de ces derniers lots. Utiliser les contraintes précises des guides de build, d’interruption et de confirmations manuelles, puis vérifier le workflow réellement utilisé.

## 14. Dernière modification : confirmations de secours côté mobile

La demande était de garder les étapes d’un trajet utilisables lorsque la détection automatique tarde à cause du réseau, sans transformer une confirmation locale en résultat financier arbitraire.

### Ce qui est effectivement présent

- Un bouton « Manuel » dans la navigation conducteur pendant `ongoing`.
- Un bouton « Confirmation manuelle » dans le panneau inférieur de navigation passager pendant `ongoing`, hors carte agrandie.
- Un modal de 85 % pour déclarer embarquement, arrivée ou désaccord.
- Une sauvegarde AsyncStorage avant tout accusé visuel de sauvegarde.
- Un UUID stable, une isolation par compte et une projection Redux Toolkit.
- Un coordinateur global qui reprend les envois lorsque l’app est active et connectée.
- Des lectures/mutations RTK Query dans `rideRecoveryApi`, pas un `fetch` direct.
- Des messages distincts : enregistré localement, envoyé, reçu, attente de l’autre personne, validé, désaccord ou blocage.
- Des copies limitées des informations actives de trajet pour le repli après une panne de lecture.
- Des notifications qui ouvrent la navigation du destinataire.

Le backend conserve l’autorité des transitions définitives. La voie manuelle exige l’accord des deux personnes ; les automatismes existants restent actifs selon leurs propres règles. L’arrivée peut être sauvegardée après un embarquement local, mais le serveur ne l’applique pas avant un embarquement réellement confirmé.

### Ce qu’il ne faut pas attendre de ce lot

Il n’y a pas de bascule globale qui désactive automatiquement toute détection, pas de paiement confirmé hors ligne, pas de cartes intégralement téléchargées et pas de garantie d’envoi pendant que le système a suspendu l’application. Le bouton n’a pas été ajouté à tous les détails ou à l’accueil ; son absence dans ces écrans n’indique pas que le backend est le seul côté implémenté.

Les états, séquences, conditions d’affichage, délais de 20/30/60 secondes, limite de 100 événements, horizon de 72 heures, migration et scénarios de recette sont documentés dans [RIDE_RECOVERY_MOBILE.md](RIDE_RECOVERY_MOBILE.md).

## 15. Vérifications : résultats et portée

### Vérifications relancées pour ce bilan

| Vérification | Résultat le 14 septembre 2026 | Ce que cela ne prouve pas |
| --- | --- | --- |
| `node --test --test-reporter=dot tests/*.test.js` | 207 tests mobiles réussis | Pas un essai natif sur téléphone. |
| TypeScript mobile `--noEmit --incremental false` | Réussi | Pas un build iOS/Android complet. |
| `node scripts/check-network-boundaries.js` | Réussi | Pas une interception du trafic de tous les SDK tiers. |
| Jest backend : `bookings.service.spec\|ride-declaration` | 72 tests réussis, 3 suites | Pas la totalité des tests backend ni une recette bancaire réelle. |

Les résultats inscrits dans les guides antérieurs sont des résultats historiques de leurs lots. Leurs nombres de tests ne doivent pas être additionnés au total actuel : de nombreux tests sont communs.

### Suites utiles par chantier

| Commande dans le dépôt mobile | Périmètre |
| --- | --- |
| `npm.cmd run test:trip-request` | Formulaire, modification du prix, expiration et places. |
| `npm.cmd run test:profile` | Modules du profil et reprises associées. |
| `npm.cmd run test:home` | Accueil, composition et priorisation des demandes. |
| `npm.cmd run test:search` | Recherche, filtres, tris et disposition. |
| `npm.cmd run test:navigation` | Cycle de vie des cartes et gardes de requêtes/navigation. |
| `npm.cmd run test:location-picker` | Sélecteur de lieu et contrôle des réponses asynchrones. |
| `npm.cmd run test:form-layout` | Zones de sécurité et structure des formulaires. |
| `npm.cmd run test:notifications` | Routage des notifications et trajet assigné. |
| `npm.cmd run test:interruption` | Choix après interruption et présentation du devis. |
| `npm.cmd run test:ride-recovery` | File durable, états et UI des confirmations manuelles. |
| `npm.cmd run test:performance` | Politiques et garde-fous de performance. |
| `npm.cmd run test:android-crashlytics` | Garde de configuration du build natif. |
| `npm.cmd run check:network` | Frontières des appels HTTP applicatifs. |

Ces tests n’exécutent pas une transaction Mobile Money réelle et ne reproduisent pas un arrêt mémoire iOS. Aucune métrique de production avant/après, aucun nouvel AAB/IPA et aucune validation visuelle sur les téléphones des captures ne sont revendiqués par cette documentation.

## 16. Travaux et contrôles restant à planifier

Les priorités ci-dessous sont une liste de suivi, **pas des changements supplémentaires exécutés pendant la rédaction**.

### P0 — Avant de diffuser les confirmations manuelles

- Livrer tous les nouveaux fichiers mobiles et backend, pas uniquement les modifications suivies.
  - Vérifier les imports, les endpoints injectés et le coordinateur monté une seule fois.
  - Vérifier la présence du bouton dans les deux vraies navigations.
- Préparer et appliquer en préproduction la migration compatible suivant la procédure du projet.
  - Sauvegarde et plan de retour arrière préservant les déclarations/écritures financières.
  - Contrôle des anciens clients, dont les endpoints manuels n’ont plus la même sémantique de validation immédiate.
- Effectuer la recette sur deux téléphones.
  - Mode avion, réponse perdue, redémarrage, changements de compte.
  - Embarquement puis arrivée, accord, désaccord, annulation concurrente.
  - Contrôle d’unicité des règlements et de reprise des effets serveur.

### P0 — Build et incidents de fermeture

- Contrôler les versions réellement intégrées aux artefacts et distribuées.
  - Résoudre ou expliquer la divergence Expo/Gradle dans le workflow effectif.
  - Ne pas supposer les numéros distants EAS connus depuis les seuls fichiers locaux.
- Tester une installation release depuis la piste interne Android et le canal de test iOS.
  - Démarrage à froid, sans réseau, après arrière-plan et après longue navigation.
  - Récupérer un rapport correspondant exactement au build en cas de fermeture.

### P1 — Recette métier et ergonomique

- Vérifier les prix de bout en bout : demande créée, modifiée, acceptée, trajet lié et interruption.
  - Total multi-places, remise éventuelle, minimum de 1 500 FC plafonné, gratuité.
- Vérifier recharge et partage avec des paiements de test autorisés.
  - Retour carte, référence persistée, paiement en attente puis confirmé, solde serveur.
- Vérifier le parcours d’identité passager sans véhicule et le parcours conducteur.
  - Seuil de 3 places, capacité véhicule, panne du fournisseur.
- Vérifier les formulaires et modals sur petits Android à trois boutons et iPhone.
  - Clavier, grand texte, photo, contacts, calendrier, fermeture et bouton bas.

### P2 — Optimisations structurelles non achevées

- Découper progressivement les détails et navigations encore volumineux.
  - Extraire d’abord les présentations et modèles purs.
  - Couvrir chaque déplacement d’effet GPS, paiement ou notification par un test dédié.
- Réduire les estimations N+1 au niveau du contrat de liste backend.
  - Exposer les durées/arrivées utiles sans déclencher un calcul par carte.
- Ajouter les endpoints/paginations permettant de borner les historiques sans perdre un trajet actif.
  - Historique de messages par curseur.
  - Lecture dédiée des activités actives avant de tronquer les listes générales.
- Mesurer les gains réels sur un build release.
  - Mémoire native, fluidité, temps de démarrage, volume réseau et consommation GPS.
  - Comparer sur le même appareil et le même parcours ; ne pas convertir un test de logique en chiffre de performance.

## 17. Repères historiques Git

Ces repères situent les lots mobiles visibles, sans attribuer à un seul commit toute la portée fonctionnelle d’un chantier :

| Date | Commit(s) | Repère |
| --- | --- | --- |
| 8 septembre | `3b58ad7`, `933703d` | Hauteur du formulaire véhicule et premier lot de corrections. |
| 9 septembre | `bcef262`, `1de67cc`, `38d1966` | Identité passager, wallet et présentation des paiements. |
| 9 septembre | `84895a5`, `06edec2`, `afc8760` | Véhicule et préparations/corrections de build iOS. |
| 10 septembre | `a738434`, `d4edac0`, `33ed6ad`, `395faac` | Photo, recherche des demandes, sécurité et préparation des évolutions. |
| 11–12 septembre | `a22f264`, `b99f0e2` | Optimisations et découpage des écrans. |
| 12 septembre | `45684f8` | Priorité des demandes proches sur l’accueil. |
| 14 septembre | `cda58d2`, `2704096` | Sélecteur de lieu, interruption et préparation de livraison. |
| Après le HEAD observé | Modifications locales non commitées | Confirmations manuelles persistantes, copies de navigation, API et tests associés. |

Côté backend, `f12a436` est le repère du lot d’interruption présent au HEAD observé ; les déclarations manuelles et leur migration sont des modifications locales supplémentaires. Les numéros de commit documentent le dépôt examiné, pas l’état du serveur de production.

## 18. Index des documents de référence

- [Découpage complet des sources mobiles et limite des 400 lignes](MOBILE_SOURCE_REFACTOR.md)
- [Confirmations manuelles : guide mobile détaillé](RIDE_RECOVERY_MOBILE.md)
- [Confirmations de secours : résumé et déploiement](ride-recovery.md)
- [Frontières réseau](network-boundaries.md)
- [Architecture du formulaire de demande](TRIP_REQUEST_ARCHITECTURE.md)
- [Architecture du profil](PROFILE_ARCHITECTURE.md)
- [Architecture de l’accueil](HOME_ARCHITECTURE.md)
- [Prix confirmé d’une demande](CONFIRMED_REQUEST_PRICE.md)
- [Identité passager et places](PASSENGER_IDENTITY_SEATS.md)
- [Routage des notifications](NOTIFICATION_NAVIGATION.md)
- [Choix après interruption](TRIP_INTERRUPTION_CHOICE.md)
- [Performance de production](PRODUCTION_PERFORMANCE.md)
- [Stabilité des navigations](NAVIGATION_STABILITY.md)
- [Sélecteur de lieu](LOCATION_PICKER.md)
- [Zones de sécurité des formulaires](FORM_SAFE_AREA.md)
- [Démarrage Android et Crashlytics](ANDROID_STARTUP.md)

Ce bilan doit évoluer avec le code : lorsqu’un seuil, un endpoint, une condition d’affichage ou une règle financière change, mettre à jour la rubrique correspondante et son document spécialisé. Ne pas remplacer ces règles par des souvenirs de captures ou par la seule phrase « tout a été corrigé ».
