# Journal des changements techniques

Ce journal commence le 22 septembre 2026. Chaque nouvelle modification doit
décrire le problème, la solution appliquée, les fichiers concernés et la validation.
Il ne prétend pas reconstituer les interventions antérieures non documentées.

Documents complémentaires déjà présents :

- [Caméra de navigation et consommation GPS](NAVIGATION_CAMERA_AND_GPS.md)
- [Réduction du travail des écrans inactifs](SCREEN_IDLE_PERFORMANCE.md)

## 25 septembre 2026 — Écran des jetons plus concis

**Problème.** Le solde et le retrait répétaient les mêmes explications ; les
bannières et deux grandes cartes d'action repoussaient l'historique. Les règles
sur la fidélité occupaient l'écran même sans opération à effectuer.

**Solution appliquée.** Le guide frontend a orienté une hiérarchie sobre :
solde, montant retirable et raccourcis « Recharger », « Partager », « Retirer ».
Le détail du solde se déplie avec « Détails ». Les retraits sont repliés par
défaut, avec le nombre de demandes à suivre ; leur consultation conserve les
dix entrées déjà accessibles. Parrainage et revenus conducteur deviennent des
liens compacts. Les erreurs, restrictions de retrait, demandes incertaines et
suivi de recharge restent visibles. En-tête/espacements resserrés, actions
nommées et cibles tactiles d'au moins 44 points, sans hauteur fixe des textes.

**Formulaires.** Suppression de l'exemple redondant de conversion lors de la
recharge, aide au partage raccourcie. Le retrait conserve avant confirmation le
solde retirable, minimum, taux, numéro Mobile Money et condition d'identité
vérifiée. « KYC » est remplacé par « identité vérifiée » dans ce parcours.
Les montants et règles d'éligibilité n'ont pas été modifiés.

**Fichiers.** `app/wallet.tsx`, nouveaux `features/wallet/WalletOverview.tsx`
et `WalletOverview.styles.ts`, `WalletWithdrawalSection.tsx`,
`WalletTopUpModal.tsx`, `WalletTransferModal.tsx`,
`hooks/wallet/useWalletWithdrawal.ts` (texte de confirmation uniquement) et
`features/screen-styles/app/wallet/container.styles.ts`.

**Précautions.** Pas de nouvel appel réseau, timer, animation ni modal natif.
Liste principale virtualisée et pagination conservées. Les détails locaux ont
des clés distinctes par compte. Les overlays restent à la racine de l'écran,
hors de la liste et du fond rendu inactif. Reprise d'un retrait incertain avec
la même clé d'idempotence, blocages, destinataire et double confirmation inchangés.

**Vérifications.** 40 tests JavaScript ciblés réussis (présentation compacte,
formulaires/clavier, suivi des recharges, cache et retraits), TypeScript valide,
contrôles réseau/taille valides : 947 sources, aucune au-delà de 400 lignes.
`git diff --check` valide. Tests : `walletCompactOverview.test.js`,
`walletSheetKeyboard.test.js`, `walletWithdrawal.test.js`,
`walletTopUpLifecycle.test.js` et `walletQueryReliability.test.js`.
Les deux échecs initiaux du banc de test clavier provenaient du nouveau module
de présentation non simulé ; son mock a été ajouté, sans changer les assertions
de protection du clavier. Pas de paiement réel ni de mesure de performance
native. Rendu sur appareils iOS/Android et grandes polices restant à vérifier.

## 25 septembre 2026 — Contacter le titulaire avant d'accepter sa réservation

**Problème.** Dans la gestion d'un trajet, le contact était réservé aux
réservations acceptées. En navigation, la liste de contacts excluait les
réservations en attente : le conducteur ne pouvait pas joindre leur titulaire
pour préciser la prise en charge avant de se décider.

**Solution appliquée.** Ajout de « Contacter » sur les réservations en attente
dans la gestion, et de « Contacter avant d’accepter » sur la carte prioritaire
en navigation. Ces actions ouvrent la fiche de la personne choisie, avec
« Appeler » et « WhatsApp », sans acceptation implicite. Le bouton général de
contact en navigation inclut également les réservations en attente, avec un
libellé explicite. La gestion réutilise le modal de contact existant et ses
protections contre les doubles clics, erreurs natives et démontages.

**Fichiers.** `features/manage-trip/ManageTripBookings.tsx`, nouveau
`features/manage-trip/ManageTripContactModal.tsx`, `hooks/manage-trip/useManageTripState.ts`,
`app/trip/manage/[id].tsx`, `features/navigation/navigationContacts.ts`,
`hooks/navigation/useNavigationAssistance.ts`, ainsi que
`features/driver-navigation/DriverPendingBookingPrompt.tsx`,
`DriverNavigationPassengersBar.tsx` et `DriverNavigationTopPanel.tsx`.

**Comportements conservés et précautions.** Accepter/refuser restent deux
actions distinctes. Un seul titulaire est contacté pour une réservation de
plusieurs places ; aucune sélection automatique d'un autre passager si la
réservation disparaît ou est refusée. Seul le propriétaire du trajet peut
consulter ces contacts, à partir des données déjà autorisées. La lecture backend
`BookingsService.findAllByTrip` vérifie déjà le conducteur propriétaire et
retourne le passager des réservations en attente : aucune modification backend
ni nouvelle requête nécessaire. Un numéro manquant rend les actions indisponibles
avec une explication. La fiche de gestion suit les données actuelles plutôt
qu'une copie du numéro ; sa sélection est effacée au changement de compte,
de trajet ou d'activité de l'écran. Aucun polling ni abonnement supplémentaire.
Les actions de la carte de navigation restent hors du contenu défilant.

**Vérifications.** 54 tests JavaScript ciblés réussis : contacts, droits,
multi-places, sélection d'une réservation parmi plusieurs, numéro absent,
réservation annulée/refusée, ouverture/fermeture du modal, câblage et dispositions
des boutons, gestion de trajet et navigation. TypeScript sans émission valide,
ESLint ciblé sans erreur, contrôles réseau/taille valides
(945 sources, aucune au-delà de 400 lignes) et
`git diff --check` valide. Tests principaux : `pendingBookingContact.test.js`,
`navigationAssistance.test.js` et `driverPendingBookingLayout.test.js`.
Appels et WhatsApp simulés dans les tests ; aucun contact réel effectué.
Essais natifs iOS/Android, petits écrans/grandes polices et retour depuis
l'application Téléphone/WhatsApp restant à valider sur appareil.

## 25 septembre 2026 — Correctifs des six points de l'audit de fiabilité

**Problèmes.** Boucle de vérification de recharge, double rôle GPS, arrêt natif
concurrent d'un nouveau trajet, dépose reconnue de façon inégale, attente GPS
initiale et historique des jetons non borné.

**Solutions appliquées.** Tags RTK séparés du suivi de statut et abonnements de
lecture libérés ; sélection commune du rôle et de la fin du transport ; file
native conducteur avec générations ; abonnement GPS immédiat et cache initial
borné ; pagination serveur/mobile et liste virtualisée dans le portefeuille.
Le backend local est modifié sans changer l'ancien endpoint d'historique.

**Conservé.** Suivi arrière-plan, multi-places, paiements dus après dépose,
actualisation du solde et fonctionnement des modals. Aucun paiement réel,
déploiement ni migration de base effectué. Déployer le backend avant la nouvelle
app pour consulter tout l'historique ; repli récent borné pendant la transition.

