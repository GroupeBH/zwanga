# Paiement à l'arrivée : vérification indisponible et sortie du formulaire

Date : 23 septembre 2026. Périmètre initial : application mobile, paiement à
l'arrivée et complément Mobile Money pour un paiement en jetons. Le backend
était alors inspecté en lecture seulement.

**État actuel :** le [correctif des refus FlexPay](FLEXPAY_REFUSALS_AND_PAYMENT_MODES.md)
modifie aussi le backend. Il remplace le bouton supplémentaire décrit dans les
itérations ci-dessous par la sélection directe des cartes de paiement après refus.
Aucun déploiement, paiement réel ou migration exécutés.

## Problèmes constatés

Les logs fournis montrent une rupture de connexion entre le backend et FlexPay
lors d'une consultation de statut. Le backend répond 502 ; cela ne prouve ni
un paiement refusé, ni un débit absent. Les comptes/références des logs ne sont
pas reproduits dans ce document.

Dans le code mobile :

- `hasPendingProviderPayment` imposait le libellé « Vérification… », même
  quand aucune requête n'était en cours ou après une erreur.
- `useArrivalPaymentMonitoring` relançait ses lectures à intervalle fixe de
  12 secondes, sans arrêt sur erreur ni limite globale d'attente. Les lectures
  étaient déjà protégées contre le chevauchement, mais recommençaient au tick
  suivant après un échec.
- Le message d'indisponibilité était dans la partie basse du formulaire
  défilant, avec un indicateur animé même sans lecture active.
- Fermer le formulaire n'arrêtait pas son monitoring. Un récapitulatif de
  règlement reçu tardivement pouvait rendre le modal à nouveau visible.

Le 404 sur `/bookings/trip/:id` est distinct. `BookingsService.findAllByTrip`
cherche un trajet correspondant à la fois à son identifiant et au conducteur
authentifié. Un 404 peut donc signifier absence du trajet OU mauvais propriétaire.
Les hooks de détail/notation passager appelaient effectivement cet endpoint
réservé au conducteur. L'accueil pouvait aussi considérer une réponse de trajet
comme un trajet conducteur sans revérifier son propriétaire. Cela ne permet pas
d'attribuer avec certitude chaque ligne du log à un écran particulier.

## Solutions appliquées

### Vérification bornée, sans nouveau débit

`hooks/arrival-payment/useArrivalPaymentMonitoring.ts` distingue les phases
inactif, lecture en cours, attente de confirmation, pause et fin.

- Une seule lecture à la fois. Le délai de 12 secondes commence APRES la
  réponse précédente, et non depuis un intervalle indépendant.
- Toute erreur de consultation interrompt les relances automatiques. Elle
  produit un message français indiquant de ne pas payer une deuxième fois.
- Chaque lecture a une garde de 25 secondes, y compris si une attente liée à
  l'authentification retarde la requête. La base RTK conserve aussi son timeout
  réseau existant de 20 secondes : la première limite atteinte interrompt la lecture.
- Si les réponses restent en attente, une session de surveillance s'arrête
  après deux minutes. Elle peut être relancée volontairement.
- « Vérifier à nouveau » réutilise la référence existante. Aucun nouvel ordre
  de recharge/paiement n'est créé par cette action.
- Les références AsyncStorage ne sont pas supprimées sur 404, 502, timeout
  ou erreur réseau. Seul un résultat métier définitif déclenche leur libération
  par les chemins de réussite/échec/annulation existants.
- Un complément en jetons confirmé conserve le règlement du trajet prévu.
  Si ce règlement échoue ou n'est pas confirmé, il n'est pas rejoué en boucle.
  Le verrou existant de règlement en jetons par réservation reste en place.
- Si le cache serveur confirme ultérieurement le paiement, la reprise peut
  terminer le récapitulatif sans nouvel appel FlexPay ni nouveau débit.

Les délais sont définis dans `features/arrival-payment/paymentPolicy.ts`.
Les deux minutes concernent les lectures de statut, pas une mutation financière
déjà lancée : cette dernière conserve ses propres garanties/timeouts.

### Formulaire non bloquant

`features/arrival-payment/ArrivalPaymentActions.tsx` sépare le pied de formulaire
du contenu défilant. Le message de vérification et les actions restent à proximité :

