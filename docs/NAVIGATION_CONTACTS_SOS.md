# Contacts et SOS dans la navigation

## Parcours utilisateur

Dans la navigation conducteur et passager, l’en-tête propose désormais deux actions explicites : **Contacter** et **SOS**.

- Conducteur : « Contacter » affiche les passagers de ses réservations acceptées, y compris les embarquements incertains. Le conducteur choisit la personne, puis « Appeler » ou « WhatsApp ». Les passagers déjà déposés et les réservations annulées, refusées ou en attente d’acceptation ne sont pas proposés.
- Passager : « Contacter » affiche le conducteur du trajet lié à sa propre réservation. Cette action reste visible lorsque la carte est agrandie.
- Un numéro absent ou invalide est signalé clairement ; les boutons correspondants sont désactivés.
- L’appel utilise l’application téléphonique. WhatsApp est ouvert en priorité, avec son lien web comme solution de repli. Aucun appel ni message n’est lancé par la simple ouverture du modal.
- « SOS » ouvre le modal d’urgence déjà utilisé dans le détail du trajet, avec les numéros existants de `PoliceContactPanel`. Il faut choisir un numéro pour appeler. Les numéros n’ont pas été modifiés.
- Le conducteur est invité à utiliser les actions de contact uniquement à l’arrêt.

## Correction de l’en-tête conducteur

L’ancien en-tête plaçait la fermeture, la durée, le statut de connexion, la distance, l’heure d’arrivée et la confirmation dans une seule ligne. Le bouton de confirmation réduisait l’espace disponible et masquait la distance et l’heure.

`DriverNavigationTopPanel` sépare maintenant :

1. La fermeture et les informations d’itinéraire : durée, connexion, distance et heure d’arrivée.
2. Les actions de confirmation, contact et SOS.
3. Le choix de la portion d’itinéraire et le panneau des passagers.

Les informations peuvent revenir à la ligne. « En direct » remplace « LIVE » et « Arrivée à » remplace « ETA ». Les marges utilisent les zones de sécurité du téléphone. Le panneau des passagers suit le flux normal, au lieu d’un décalage absolu fixe ; sa zone est défilante et bornée pour les contenus longs.

Les commandes secondaires du conducteur sont regroupées sous « Options » : prévenir les proches, modifier, partager, voir les passagers et recalculer l’itinéraire. L’interruption, le guidage vocal et le recentrage restent directement accessibles. Les actions, leurs protections de chargement et le recentrage sécurisé sont conservés. Le menu reste dans les limites tactiles de son parent, notamment sur Android.

Côté passager, `PassengerNavigationHeader` reste affiché indépendamment de la fiche inférieure. La position supérieure de la carte et de ses commandes suit la hauteur réellement mesurée de cet en-tête, plutôt qu’une constante. Les changements de taille de texte et d’orientation peuvent ainsi actualiser cet espace.

## Fichiers et responsabilités

- `features/navigation/navigationContacts.ts` : sélection des interlocuteurs, vérification du rôle dans le trajet, dédoublonnage et gestion des numéros absents.
- `hooks/navigation/useNavigationAssistance.ts` : état local de présentation, lecture de l’identité depuis Redux, fermeture lors d’un changement de trajet, de compte ou du passage en arrière-plan.
- `features/navigation/NavigationAssistanceButtons.tsx` : boutons communs avec libellés accessibles.
- `features/navigation/NavigationContactModal.tsx` : choix de la personne et du canal, protection immédiate contre les doubles clics, erreurs lisibles et zone de sécurité inférieure.
- `features/navigation/NavigationAssistanceModals.tsx` : montage conditionnel d’un seul modal de contact ou de SOS.
- `features/driver-navigation/DriverNavigationTopPanel.tsx` et `features/passenger-navigation/PassengerNavigationHeader.tsx` : disposition des en-têtes.
- `features/driver-navigation/DriverNavigationControls.tsx` : commandes directes et menu d’options.
- `utils/phoneHelpers.ts` : ouverture des applications externes et erreurs compréhensibles.
- `app/trip/navigate/[id].tsx` et `app/booking/navigate/[id].tsx` : branchement sur les données du trajet et coordination avec les autres modals.

## Données et performances

Aucune nouvelle requête HTTP, aucun abonnement GPS, aucun intervalle et aucune écriture backend ne sont ajoutés. Les réservations et le trajet proviennent toujours des données RTK Query déjà chargées et de leur repli hors connexion existant. Les numéros doivent avoir été autorisés et renvoyés par le backend ; le mobile ne récupère pas un profil supplémentaire pour contourner un numéro absent.

Le rôle dépend de la propriété du trajet ou de la réservation, pas du fait qu’un compte possède aussi la capacité de conduire. Les interlocuteurs sont calculés avec `useMemo` uniquement quand le panneau de contact est ouvert. Les modals de contact et SOS sont montés à la demande et fermés lorsque l’écran devient inactif. L’état de présentation reste local : il n’est ni persisté ni dupliqué dans Redux.

Les notifications automatiques de prise en charge et les autres modals conducteur sont différés tant que le modal d’assistance est ouvert. La demande d’autorisation de localisation conserve sa priorité. La sortie sécurisée de la carte, les confirmations hors connexion, les calculs de trajet et les paiements ne sont pas modifiés.

L’ouverture téléphonique ne dépend plus de `canOpenURL`, qui peut échouer en l’absence de déclarations natives de visibilité. L’ouverture est tentée après l’action explicite de l’utilisateur et son échec est traité sans afficher d’erreur native en anglais. Les restrictions de cette vérification sont décrites dans la [documentation officielle de React Native](https://reactnative.dev/docs/linking#canopenurl). Aucun changement de permission native n’est nécessaire pour cette approche.

## Vérification

Tests automatisés dédiés :

- `tests/navigationAssistance.test.js` : rôle et propriété des données, sélection des passagers, numéros absents, fermeture en arrière-plan, mémoïsation, boutons, double clic, erreurs, priorité des modals, SOS sans appel automatique et ouverture téléphone/WhatsApp simulée.
- `tests/navigationHeaders.test.js` : séparation des informations et des confirmations, zones de sécurité, conservation des actions, carte passager agrandie, mesure de l’en-tête, commandes et chargements, limites tactiles du menu, branchement des deux écrans et différé des notifications.

L’empreinte de référence des styles de navigation conducteur dans `tests/fixtures/sourceExtractions.json` a été actualisée uniquement pour le retrait des quatre propriétés de positionnement absolu de `passengersBar`. Les nouvelles assertions vérifient explicitement sa disposition dans le flux ; les autres empreintes sont conservées.

Ces tests ne remplacent pas une vérification visuelle sur appareil. À valider sur Android et iOS : petit écran et grande police, navigation avec plusieurs passagers, ouverture/fermeture des modals, appel puis retour dans Zwanga, WhatsApp installé ou absent, réseau lent, carte agrandie et arrivée d’une notification pendant l’ouverture des contacts. Vérifier SOS sans appeler réellement les services d’urgence.