**Vérifications.** 56 tests mobile ciblés et 11 tests backend réussis, TypeScript
des deux projets valide, ESLint ciblé et contrôles réseau/taille valides. Suite
mobile complète : 1 007/1 009 réussis, avec deux échecs de références préexistants.
Pas d'essai natif ni de garantie de disparition des crashs ou de la chauffe.
Fichiers, scénarios testés et limites dans les
[correctifs de l'audit](PERFORMANCE_RELIABILITY_FIXES_2026_09_25.md).

## 25 septembre 2026 — Audit transversal de performance et de fiabilité

**Périmètre.** Relecture des cycles GPS, requêtes/cache, paiements, écrans,
modals, sockets et protections de build mobile ; contrôle ciblé du contrat de
l'historique des jetons dans le backend local.

**Résultat.** Trois priorités P1 : auto-invalidation des vérifications de recharge,
double participation GPS et concurrence arrêt/démarrage du GPS conducteur.
Trois P2 : dépose reconnue différemment par le suivi global, amorçage GPS non
borné et historique des jetons non paginé. Les corrections sont proposées,
**pas appliquées** dans cette intervention : seuls ce journal et le
[rapport d'audit](PERFORMANCE_RELIABILITY_AUDIT_2026_09_25.md) sont ajoutés/modifiés.
Les comportements applicatifs et modifications préexistantes sont conservés.

**Vérification.** TypeScript, frontières réseau et contrôle de taille valides ;
982/984 tests réussis, deux échecs préexistants de références d'extraction.
Quatre simulations JavaScript documentées, sans paiement réel ni essai natif.
Aucune conclusion de disparition des gels, crashs ou de la chauffe.

## 25 septembre 2026 — Libération de l'accueil après la dépose

**Problème.** Une ancienne information de suivi pouvait conserver l'accueil
verrouillé et afficher un rôle conducteur erroné après la dépose. La liste
d'activité pouvait aussi rester en retard sur le détail de la réservation.

**Solution.** Statut, carte et panneau fondés sur la participation réelle,
horodatages de dépose reconnus et propagation immédiate de la fin du transport
confirmée vers les caches passager. Retour au profil GPS de proximité lorsque
la participation se termine. Pas de nouvelle requête ni de polling ajouté.

**Conservé.** Paiements restant à régler, montants, réservations de plusieurs
places, autres passagers et trajets réellement actifs. Les réponses réseau
tardives ne réactivent pas une réservation déjà déposée dans les caches.

**Vérification.** 68 tests ciblés passent, TypeScript et `git diff --check`
valides ; 941 sources mobiles restent sous la limite de 400 lignes. Suite
complète : 982/984, avec les deux échecs déjà connus de `sourceExtractions.test.js`
(styles de réservation et références API PIN). Aucun essai natif réalisé.
Périmètre, fichiers, tests et limites dans
[Accueil après la dépose](HOME_AFTER_DROPOFF.md).

## 25 septembre 2026 — Panneau des passagers plus compréhensible

**Problème.** Le panneau mélangeait récupération et dépose dans deux lignes par
réservation, avec noms barrés, compteurs sans légendes et actions peu explicites.

**Solution.** Une fiche par réservation, statuts écrits, prochaine étape mise en
avant, compteurs légendés et actions nommées. Hauteur adaptée au contenu et liste
toujours virtualisée. Le détail d'un point ne déclare plus une arrivée fictive.
Le skill frontend a guidé la simplification visuelle et la hiérarchie du contenu.

**Conservé.** Ciblage des réservations et groupes de places, suivi automatique,
itinéraire, confirmations, priorités des modals et signalement existant. Aucun
changement backend, nouveau polling ou nouvelle fenêtre native.

**Vérification.** 24 tests ciblés passent, TypeScript et `git diff --check`
valides ; 940 sources mobiles respectent la limite de 400 lignes. Pas d'essai
sur appareil physique. Fichiers concernés et protocole natif dans
[Panneau des passagers](NAVIGATION_PASSENGERS_UX.md).
Suite complète : 970/972 ; les deux échecs préexistants de
`sourceExtractions.test.js` (styles de réservation et API PIN) restent présents.

## 25 septembre 2026 — Photo du conducteur et publications multiples

**Problème.** Plusieurs publications étaient possibles sans photo de profil,
et les alertes d'arrivée du conducteur n'affichaient pas son visage.

**Solution.** Photo requise dès la deuxième publication publique, trace durable
et contrôle transactionnel backend, protection des publications récurrentes,
raccourci mobile vers l'ajout de photo sans effacer le formulaire. Bloc photo/nom
du conducteur ajouté aux alertes de prise en charge, avec les détails du véhicule
et sans nouvelle requête de profil ni polling.

**Conservation et limites.** Première publication ponctuelle et acceptation
privée des demandes conservées, ainsi que les contrôles d'identité, de propriété,
de véhicule et de quota. Migration backend préparée mais non exécutée.
Vérifications ciblées : 22/22 tests mobiles et 53/53 tests backend passent.
TypeScript mobile/backend valide ; contrôle des 937 sources mobiles conforme
à la limite de 400 lignes, et `git diff --check` valide. Aucun essai natif réalisé.
Suite mobile complète : 964/966 ; les deux échecs préexistants de
`sourceExtractions.test.js` (styles et références API PIN) restent inchangés.
Fichiers, périmètre précis, migration et protocole de validation dans
[Photo conducteur : publication et rendez-vous](DRIVER_PROFILE_PHOTO.md).

## 25 septembre 2026 — Conducteur de compte, passager dans une réservation

**Problème.** Une activité conducteur encore en cours prenait systématiquement
le dessus sur une réservation active dans la bannière. L'écran de navigation
conducteur ne vérifiait pas la propriété avant de monter ses contrôleurs.

**Solution.** Rôle déterminé par la participation au trajet, priorité à la
réservation active, garde d'accès avant montage des interfaces conducteur,
redirection vers la navigation passager et cohérence du suivi de l'accueil.
Le statut conducteur du compte et les contrôles de propriété backend sont conservés.

**Vérifications.** TypeScript valide, 81 tests JavaScript ciblés passent. Suite
complète : 958/960, avec deux échecs préexistants de références styles/PIN,
non modifiées par ce correctif. Limites et protocole natif
dans [Rôles de participation au trajet](TRIP_PARTICIPATION_ROLES.md).
Aucune mutation de données de production ni validation sur appareil physique.

## 24 septembre 2026 — Vérification et durcissement de PawaPay

**Problèmes.** Compilation bloquée, arrondis CDF silencieux, bascule risquée après
erreur réseau ambiguë, callbacks mal liés à leur transaction et réponses tardives
pouvant écraser un état final.

**Solutions.** Contrats HTTP contrôlés, montants exacts selon l’opérateur,
vérification serveur obligatoire pour tous les paiements, mises à jour sous
verrou court et reprise de finalisation métier. Remboursements PawaPay non activés.
Libellés Mobile Money neutres, parcours carte FlexPay et règles cash/jetons conservés.

**Vérifications et limites.** [Revue PawaPay](PAWAPAY_REVIEW.md) détaille fichiers,
tests et conditions de déploiement. TypeScript backend et mobile valide : les
erreurs PawaPay mentionnées ci-dessous sont corrigées. 278 tests backend et 61
tests mobiles ciblés passent. Tests simulés ; pas
de transaction réelle, migration appliquée, déploiement ou essai natif.

## 24 septembre 2026 — Inscription passager et activation conducteur explicite

**Problème confirmé.** Le booléen multipart `"false"` était converti en `true`.
Plusieurs chemins serveur et mobile déduisaient aussi le rôle conducteur du
drapeau ou d'un véhicule, sans parcours complet ni intention explicite.

**Solution appliquée.** Conversion stricte, rôle serveur canonique, intention
conducteur distincte et activation uniquement après identité approuvée et véhicule
actif du propriétaire. Inscription, profil, callbacks d'identité, véhicules,
publication et offres utilisent cette règle. Le mobile ne transmet plus deux
choix contradictoires et synchronise les réponses confirmées dans Redux avec
isolation des comptes. Migration additive préparée, non appliquée ; aucun compte
historique n'est rétrogradé automatiquement, aucune donnée financière modifiée.

**Documentation et validation.** Voir [Statut passager et activation conducteur](DRIVER_ACCOUNT_ROLES.md)
pour les fichiers, garde-fous PostgreSQL, compatibilité, résultats des tests et
ordre de déploiement. TypeScript mobile valide ; 948/950 tests mobile passent
(deux empreintes historiques restent divergentes). Les tests backend ciblés
passent, mais le build global reste bloqué par les erreurs de typage PawaPay hors
périmètre. Aucune validation sur appareil physique ni déploiement n'est annoncé.

## 24 septembre 2026 — Accès Services dans les onglets des conducteurs

**Problème.** Services pro était accessible uniquement depuis le profil.
Remplacer Recherche pour tout le monde aurait pénalisé les passagers ; réutiliser
la route d’onglet `search` pour les services aurait rendu les liens `/search`
ambigus avec l’écran de recherche autonome.

**Solution appliquée.** Cinq onglets conservés : le deuxième affiche Services
pour les comptes conducteurs/mixtes, Recherche pour les passagers. Le nom interne
devient `discover`, tandis que `/search` reste exclusivement la recherche.
Le catalogue est partagé avec `/services`, les formulaires et détails restent
dans la pile principale. Le profil ouvre l’onglet pour un conducteur, l’écran
autonome pour un passager. Les racines d’onglet n’affichent pas de flèche retour ;
l’espace de la barre superposée iOS est réservé sans doubler celui d’Android.
Après activation conducteur confirmée, le rôle Redux est synchronisé uniquement
pour le même compte, sans changement optimiste ni écrasement du reste du profil.

**Préservation.** Bouton Chercher de l’accueil, filtres de recherche, bannière
de trajet en cours, demandes/devis et validation contractuelle inchangés.
Les réglages natifs de gel/détachement sont conservés. Aucun nouveau polling,
GPS, modal, dépendance ou appel réseau ; montage différé de l’onglet et lectures
suspendues lorsqu’il est inactif. Le changement de rôle ne remonte pas toute la
barre d’onglets. Les brouillons restent dans leurs écrans de formulaire.

**Vérifications.** TypeScript mobile valide. 92 tests JavaScript ciblés réussis,
dont 13 nouveaux cas concernant les accès, layouts et activation du compte. Garde-fous réseau et
taille valides : 931 sources, aucune au-dessus de 400 lignes. La recette native
iOS/Android, notamment retours, clavier et changement de compte, reste à faire ;
aucune mesure de mémoire/CPU ou garantie d’absence de crash n’est annoncée.

Fichiers, règles d’accès et recette : [Onglet Services selon le compte](ZWANGA_SERVICES.md#onglet-services-selon-le-compte--24-septembre-2026).

## 24 septembre 2026 — Services pro mobile : catalogue et formulaire guidé

**Problème.** Le catalogue donnait autant de place aux services futurs qu’aux
demandes utilisables. Le formulaire affichait tous les champs et documents en
une seule fois, sans récapitulatif ni validation précise par étape.

**Solution appliquée.** Service ouvert mis en avant, dossiers remontés avant les
services futurs, statuts lisibles et aperçu des réponses de l’équipe. Formulaire
en trois étapes : besoin, coordonnées, vérification ; champs facultatifs repliés,
sélection multiple accessible, récapitulatif modifiable et confirmation d’envoi.
Action principale en pied d’écran, dans la zone sûre et le conteneur de gestion
du clavier. Retour entre étapes sans effacer les champs. Aucun nouveau modal.

**Conservation et précautions.** Transport RTK Query et contrat API inchangés,
aucune modification backend, aucun financement activé. Clé et contenu identiques
pour réessayer un envoi incertain, garde synchrone contre le double appui, pas
de publication de résultat dans un formulaire démonté. Aucun nouveau polling,
paquet, suivi GPS ou animation continue. Brouillon conservé uniquement tant que
le formulaire reste monté, pas après fermeture complète de l’application.

**Vérifications.** TypeScript mobile valide ; 15 nouveaux tests JavaScript
réussis (parcours, validation, réponses tardives, non-duplication et interactions
UI simulées). Avec les tests Services existants et profil : 36/36 ; tests des
layouts de formulaires existants : 9/9. Garde-fous
réseau et taille valides : 929 sources, aucune au-dessus de 400 lignes.
Pas de test visuel natif ou sur appareil physique : zones sûres, clavier et
grandes polices à recetter sur iOS/Android, sans garantie d’absence de crash.

Fichiers concernés, parcours et recette : [Services pro — refonte UX mobile](ZWANGA_SERVICES.md#refonte-ux-mobile--24-septembre-2026).

## 24 septembre 2026 — Zwanga Services : demandes, devis et validation obligatoire

**Problème.** Demandes de documents web/mobile dispersées, confusion avec
l’abonnement Pro, absence de suivi partagé des devis, avances et originaux.

**Solution appliquée.** Catalogue extensible et parcours Services pro dans le
profil ; nouvelles demandes web reliées au même backend ; back-office dédié ;
dossiers, consentements, devis versionnés, écritures vérifiées et registre de
garde/restitution séparés. Contrat validé obligatoire côté serveur : aucune
condition activée par défaut. Les futurs services ouvrent seulement la
collecte des besoins tant que leur métier n’est pas implémenté.

**Conservation et validation.** Aucun changement aux paiements des trajets ou
aux gains ; aucune retenue automatique. Anciens dossiers conservés. TypeScript
valide sur les trois projets ; 31 tests backend, 3 tests mobile et 5 tests site
ajoutés et réussis. Suite mobile globale : 914/916, deux échecs d’empreintes
préexistants. Pas de migration exécutée ni de test sur appareil physique.

Fichiers, règles, limites et déploiement : [Zwanga Services](ZWANGA_SERVICES.md).

## 24 septembre 2026 — Véhicule identifiable hors navigation et rappel compact

**Problème constaté.** Le modal de prise en charge sur l'accueil affichait un
long paragraphe avec des informations véhicule absentes, alors que la navigation
connaissait le véhicule. `BookingsService.findAllByPassenger` ne chargeait pas
`trip.vehicle`. L'accueil utilisait uniquement le trajet imbriqué dans la
réservation, sans réutiliser son détail déjà chargé. Enfin, `vehicleInfo` contient
une description du trajet ou un texte générique : ce n'est pas une marque/modèle.

**Solution effectivement appliquée.**

- Backend, `zwanga-backend/src/bookings/bookings.service.ts` : ajout de la relation
  `trip.vehicle` à la lecture existante des réservations du passager, avec ou sans
  `scope=activity`. Aucun nouvel endpoint ni migration. Le filtrage par passager,
  le traitement des interruptions et les aperçus d'itinéraire restent inchangés.
- `hooks/home/useHomeTracking.ts`, `features/home/homeTrackingDialogs.ts` et
  `features/navigation/pickupAwareness.ts` : réutilisation du détail actif déjà
  chargé, puis du trajet de la réservation si nécessaire, avec contrôle de l'ID
  du trajet et du véhicule pour ne pas reprendre un véhicule remplacé. Les données
  fraîches sont accessibles au callback socket sans réabonnement. Aucun appel
  supplémentaire pour ouvrir le modal et aucun recours au véhicule par défaut
  du conducteur ou à la description du trajet pour inventer une identité.
- `features/navigation/PickupVehicleDetails.tsx` et `pickupPassengerDialog.ts` :
  bloc partagé avec marque/modèle, couleur et plaque contrastée, sans troncature
  volontaire de la plaque. Une consigne courte remplace le paragraphe ; en absence
  totale de données, une seule phrase invite à vérifier avec le conducteur.
  La composition sobre choisie pour l'interface supprime les répétitions et,
  grâce au fonctionnement existant de `DialogProvider`, le grand pictogramme
  des alertes hors navigation. Aucun téléchargement de photo ni animation ajoutée.
- `hooks/trip-detail/useTripDetailProgressNotices.ts`,
  `hooks/passenger-navigation/usePassengerNavigationPresentation.ts` et
  `app/booking/navigate/[id].tsx` : même présentation dans le détail et la
  navigation passager. La voix et la notification locale conservent un rappel
  textuel adapté, tandis que les modals séparent consigne et identité du véhicule.

**Comportements conservés.** Seuils de proximité, actions de fermeture,
compte à rebours de navigation, messages conducteur, confirmations d'embarquement,
dépose et paiements inchangés. Déduplication par réservation, pas par place ;
les événements d'un autre passager et ceux reçus après sortie de l'accueil
restent ignorés. Réutilisation des modals et de leur coordination existante,
sans nouveau modal natif, polling, abonnement GPS ou minuteur.

**Vérifications réalisées.** Tests enrichis dans `tests/pickupVehicleNotices.test.js`,
`tests/pickupProximity.test.js` et `tests/homeModules.test.js` : trajet incomplet,
détail chargé ensuite sans reconnexion socket, véhicule manquant/remplacé,
plaque lisible, bon rôle et réservation de plusieurs places. Suite ciblée avec
multi-passagers et cycle de vie de navigation : **60/60**. Backend : **2/2** dans
`src/bookings/pickup-vehicle-read.spec.ts` (dépôt/cache simulés, relations et
filtres contrôlés, pas de base réelle). Suite mobile complète : **911/913**, avec
les deux échecs préexistants de `tests/sourceExtractions.test.js` sur les
empreintes des styles de réservation et de l'API utilisateur/PIN. TypeScript
mobile et backend production validés. ESLint sans erreur : aucun avertissement
dans le nouveau bloc et le branchement accueil ; 19 avertissements dans l'ensemble
des sources modifiées du worktree, déjà présents avant cette intervention.
Frontière réseau et `git diff --check` validés ; **915 sources mobiles**, aucune
au-dessus de 400 lignes.

**Limites et déploiement.** Modifications locales, non déployées. Déployer aussi
le backend pour enrichir les réponses de réservations ; les listes non actives
déjà en cache restent soumises à leur expiration habituelle, sans purge forcée.
L'accueil actif contourne déjà ce cache. Les tests UI sont JavaScript avec les
dépendances natives simulées ; aucun essai sur iPhone ou Android physique.
Vérifier visuellement l'accueil et la navigation, notamment sur petit écran et
en grande police. Aucune mesure nouvelle de chauffe, de mémoire ou de crashs.

## 24 septembre 2026 — Rappel du véhicule dans les modals au point de récupération

**Problème.** Le rappel du véhicule était déjà affiché pendant la navigation
passager, mais les messages « Vous êtes au point » et « Le conducteur est là »
de l'accueil et du détail du trajet ne le reprenaient pas encore.

**Solution appliquée.** `features/home/homeTrackingDialogs.ts` et
`hooks/trip-detail/useTripDetailProgressNotices.ts` ajoutent le rappel partagé
`pickupVehicleReminder` aux messages passager `parties_nearby` et
`driver_arrived_pickup` : marque/modèle, couleur, plaque et invitation à vérifier
le véhicule avant de monter. L'accueil invite le passager à se signaler, sans
affirmer que les deux personnes sont forcément présentes ensemble. Le rappel
de la navigation passager, déjà fourni par `usePassengerNavigationPresentation`,
est conservé et couvert par les nouveaux tests.

**Comportements conservés.** Données du véhicule associé au trajet déjà chargées ;
aucune substitution par le véhicule par défaut du conducteur. Les informations
absentes restent explicitement non renseignées. Aucun nouvel appel réseau,
polling, minuteur, modal supplémentaire ni changement des seuils de proximité.
Les messages conducteur, l'embarquement, les paiements, la déduplication et
l'identification par réservation plutôt que par place sont conservés.

**Vérifications.** Six nouveaux tests dans `tests/pickupVehicleNotices.test.js` :
accueil, navigation et détail, variantes iOS/Android simulées, informations absentes,
bon véhicule, message conducteur inchangé, doublons et autre réservation.
Suite ciblée avec proximité, accueil et multi-passagers : **44/44 tests réussis**.
TypeScript sans émission validé. ESLint ciblé sans erreur (trois avertissements
préexistants dans le hook du détail).
Contrôles de frontière réseau, taille des sources et `git diff --check` validés :
913 sources mobiles, aucune au-dessus de 400 lignes.

**Limites.** Tests JavaScript avec dépendances natives simulées, pas d'essai sur
téléphone physique. Vérifier la lisibilité des textes sur petit écran et avec
une grande taille de police. Aucun changement backend ni déploiement dans cette
intervention ; aucune garantie nouvelle contre les crashs ou la chauffe.

## 24 septembre 2026 — Alerte de prise en charge dès 300 mètres

**Problème.** Le seuil d'approche était de 200 mètres côté mobile et backend.
La navigation conducteur ignorait l'événement d'approche et attendait l'arrivée
au point de prise en charge. Le rappel passager ne précisait pas le véhicule.

**Solution appliquée et fichiers.**

- `constants/rideProgress.ts` et `zwanga-backend/src/bookings/bookings.service.ts` :
  seuil d'approche porté à **300 mètres inclus**. Les positions et événements
  existants sont réutilisés. Le serveur et le conducteur comparent la position
  du conducteur au point de prise en charge ; le repli local passager utilise
  sa position si disponible, sinon le point de rendez-vous. Ce sont des distances
  géographiques approximatives, pas une distance routière restante.
- `useDriverRouteProgressTracking.ts`, `useDriverTrackingSocket.ts` et
  `useDriverPickupNoticeQueue.ts` dans `hooks/driver-navigation/`, avec les types,
  priorités et `NavigationPickupNoticeModal.tsx` dans `features/driver-navigation/` :
  prise en compte de l'approche, nom du passager, distance, modal existant et voix.
- `features/navigation/pickupAwareness.ts` centralise le rappel de la marque,
  du modèle, de la couleur et de la plaque du **véhicule associé au trajet**.
  Une information manquante est indiquée comme telle ; aucun véhicule par défaut
  du conducteur n'est substitué. Les hooks `usePassengerDriverCameraTracking`,
  `usePassengerNavigationController`, `usePassengerNavigationNotices` et
  `usePassengerNavigationPresentation` réutilisent ce texte dans le modal,
  la notification locale existante et la voix.
- `hooks/home/useHomeTracking.ts`, `features/home/homeTrackingDialogs.ts`,
  `hooks/manage-trip/useManageTripTracking.ts` et
  `hooks/trip-detail/useTripDetailProgressNotices.ts` relaient aussi l'approche
  avec un texte adapté au rôle. Le passager signalé à l'avance ne consomme plus
  l'alerte d'approche. Les priorités plus avancées restent mémorisées.

**Précautions et comportements conservés.** Déduplication par réservation et
type d'événement pendant la session d'écran ; file conducteur existante, sans
multiplier les alertes par le nombre de places. Une arrivée déjà présentée bloque
l'alerte d'approche tardive. La navigation passager ignore les autres réservations,
les événements hors écran et les réservations embarquées/déposées ; une annonce
vocale asynchrone devenue obsolète est ignorée. Aucun nouveau polling, abonnement
GPS, appel de profil/véhicule, stockage persistant ou modal natif indépendant.
Le seuil d'arrivée à la prise en charge (80 m), celui de présence (5 m), les règles
d'embarquement serveur, de dépose et de paiement restent inchangés.

**Vérifications.** Tests de comportement ajoutés dans `tests/pickupProximity.test.js`,
`tests/multiPassengerNavigation.test.js` et `tests/homeModules.test.js` : limite
300/301 m, distinction avec l'arrivée, véhicule associé/informations absentes,
groupes de plusieurs places, déduplication, file multi-réservations, préparation
avant approche et événements obsolètes. Dernière suite ciblée : **38/38** ; autre
passage élargi navigation/reprise/accueil : **88/88**. Suite mobile complète exécutée :
**900/902**, avec les deux échecs préexistants d'empreintes de
`tests/sourceExtractions.test.js` (styles des réservations et API utilisateur/PIN).
Backend : **57/57** dans `bookings.service.spec.ts`, notamment 250/300/301 m ;
deux attentes existantes adaptées car leurs positions à environ 223 m génèrent
désormais aussi l'événement d'approche, sans modifier leurs validations
d'embarquement. TypeScript mobile et backend production validés. ESLint ciblé :
aucune erreur, 19 avertissements dans les zones déjà concernées sur HEAD
(20 avertissements sur ces fichiers avant modification). Frontière réseau et
`git diff --check` validés ; 913 sources mobiles, aucune au-dessus de 400 lignes.

**Limites et déploiement.** Changements locaux non déployés : mettre à jour aussi
le backend pour aligner les événements serveur. Tests JavaScript avec dépendances
natives simulées ; aucun essai sur iPhone/Android physique. Vérifier un passage
350 → 300 → 80 m avec deux réservations, la lecture du véhicule et le retour de
veille. Le déclenchement dépend des positions reçues et de leur précision ; il
n'est pas garanti exactement au franchissement du seuil, ni lorsque l'application
est fermée. La notification locale dépend des autorisations du téléphone.
Aucune garantie nouvelle d'absence de crash ou de chauffe.

## 24 septembre 2026 — Photo du demandeur sur l'accueil

**Problème.** Les cartes de demandes dans la liste de l'accueil et la demande
mise en avant n'affichaient pas la photo du passager, pourtant disponible dans
`TripRequest.passengerAvatar` après le mapping de la réponse API.

**Solution appliquée.** `components/home/TripRequestPreviewCard.tsx` et
`components/home/HomeRequestHighlightCard.tsx` transmettent désormais la photo et
le nom du demandeur au composant existant `CompactTripCard`. La demande mise en
avant affiche aussi son nom. Réutilisation de `CompactCardAvatar` : image ronde
de 32 × 32, initiales sous l'image pendant son chargement, avatar à initiales si
l'URL est absente/vide. Un nom vide utilise « Passager Zwanga ».

**Comportements conservés.** Largeur des cartes, composants mémorisés, liste
virtualisée, budget par place, horaires, places et actions d'ouverture/swipe
inchangés. Aucune requête de profil, aucun polling, timer ou état ajouté ; seule
l'image référencée est chargée par le composant natif existant. Pas de modification
des cartes de recherche, des priorités de classement ou du backend.

**Vérifications.** Nouveau cas dans `tests/homeCompactCards.test.js` : photo,
initiales, URL vide, nom manquant, changement de photo, dimensions, nom accessible
et ouverture de la bonne demande. Suite ciblée accueil/cartes compactes : 109/109
tests réussis. TypeScript sans émission et ESLint ciblé validés ; `git diff --check`
validé ; 912 sources contrôlées, aucune au-dessus de 400 lignes. Tests JavaScript
avec composants natifs simulés : aucun essai visuel sur appareil physique ni
mesure de performance native effectué pour cette modification.

## 23 septembre 2026 — Correctifs de résilience après la dernière revue

Les renouvellements de session sur réseau instable, réponses tardives après changement
de compte/écran, blocages des actions conducteur par des relectures et accumulation
des états locaux de paiement ont été corrigés côté mobile. Le suivi GPS conserve son
contexte récupérable sans autoriser d'envoi HTTP avec un jeton d'accès expiré.

Le [compte rendu détaillé](CORRECTIFS_RESILIENCE_2026_09_23.md) précise, pour chaque
point, le problème, les fichiers et solutions appliquées, les comportements conservés,
les tests, les limites et les validations natives restant nécessaires. Aucun backend,
paiement réel, build natif ou déploiement modifié/exécuté pour cette intervention.

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

## 23 septembre 2026 — Corrections des cinq risques de performance de l'audit

**Problèmes.** Reprise REST/GPS conducteur répétée hors écran, suivi passager trop
précis avant départ, sauvegardes identiques du suivi conducteur, historiques
financiers non bornés et accumulation/rechargement des pages de messagerie.

**Solutions appliquées.** Reprise liée au focus avec protection contre les réponses
tardives ; profil GPS équilibré en attente, précis pendant le trajet ; stockage
conducteur sérialisé sans écritures identiques ; nouvelles API financières paginées,
totaux globaux et listes virtualisées ; fenêtre de chat bornée avec accès aux
anciens et nouveaux messages. Formulaire de partage wallet extrait pour respecter
400 lignes. Les règles de trajet, paiement, versement et confirmation sont conservées.
Le guide PostgreSQL a orienté les curseurs et index composites ; migration préparée,
non exécutée, avec précautions de verrouillage documentées.

**Vérifications.** 776/778 tests mobile réussis ; deux références de tests déjà en
échec sur HEAD, hors fichiers métier modifiés. 54/54 tests backend ciblés réussis.
Typage mobile et backend production validé ; aucune source applicative au-dessus
de 400 lignes. Pas d'essai natif ni de mesure de chauffe : aucune promesse de
disparition des crashs. Backend à déployer avant le mobile pour profiter pleinement
des bornes mémoire/réseau ; anciens contrats API conservés pendant la transition.

**Détails, fichiers, mesures et limites :** [Correctifs de performance du 23 septembre](PERFORMANCE_AUDIT_2026_09_23.md).

## 23 septembre 2026 — Fermetures iOS, concurrence GPS et intégration native Android

**Problèmes.** Risques de session GPS passager supprimée par un ancien arrêt,
de retour `onDismiss` absent bloquant une action, de notification globale native
concurrente, de timer passager inutile et de lectures financières intégrales.
Le patch Android de dessin était absent des AAR effectivement utilisés ; le
crash SoLoader signalé exige aussi un contrôle de l'artefact livré.

**Solutions.** File GPS commune avec révision avant permissions ; notification
de paiement conducteur dans les panneaux internes ; secours de démontage iOS
avant libération du blocage ; timer lié à l'écran et arrêté à zéro ; route backend
de contexte de paiement consommée via RTK Query. Compilation des sources corrigées
de React Native/Hermes pour les builds release, et contrôle des bibliothèques/ABI
dans APK/AAB. Le debug habituel garde ses dépendances précompilées.

**Préservation et validation.** Règles de trajet et de paiement, reçus, reprise
d'abonnement, formulaires natifs et anciennes API conservés. Le guide PostgreSQL
a orienté les lectures ciblées par compte. Mobile : 789/791 tests réussis, deux
références préexistantes en échec. Backend : 33 tests ciblés réussis. Typage,
ESLint ciblé, frontières réseau et limite de 400 lignes validés.

Gradle confirme la substitution de dépendance, mais la préparation Hermes release
échoue ici faute de compilateur C++ hôte Windows. Aucun nouveau binaire release,
déploiement ou essai physique. Le crash SoLoader et les freezes de production
ne sont pas déclarés éliminés. Backend puis nouveaux builds natifs à valider
avant diffusion ; précautions et matrice de tests détaillées dans le document.

**Détails, fichiers et limites :** [Stabilité mobile — complément du 23 septembre](STABILITE_MOBILE_2026_09_23.md).

## 23 septembre 2026 — Récapitulatif des déposes compact dans la navigation

**Problème.** Le reçu de dépose affichait directement sur la carte le total,
les lignes financières, une explication, l'actualisation et la confirmation du
cash. Il occupait une grande partie de la navigation ; le sélecteur horizontal
montait également un bouton par passager.

**Solution appliquée.** `features/driver-navigation/DriverDropoffReceipts.tsx`
affiche une seule barre compacte (hauteur minimale de 64 points, pas une hauteur
fixe imposée aux grandes polices) : nombre de déposes, dernier passager, montant
et état du gain. Le guide d'interface a orienté le choix d'un résumé sobre avec
les détails à la demande, au lieu de superposer des reçus sur la carte.

Un toucher ouvre `DriverDropoffReceiptsSheet.tsx`, panneau interne limité à 80 %
de hauteur, avec fermeture explicite, zone sûre inférieure et FlatList virtualisée
(six éléments initiaux, fenêtre de trois écrans). Un seul passager est développé.
Les détails existants et `ConfirmCashReceipt` sont réutilisés sans changement de
calcul ni de validation. Une nouvelle dépose n'interrompt pas le reçu sélectionné
ni une confirmation de cash en cours dans ce panneau.

`DriverBookingRevenue.tsx` propose un affichage compact optionnel. Le total prévu
n'est jamais libellé « Gains crédités » ou « Cash reçu » si la ligne correspondante
ne couvre pas tout ce total. Les montants mixtes restent accompagnés de « Total ·
voir le détail ». Une erreur ou des données d'un autre passager ne deviennent pas
un gain nul inventé. L'affichage détaillé des autres écrans reste inchangé.

**Précautions.** Pas de nouveau modal natif UIKit : réemploi de `RideModal inApp`.
Aucune ouverture automatique à la dépose ; fermeture à la perte de focus, à la
veille ou au changement de trajet. La barre et le panneau ne montent pas leurs
lecteurs financiers simultanément : un seul reçu à la fois, sans nouveau polling,
timer, flux GPS ni requête par ligne de passager. Tous les appels restent RTK Query.
Le cash reste confirmé explicitement par le conducteur et n'est pas assimilé à
un crédit du portefeuille. Aucun changement backend ou paiement réel.

**Vérifications.** 49 tests ciblés réussis : reçus détaillés/compacts, cash, entêtes,
urgence, confirmations manuelles et panneaux iOS/Android. Tests complétés dans
`tests/driverBookingRevenue.test.js`, dont une liste simulée de 100 passagers,
sélection conservée à une nouvelle dépose, fermeture hors écran et distinction
entre gain crédité, cash, attente et total mixte. TypeScript sans émission, ESLint
ciblé, frontière réseau et `git diff --check` validés. 898 sources applicatives
contrôlées, aucune au-dessus de 400 lignes. Ce sont des tests JavaScript et de
structure, pas une mesure native de fluidité ni une validation visuelle sur
appareil. Vérifier petits écrans, grandes polices et défilement sur iOS/Android.

## 23 septembre 2026 — Masquer le récapitulatif de dépose par balayage

**Problème.** Même compact, le récapitulatif des gains occupait la carte après
consultation. Il fallait permettre au conducteur de le masquer sans perdre
l'accès aux reçus et à la confirmation du cash.

**Solution appliquée.** `features/driver-navigation/DriverDropoffReceipts.tsx`
accepte un balayage horizontal vers la gauche ou la droite pour masquer la barre.
Un toucher continue d'ouvrir le détail. Aucune annulation ni message supplémentaire
ne reste sur la carte. Une action équivalente est proposée aux lecteurs d'écran.
`DriverNavigationControls.tsx` ajoute « Gains des passagers » aux options dès
qu'une dépose est confirmée : le même panneau virtualisé reste accessible après
masquage, avec ses reçus et la confirmation explicite du cash reçu.

`driverDropoffReceiptsModel.ts` partage le filtrage existant des déposes du trajet
et construit une clé stable à partir du trajet et des identifiants de réservation.
Une nouvelle dépose fait réapparaître la barre ; un simple rafraîchissement des
données, un changement de montant ou d'ordre ne la réaffiche pas. Le masquage est
un état local conservé tant que ce composant reste monté, sans persistance ni
modification d'une réservation. Quitter puis remonter la navigation peut donc
réafficher le récapitulatif.

**Précautions.** Réemploi de `components/home/SwipeableHomePriority.tsx`, avec un
libellé optionnel adapté aux reçus ; le libellé et le fonctionnement de l'accueil
restent inchangés. Animation sur le thread UI, sans callback JavaScript à chaque
image, seuil horizontal et abandon sur mouvement vertical. Les protections
existantes annulent les callbacks tardifs après démontage, changement de clé ou
désactivation. Le geste est désactivé hors écran et lorsqu'un panneau interne est
ouvert. La lecture financière compacte est également suspendue derrière ce
panneau. Aucun nouveau polling, timer, flux GPS, modal natif ni appel réseau
hors RTK Query. Aucun montant, paiement ou encaissement n'est modifié par le swipe.

**Vérifications.** 53 tests ciblés réussis : reçus/cash, options de navigation,
gestes gauche/droite, callbacks annulés, compilation des worklets avec la
configuration Babel de production, cartes d'accueil et panneaux internes.
Tests complétés dans `tests/driverBookingRevenue.test.js`,
`tests/navigationHeaders.test.js` et `tests/homePriorityGesture.test.js`.
TypeScript sans émission, ESLint ciblé, frontière réseau et `git diff --check`
validés ; 899 sources applicatives contrôlées,
aucune au-dessus de 400 lignes. Les tests JavaScript ne remplacent pas un essai
natif : vérifier le balayage dans la zone défilante, le déplacement de la carte,
les retours depuis les panneaux et VoiceOver/TalkBack sur iOS et Android.
Aucune disparition des freezes ou crashs n'est annoncée sans ces essais.

## 23 septembre 2026 — Plusieurs réservations pendant un trajet et validation des groupes

**Problème.** Les confirmations détaillées prenaient trop de place avec plusieurs
réservations, des avis d'embarquement se remplaçaient et les compteurs confondaient
titulaire et personnes transportées. Il fallait aussi garantir qu'une réservation
de trois places demande une réponse du titulaire, pas trois validations séparées.

**Solution appliquée.** Actions et sélections attachées à `bookingId`, comptage des
personnes par places, listes virtualisées à détail unique, avis éphémères en file
bornée, contrôles de concurrence et de cycle de vie, filtrage des réservations du
compte passager. Les confirmations, descentes anticipées, paiements et gains
précisent la portée du groupe. Le backend local contrôle déjà le titulaire et
compte les confirmations par réservation ; aucun changement backend dans ce lot.

**Détail, fichiers et précautions.** Voir
[Trajets multi-passagers](TRAJETS_MULTI_PASSAGERS.md). Détection automatique,
file de confirmations hors connexion, paiement autoritatif serveur, validation
explicite du cash, SOS et swipe des reçus conservés. Aucun polling supplémentaire.

**Vérifications.** 102 tests ciblés réussis. Suite complète : 807 tests exécutés,
805 réussis ; les deux échecs préexistants de `tests/sourceExtractions.test.js`
restent présents (empreintes historiques des styles de réservations et de
l'API utilisateur/PIN, fichiers non modifiés par ce correctif). Ces empreintes
n'ont pas été réécrites pour masquer les échecs. TypeScript sans émission et
ESLint ciblé validés sans erreur ni avertissement. Frontière réseau et
`git diff --check` validés ; 903 sources contrôlées, aucune au-dessus de 400 lignes.
Les tests sont JavaScript ; aucun essai natif de longue durée n'est annoncé.
Les scénarios iOS et Android restant à exécuter figurent dans le document spécialisé.

## 23 septembre 2026 — Débloquer « Continuer avec le paiement cash »

**Problème constaté.** Le bouton envoyait systématiquement une modification du
mode de paiement, même pour une réservation déjà en cash. Cela rendait une simple
consultation dépendante du réseau. Le code local du backend refuse ce changement
lorsque `cashReceivedAt` est déjà renseigné, avant même de vérifier que le mode
est inchangé. Le mobile ne traitait pas cet encaissement cash comme un règlement
terminé et pouvait encore demander de remettre l'argent. Une erreur serveur
pouvait rester en bas du formulaire défilant, hors de la zone du bouton.
Ces cas ont été reproduits par des tests JavaScript ; faute de trace du clic
signalé, ils ne constituent pas une confirmation du scénario précis en production.

**Solution appliquée.**

- `hooks/arrival-payment/useArrivalPaymentSubmission.ts` ouvre directement le
  récapitulatif si la réservation est déjà en cash. Aucun changement de mode ni
  encaissement n'est envoyé dans ce cas. Les rafraîchissements existants du
  récapitulatif restent non bloquants.
- Lors d'un vrai changement depuis les jetons ou le paiement électronique,
  l'application attend toujours la réponse de la mutation RTK Query. Elle vérifie
  la réservation, le mode cash et le montant retournés avant d'afficher la suite.
  Le montant du groupe reste le montant serveur, sans multiplication par les places.
- `features/arrival-payment/buildPaymentCompletionSummary.ts` distingue cash
  encore à remettre et réception déjà confirmée par le conducteur. Le second cas
  n'invite plus le passager à payer de nouveau.
- `useArrivalPaymentState.ts` propose de terminer lorsque le serveur indique le
  cash reçu. `useBookingPaymentMode.ts` privilégie le mode effectivement réglé
  sur un ancien choix local non soumis.
- `ArrivalPaymentActions.tsx`, `ArrivalPaymentFields.tsx` et
  `components/PassengerArrivalPaymentCoordinator.tsx` affichent les erreurs de
  soumission près des boutons fixes, au lieu du bas du formulaire. Pendant
  l'enregistrement du mode cash, le libellé devient « Enregistrement… ».

**Comportements conservés.** Le passager ne confirme jamais l'encaissement à la
place du conducteur. Un paiement externe connu comme encore en attente bloque
toujours le changement de mode ; ses références ne sont ni effacées ni annulées
par ce bouton. Le cash n'est pas proposé avant l'arrivée. Le verrou anti-double
clic, les montants d'interruption, les trajets gratuits, les réservations de
groupe, le bouton de fermeture et l'isolation entre comptes sont conservés.
Aucun nouveau polling, endpoint, modal natif ou débit de jetons. Aucun changement
backend : lecture de `bookings.service.ts` et `cash-receipts.service.ts` seulement.

**Vérifications.** Trois échecs reproduits avant correction dans les tests de
soumission/récapitulatif cash, puis 72 tests ciblés réussis après correction.
Couverture : cash déjà sélectionné, cash reçu, changement réel de mode, réponse
incohérente, montant groupe, double clic, panne réseau, paiement externe en attente,
déconnexion pendant la requête, ancien choix local et erreur visible près du bouton.
Suite complète : 815 tests, 813 réussis et les deux mêmes échecs préexistants de
`tests/sourceExtractions.test.js` (styles de réservations et API utilisateur/PIN),
sans modification de ces fichiers ni de leurs empreintes dans ce correctif.
TypeScript et ESLint ciblé validés sans erreur ni avertissement ; frontière réseau
et `git diff --check` validés. 903 sources contrôlées, aucune au-dessus de 400 lignes.
Les tests sont JavaScript ; le clic sur iPhone/Android et le backend déployé n'ont
pas été testés. Vérifier sur appareil une réservation cash déjà encaissée et le
passage au cash après un échec électronique confirmé.

## 23 septembre 2026 — Réservation en navigation : boutons coupés et chevauchement

**Périmètre et problème constaté.** Navigation conducteur, réception d'une
réservation pendant un trajet. Le bloc était placé après les statistiques et le
prochain arrêt dans une zone défilante limitée à 30 % de l'écran. Sur la capture
signalée, « Refuser / Accepter » étaient partiellement coupés et la colonne des
commandes de carte empiétait sur les actions. Le mode de paiement partageait aussi
la même ligne que les deux boutons. L'erreur technique tronquée au bas de la
capture a été exclue de ce correctif à la demande de l'utilisateur ; aucune
correction de cette erreur n'est revendiquée.

**Solution appliquée et fichiers.**

- `DriverNavigationPassengersBar.tsx` affiche en priorité une seule réservation
  en attente, avec le nombre des suivantes, sans empiler les cartes des autres
  passagers au-dessus. Une demande de descente urgente conserve la priorité.
- `DriverPendingBookingPrompt.tsx` extrait une carte compacte : titulaire, nombre
  de places, mode de paiement, départ et destination. Les détails peuvent défiler
  si la hauteur disponible est insuffisante. Les boutons restent dans un pied
  séparé non rétractable, avec des cibles d'au moins 44 points, une hauteur
  adaptable et un retour à la ligne possible. Le défilement des détails est
  réinitialisé uniquement lorsque la réservation affichée change.
- `DriverNavigationTopPanel.tsx` sort la réservation de la liste secondaire
  limitée à 30 %. Pendant cet affichage, les confirmations restent accessibles
  via leur bouton compact, sans le texte d'aide secondaire. Contact, SOS et sortie
  de navigation restent accessibles. Les détails habituels reviennent à la fin
  de la file des réservations.
- `DriverNavigationControls.tsx` dispose temporairement les quatre commandes de
  carte sur une rangée. `driverPendingBookingLayout.ts` partage le calcul de
  l'espace réservé entre cette rangée et le panneau supérieur, en tenant compte
  de la hauteur de fenêtre et des marges système. Le menu Options s'ouvre
  au-dessus de la rangée, dans les limites tactiles de son parent. La disposition
  habituelle est rétablie quand la réservation n'est plus affichée.

Les composants et le calcul de disposition se trouvent dans
`features/driver-navigation/`. La composition compacte conserve les couleurs
de l'application et n'ajoute ni animation ni modal.

**Précautions et comportements conservés.** Aucun changement d'API, de prix ou de
paiement. Les mutations RTK Query, la file de réservations, les verrouillages
anti-double clic et le ciblage par identifiant de réservation sont conservés.
Une réservation de plusieurs places reste une seule action pour son titulaire.
Pause/interruption, guidage vocal, recalcul, options et reçus conservent leurs
gestionnaires. Aucun nouveau polling, abonnement GPS, écouteur ou minuteur.

**Vérifications.** 30 tests JavaScript ciblés réussis, dont quatre nouveaux dans
`tests/driverPendingBookingLayout.test.js` : priorité du bloc, urgence prioritaire,
actions hors défilement, réservation de trois places, état de traitement,
commandes conservées et limites tactiles du menu. Suite complète : 819 tests,
817 réussis et les deux échecs préexistants de `tests/sourceExtractions.test.js`
(empreintes historiques des styles de réservations et de l'API utilisateur/PIN).
Les fichiers concernés par ces échecs et leurs empreintes n'ont pas été modifiés.
TypeScript sans émission, ESLint ciblé, frontière réseau et `git diff --check`
validés ; 905 sources contrôlées, aucune au-dessus de 400 lignes.
Le contrôle des dimensions teste les propriétés de
disposition, pas le rendu natif de Yoga. La vérification visuelle sur iPhone et
Android reste à effectuer, notamment avec grande police, petit écran, plusieurs
réservations successives et arrivée simultanée d'une demande de descente.
Aucune absence de crash, de blocage ou de chauffe n'est déduite de ces tests.

## 23 septembre 2026 — Confirmation passager de l'interruption du conducteur

**Périmètre et problème constaté.** Le signalement concerne la confirmation de
l'arrêt demandé par le conducteur, et non la confirmation de dépose. Le code
ignorait la réponse de confirmation et attendait les rechargements du trajet et
de la réservation avant de libérer l'action. Des lectures lentes pouvaient ainsi
laisser l'écran inchangé ; une lecture rejetée pouvait faire afficher une erreur
après une confirmation déjà acceptée. Ces comportements ont été reproduits dans
les tests JavaScript. De plus, le bouton permettant de retrouver le choix
« attendre ou s'arrêter ici » était dans un bloc réservé aux trajets en cours :
il disparaissait lorsque le serveur mettait le trajet en pause.

**Solution effectivement appliquée et fichiers.**

- `hooks/passenger-navigation/usePassengerNavigationInterruption.ts` vérifie la
  réponse serveur (trajet, demande d'interruption, réservation, titulaire et
  confirmation), puis reflète immédiatement cette réponse. Les lectures de
  réconciliation continuent sans bloquer l'action et leurs erreurs ne sont plus
  présentées comme un échec de la confirmation. Un acquittement local, limité à
  cette demande et posé seulement après succès, empêche une lecture ancienne de
  réactiver les boutons. Confirmation et refus conservent le verrou anti-double
  clic ; les callbacks devenus obsolètes après changement de demande, de
  réservation ou sortie de l'écran sont ignorés.
- `store/api/trip/interruptionResponseCache.ts` réutilise la réponse serveur dans
  les caches RTK Query du trajet, de la réservation et des listes personnelles.
  La liste d'activité alimente notamment le modal global « attendre / s'arrêter ».
  Les mises à jour sont limitées au compte et à la réservation concernés ; une
  demande remplacée ou un trajet terminé ne doivent pas être rétablis par une
  réponse ancienne. Aucun statut de paiement ou de dépose n'est déduit de la pause.
- `hooks/passenger-navigation/usePassengerNavigationData.ts` et
  `usePassengerNavigationController.ts` relient cette synchronisation au parcours
  existant. Aucun nouvel endpoint ni abonnement réseau n'est ajouté.
- `features/passenger-navigation/PassengerNavigationInfoCard.tsx` conserve
  `PausedPassengerRideNotice` accessible en dehors du bloc « trajet en cours »
  et affiche « Le trajet est en pause » lorsque l'interruption est confirmée.

**Comportements conservés et précautions.** Le backend reste la source de vérité :
un clic ne valide pas l'arrêt localement avant sa réponse. Le titulaire répond
pour toutes les places de sa réservation ; plusieurs réservations restent des
réponses distinctes. La pause n'est appliquée qu'après les confirmations requises
par le backend. Confirmer l'interruption ne confirme ni dépose ni encaissement :
les choix attendre/s'arrêter, le calcul du montant et le paiement gardent leurs
parcours séparés. Aucun nouveau modal natif, polling, minuteur ou suivi GPS.
Lecture seulement de `trips.controller.ts`, `trips.service.ts` et
`driver-interruption.workflow.ts` côté backend : aucune modification ou opération
sur le backend déployé dans ce correctif.

**Vérifications et limites.** 39 tests ciblés réussis, dont 13 nouveaux dans
`tests/passengerDriverInterruption.test.js` et
`tests/interruptionResponseCache.test.js`. Cas couverts : rechargements bloqués ou
rejetés après succès, mutation refusée et nouvel essai, double clic, confirmation
partielle avec plusieurs réservations, réservation de plusieurs places, refus,
réponse incohérente, changement de demande/compte/écran, préservation des montants,
des paiements et des autres réservations, accès au choix après mise en pause.
Suite complète : 832 tests, 830 réussis et les deux échecs préexistants de
`tests/sourceExtractions.test.js` (empreintes des styles de réservations et API
utilisateur/PIN), sans modification de ces fichiers ni de leurs empreintes ici.
TypeScript sans émission, ESLint ciblé, frontière réseau et `git diff --check`
validés ; 906 sources contrôlées, aucune au-dessus de 400 lignes.
Ces résultats sont des tests JavaScript et des contrôles statiques, pas des essais
natifs ni une reproduction du signalement en production. Il reste à tester sur
iPhone et Android : réseau lent, retour de veille, annulation puis nouvelle demande,
un titulaire de trois places avec une seconde réservation, confirmation/refus,
puis choix attendre/s'arrêter et règlement. Aucune disparition des blocages ou
crashs natifs n'est garantie par ces vérifications.

## 23 septembre 2026 — Descente anticipée : confirmation par le conducteur

**Périmètre et constat.** Le passager demande à descendre avant sa destination ;
le conducteur observe un chargement qui s'arrête sans résultat apparent. Le code
utilisait la réponse de confirmation pour un message, mais ne l'appliquait pas
aux réservations affichées : la disparition de la demande, les arrêts et les
reçus dépendaient de lectures supplémentaires. Le refus attendait encore ces
lectures avant de libérer l'action. La file des demandes affichait aussi des
réservations déjà déposées/terminées ou annulées si leur demande restait marquée
en attente, alors que le garde de l'action empêchait leur traitement.
Ces défauts sont vérifiés dans le code et les tests ; sans réponse réseau du cas
signalé, ils ne prouvent pas la cause exacte de cet incident en production.

**Solution appliquée et fichiers.**

- `features/driver-navigation/passengerInterruptionResponse.ts` centralise
  l'éligibilité et la vérification de la réponse serveur : même réservation,
  trajet, titulaire et demande lorsqu'elle est présente. Une confirmation doit
  renvoyer une réservation terminée ; une réponse encore en attente n'est plus
  annoncée comme une dépose réussie. Le backend omet normalement les demandes
  clôturées, donc une demande absente dans sa réponse reste compatible.
- `useDriverNavigationBookings.ts` et `useDriverBookingActionGuard.ts`, dans
  `hooks/driver-navigation/`, utilisent la même règle pour la file affichée et
  l'exécution. Les demandes devenues inapplicables ne masquent plus les suivantes.
- `hooks/driver-navigation/useDriverBookingActions.ts` applique la réponse
  validée dès la confirmation ou le refus. Les rechargements de réconciliation
  restent non bloquants, y compris après refus. Le montant du récapitulatif vient
  toujours du serveur. Un échec serveur conserve le message d'erreur et ne simule
  aucune dépose ni réussite du paiement.
- `store/api/booking/passengerInterruptionResponseCache.ts` met à jour uniquement
  la réservation concernée dans `getTripBookings` et `getBookingById`, avec
  vérification du compte conducteur, de l'appartenance au trajet et des identités.
  Les versions plus récentes, les demandes remplacées et les états terminaux
  incompatibles sont préservés. Le trajet imbriqué déjà en cache et les identités
  d'affichage non renvoyées ne sont pas écrasés. Les autres réservations ne sont
  pas modifiées. Les reçus existants peuvent utiliser immédiatement la dépose.
- `useDriverNavigationData.ts` et `useDriverNavigationController.ts` relient
  cette mise à jour RTK Query à l'action existante.

**Comportements conservés.** Une réservation de plusieurs places est confirmée
pour son titulaire en une seule action ; son montant n'est pas multiplié à nouveau.
Les autres passagers continuent leur trajet. Aucun recalcul local de tarif,
changement de mode de paiement, confirmation fictive du cash, nouveau polling,
minuteur, abonnement GPS ou modal natif. Les protections contre le double clic,
les anciennes demandes et les réponses après sortie de navigation restent actives.
Le backend a été lu (`bookings.service.ts`, contrôleur et tests d'interruption),
mais pas modifié ni déployé. Sa protection contre le recalcul d'un paiement déjà
en cours reste en place ; ce refus ne peut pas être contourné par l'application.

**Vérifications.** Quatre tests de comportement échouaient avant correction,
puis 27 tests ciblés passent, dont 12 nouveaux dans
`tests/driverPassengerInterruption.test.js` et
`tests/passengerInterruptionResponseCache.test.js`. Les fixtures du garde d'action
dans `tests/interruptionSettlement.test.js` ont été complétées pour représenter
une véritable demande en attente. Couverture : réponse validée, montant de groupe,
deux réservations, double clic, rechargements bloqués/rejetés, refus, erreur métier,
réponse incohérente, sortie d'écran, demande remplacée, compte différent et paiement
plus récent. Suite complète : 844 tests, 842 réussis, les deux échecs préexistants
d'empreintes dans `tests/sourceExtractions.test.js` inchangés (styles des
réservations et API utilisateur/PIN). TypeScript validé. ESLint ciblé sans erreur,
avec cinq avertissements préexistants de `useDriverNavigationBookings.ts`,
également reproduits sur sa version HEAD. Frontière réseau et `git diff --check`
validés ; 908 sources contrôlées, aucune au-dessus de 400 lignes.

**Limites et essais restants.** Tests JavaScript et contrôles statiques seulement,
sans appel au backend déployé ni essai sur appareil. Tester sur iPhone/Android
avec réseau lent, deux demandes successives, une réservation de trois places,
retour de veille, refus serveur et reprise du paiement par le passager. La
réception sur le téléphone du passager conserve les notifications et la
synchronisation existantes, non validées ici de bout en bout. Ces résultats ne
garantissent pas l'absence de crash ou de blocage natif.

## Format pour les prochaines entrées

Pour chaque problème corrigé : date/périmètre, problème constaté, solution
effectivement appliquée, fichiers concernés, comportements conservés, vérifications
et limites. Référencer les documents spécialisés si le détail devient volumineux.