- pendant une lecture : « Vérification… » avec indicateur ;
- entre lectures : « En attente de confirmation », sans animation permanente ;
- après erreur ou délai d'attente : « Vérifier à nouveau » ;
- dans tous ces cas : « Fermer et reprendre plus tard » reste utilisable,
  ferme également le clavier et n'est pas bloqué par l'état de paiement.

`components/PassengerArrivalPaymentCoordinator.tsx` utilise ce composant et
respecte la fermeture même si un récapitulatif arrive tardivement.
`hooks/arrival-payment/useArrivalPaymentState.ts` associe cette fermeture à la
réservation présentée, y compris au récapitulatif tardif.
`ArrivalPaymentFields.tsx` n'anime plus un simple message d'information au repos.

La fermeture, la veille et le démontage arrêtent les timers et annulent la
lecture RTK en cours. Ses réponses tardives sont ignorées. Les mutations
financières ne sont pas annulées et leur résultat serveur n'est pas effacé.
Le rappel discret existant permet de rouvrir le paiement. Une erreur déjà
rencontrée ne relance pas une boucle simplement parce que le cache se rafraîchit
ou que l'application revient au premier plan ; une action explicite est nécessaire.

### Lectures conducteur/passager correctes

- `hooks/home/useHomeDriverActivity.ts` : identité du conducteur, identifiant
  du trajet demandé et statut revérifiés avant de retenir le trajet conducteur
  et d'interroger ses réservations. Aucun rôle conducteur inféré d'un ancien
  suivi appartenant à un autre participant/compte.
- `hooks/trip-detail/useTripDetailData.ts` : endpoint conducteur seulement pour
  son propriétaire ; un passager utilise ses propres réservations filtrées sur
  le trajet. Les callbacks de rafraîchissement conducteur deviennent sans effet
  s'ils sont appelés côté passager ou avant identification du propriétaire.
- `hooks/trip-detail/useTripDetailSafetyActions.ts` : contrat du callback adapté
  à ce rafraîchissement conditionnel, sans changer les actions de sécurité.
- `hooks/rating/useRatingData.ts` : même séparation entre réservations du
  conducteur et réservations personnelles du passager. Les participants déjà
  exposés par le détail du trajet restent disponibles pour les cibles de notation.
- `features/rating/RatingParticipantSelector.tsx` : callback de relance compatible
  avec les deux sources de données.

Aucun élargissement de permissions backend et aucune modification des payloads
financiers, montants, devises, choix cash ou règles de règlement. Les accès
réseau restent exclusivement dans RTK Query.

## Vérifications réalisées

- **42/42 tests ciblés réussis** : reprise/submission/vérification des paiements,
  contrôle des lectures conducteur, priorité accueil et suivi détail.
- Treize nouveaux tests dans `tests/arrivalPaymentVerification.test.js` et
  `tests/driverBookingReadAccess.test.js`. Les tests existants de reprise sont
  adaptés au timer borné et couvrent aussi le récapitulatif tardif après fermeture.
- Simulation de 502/404, lecture suspendue, réponse tardive, double appui,
  deux minutes de statut en attente, veille/reprise, fermeture, règlement jetons
  refusé, confirmation serveur ultérieure et ownership avant/après chargement.
- Suite complète : **738/740 réussis**. Les deux échecs préexistants concernent
  `tests/sourceExtractions.test.js` : styles des réservations et empreintes des
  endpoints PIN de `userApi`. Aucun snapshot ni fichier concerné modifié ici.
- TypeScript sans émission, ESLint ciblé, frontières réseau et `git diff --check` :
  réussis. 890 sources contrôlées ; seule l'exception préexistante
  `app/wallet.tsx` (414 lignes) dépasse 400 lignes.

## Limites et recette restante

Les tests utilisent des SDK/requêtes/horloges simulés. Aucun paiement réel,
essai iPhone/Android, profilage mémoire/thermique ni garantie d'absence de
freeze/crash natif. Reproduire en build natif : complément Mobile Money, réponse
502, bouton de relance, clavier ouvert, fermeture pendant une lecture lente,
reprise depuis le rappel, veille pendant le règlement, notification de réussite
tardive, succès/échec définitif puis paiement cash si aucun ordre n'est incertain.

La rupture de connexion backend–FlexPay n'est pas résolue par ce correctif UI.
L'accès au service tiers doit être rétabli pour connaître le statut effectif.
Autoriser un second paiement ou forcer le cash pendant une transaction incertaine
resterait dangereux ; les restrictions correspondantes sont conservées.
L'état de pause est en mémoire pour la session du compte ; les références,
elles, restent persistées. Un redémarrage peut faire une nouvelle vérification
de l'ordre enregistré, mais ne crée pas un nouveau débit.
Le formulaire autonome de recharge du wallet possède son propre monitoring,
non modifié par cette intervention ciblant le paiement à l'arrivée.

<a id="changement-de-mode-apres-echec-confirme"></a>
## Complément du 23 septembre 2026 — Changement de mode après échec confirmé

La visibilité initialement conditionnelle décrite ici est complétée par le
[correctif de visibilité ci-dessous](#visibilite-du-changement-de-mode).

### Problème et parcours appliqué

Le déverrouillage des cartes de paiement après un refus n'était pas assez
explicite. Le pied de formulaire affiche maintenant un message d'échec et
« Changer de mode de paiement » lorsque le serveur a renvoyé un statut
`failed` ou `cancelled`. Le passager revient aux options dans la même fenêtre,
sans mode présélectionné. Aucun paiement n'est lancé avant un nouveau choix
et une validation explicite. Il peut aussi sélectionner directement une option.

Mobile Money/carte, jetons et cash restent les moyens existants ; cash est
disponible seulement une fois l'arrivée ou la dépose confirmée. Choisir cash
conserve le récapitulatif d'instructions : cela ne prouve pas que le conducteur
a reçu l'argent. Le montant reste déterminé par le serveur et ses règles existantes.

### Implémentation et fichiers

- `hooks/arrival-payment/useBookingPaymentMode.ts` : mémorise la réservation
  dont le paiement a échoué. Le choix suivant acquitte cet état local ; une
  réponse relative à une autre réservation ne lui propose pas ce parcours.
  Une opération en cours, une référence non résolue, un paiement réussi ou un
  cash reçu verrouillent la sélection.
- `useArrivalPaymentState.ts` : expose cette récupération au coordinateur.
- `useArrivalPaymentCompletion.ts` et `useArrivalPaymentMonitoring.ts` :
  signalent les refus/annulations de paiements et recharges vérifiés ; les
  anciens messages d'attente sont effacés. Les erreurs de lecture ne sont
  jamais signalées comme un refus financier.
- `useArrivalPaymentSubmission.ts` : traite aussi les refus dès l'initiation,
  avant de conserver un ordre comme pending ou d'ouvrir une URL de paiement.
  Les réponses tardives restent protégées par l'identité de session existante.
- `features/arrival-payment/ArrivalPaymentActions.tsx` : action explicite en
  pied de formulaire, sans nouvelle modale. Le bouton de vérification a priorité
  lorsqu'une référence reste en attente. La fermeture reste disponible.
- `ArrivalPaymentFields.tsx` : après remise à zéro du choix, défilement vers les
  options par référence et mesure de layout, sans timer ni animation persistante.
- `components/PassengerArrivalPaymentCoordinator.tsx` : branche les callbacks
  locaux ; les mutations continuent à passer par RTK Query après validation.

Le contrat local `BookingsService.updatePaymentMode` a été consulté : il accepte
les changements d'une réservation admissible non réglée et refuse les paiements
déjà confirmés. Aucun changement backend, migration ou élargissement de droits
n'a été nécessaire pour ce parcours. L'appel points peut débiter le wallet :
il reste donc dans la validation du paiement, jamais dans le simple choix d'une carte.

### Protection contre le double paiement et limites

Une erreur 502, un délai dépassé, une annulation de la page carte ou un statut
encore en attente ne prouvent pas l'absence de débit. Lorsqu'une référence existe,
elle est conservée : on peut vérifier le même ordre ou fermer, mais pas lancer
un autre paiement. Le message d'indisponibilité explique désormais cette limite.
La possibilité de changer dépend d'un statut financier confirmé, pas du temps écoulé.

L'invitation à changer est locale à la session ; les références de paiement
restent persistées comme auparavant. Après redémarrage sans référence en attente,
les cartes restent sélectionnables même si l'invitation d'échec n'est plus affichée.
Ce changement ne résout pas la connexion FlexPay et n'ajoute pas de traitement
automatique des transactions dont la réponse de création a été perdue.

### Vérifications et recette

34/34 tests ciblés : `arrivalPaymentModeRecovery`, `arrivalPaymentSubmission`,
`arrivalPaymentVerification`, `arrivalPaymentResume`. Neuf nouveaux tests couvrent
le choix après refus, les verrous, les réponses terminales à l'initiation,
l'absence d'ouverture d'URL après refus, l'absence de débit au clic de changement
et la priorité de la vérification sur une référence incertaine.
Suite complète : 747/749, avec les deux échecs préexistants documentés plus haut.
TypeScript, ESLint ciblé, frontières réseau et contrôle du diff réussis.

Tests JavaScript simulés uniquement, aucun débit réel ni test natif. À vérifier
sur iPhone/Android : refus Mobile Money et carte, recharge complémentaire refusée,
changement vers jetons puis validation, changement vers cash après dépose,
montant d'interruption, clavier ouvert, défilement vers les options et fermeture.
Après un 502, vérifier que seul le même ordre peut être recontrôlé et que le
choix alternatif n'est proposé qu'après confirmation de son échec.

<a id="visibilite-du-changement-de-mode"></a>
## Correctif du 23 septembre 2026 — Action permanente dans le pied du formulaire

**Constat.** `canChangeFailedPaymentMode` dépendait d'un refus/annulation reçu
pendant la session. Une erreur HTTP de vérification n'active volontairement pas
ce signal : elle ne prouve pas un refus financier. La condition utilisée pour
remplacer le bouton principal rendait donc l'action introuvable dans ce cas.

**Correction.** `ArrivalPaymentActions.tsx` conserve désormais le bouton de
paiement/vérification et affiche séparément « Changer de mode de paiement »
pour tout paiement non réglé. Ce lien est placé entre l'action principale et
« Fermer et reprendre plus tard », hors du contenu défilant. Il ne dépend plus
du signal local d'échec. Son état désactivé est exposé à l'accessibilité ; un
paiement en attente s'accompagne d'une explication sur le risque de double débit.

`useBookingPaymentMode.ts` expose une autorisation de changement indépendante
du signal d'échec, avec les mêmes verrous sur opérations en cours, références
pendantes et paiements confirmés. `requestModeSelection` retire la sélection et
incrémente un compteur local. `useArrivalPaymentState` et le coordinateur le
transmettent à `ArrivalPaymentFields`, qui redemande le défilement vers les choix
même si le mode était déjà nul. Un rendu inchangé ne relance pas ce défilement.
Le message d'indisponibilité du monitoring est raccourci pour éviter la répétition
de l'explication désormais portée par le pied de formulaire.

**Conservé.** Aucune référence de paiement n'est supprimée par ce bouton, aucune
requête de paiement ou modification serveur n'est déclenchée par la sélection.
Un changement n'est pas autorisé pendant la vérification d'un ordre incertain.
Une erreur réseau ne devient pas un refus ; le cash reste soumis à la dépose.
La fermeture et la vérification du même ordre restent possibles. Aucun backend,
timer, nouvelle modale native ou animation permanente ajouté.

**Validation.** 36/36 tests ciblés dans `arrivalPaymentModeRecovery`,
`arrivalPaymentVerification`, `arrivalPaymentSubmission` et `arrivalPaymentResume`.
Le test de pied de formulaire couvre l'absence d'indicateur local d'échec,
la visibilité/verrouillage lors d'un statut incertain, la relance, l'état occupé
et la disparition après succès. Deux tests supplémentaires vérifient les demandes
de sélection répétées, la conservation de l'ordre et le défilement ciblé sans
répétition sur 100 rendus ordinaires. TypeScript, lint ciblé, frontières réseau et
diff validés. Pas de nouvelle exécution de la suite complète pour ce delta.

**Limites.** Tests JavaScript uniquement. Vérifier sur iPhone et Android le lien
en pied de modal, sa lisibilité sur petit écran et avec clavier, le retour aux
options, et l'explication lorsque le provider reste indisponible. Aucun paiement
réel, build, déploiement ou validation d'absence de freeze/crash natif réalisé.
