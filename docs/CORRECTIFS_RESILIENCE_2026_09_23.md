# Correctifs de résilience — 23 septembre 2026

## Périmètre et objectif

Application mobile, à la suite de la dernière revue : sessions sur réseau instable,
réponses asynchrones après changement de compte ou d'écran, actions conducteur avec
plusieurs réservations, suivi des recharges et conservation locale des paiements.
Il s'agit de corrections de code et de tests JavaScript, pas d'une mesure de CPU,
de mémoire native ou de température. Aucun déploiement, paiement réel, changement
de backend ou de configuration native n'est réalisé dans cette intervention.

## P1 — Ne pas déconnecter lors d'une panne temporaire de renouvellement

**Problème.** Le renouvellement pouvait confondre une perte de réseau/un serveur
indisponible avec une révocation des identifiants, et faire perdre le contexte du trajet.

**Solution appliquée.** `services/tokenRefresh.ts` centralise un renouvellement en
vol par session et jeton d'actualisation. Une tentative infructueuse impose un délai
de 60 secondes avant une nouvelle tentative identique. Les erreurs réseau, délais
dépassés et erreurs serveur conservent la session locale. Un jeton d'actualisation
expiré ou un rejet HTTP 400/401/403 du renouvellement déclenche la déconnexion.
L'endpoint historique `authApi.refreshToken` délègue au même service.

`store/api/baseApi.ts` attend le renouvellement avant une requête authentifiée :
un accès expiré n'est pas envoyé comme Bearer. Si le renouvellement échoue de façon
temporaire, une erreur de connexion en français est retournée sans faux 401.
Les routes publiques restent accessibles en l'absence de session. Une requête
annulée pendant cette attente n'est pas ensuite envoyée.

**Comportements conservés.** Le contexte hors ligne ne constitue pas une autorisation
serveur. Les sockets n'utilisent que des accès non expirés. Les tâches GPS conducteur
et passager, et `services/background/driverTripCompletion.ts`, vérifient séparément
`hasRecoverableSession` : l'expiration de l'accès pendant une panne temporaire ne
désarme pas à elle seule le suivi. Les envois HTTP passent toujours par RTK Query ;
les arrêts dus à une fin de trajet ou à une réservation terminale restent en place.
`hooks/auth/useAuthForegroundSession.ts` ne déconnecte plus depuis un ancien callback.

## P1 — Isoler les réponses et écritures de chaque session

**Problème.** Un renouvellement lancé avant une déconnexion pouvait écrire après
le nettoyage, restaurer l'ancien compte ou déconnecter le compte suivant.

**Solution appliquée.** `services/tokenSession.ts` ajoute une génération synchrone
et une file des écritures sécurisées. `services/tokenStorage.ts` vérifie la génération
avant/après lecture ou écriture ; connexion et nettoyage invalident l'ancienne
génération. Le renouvellement conserve la génération de sa session. Les deux écritures
natives sont attendues même si l'une échoue, pour qu'une suppression suivante ne
soit pas dépassée par la seconde écriture encore en cours.

`store/index.ts` invalide les réponses en vol dès le début de la déconnexion.
Le wrapper HTTP ignore une réponse appartenant à une ancienne session et ne relance
jamais sa mutation avec les identifiants du compte suivant. `authSlice.ts` protège
aussi les résultats tardifs d'initialisation et de déconnexion par identifiant de
requête. Une ancienne déconnexion terminée n'efface pas les caches du nouveau compte.
`authApi.ts` n'applique le profil qu'après une sauvegarde effective et dans la même
session ; les lectures ponctuelles du profil n'installent pas d'abonnement permanent.

**Précautions.** Pas de modification des PIN, de la connexion Google/Apple, des URL
de connexion, des règles d'autorisation ni des données métier. La file ne prétend
pas transformer SecureStore en transaction atomique : une défaillance native reste
une erreur, et une sauvegarde incomplète n'est pas annoncée comme réussie.

## P1 — Libérer les actions conducteur après la confirmation serveur

**Problème.** Une acceptation, un refus ou une annulation réussis pouvaient conserver
le verrou des actions pendant des relectures lentes, bloquant la réservation suivante.

**Solution appliquée.** `useDriverBookingActions.ts` et `useDriverPickupActions.ts`
appliquent la décision confirmée aux caches `getTripBookings` et `getBookingById`
via `store/api/booking/driverDecisionCache.ts`, puis actualisent en arrière-plan.
Le helper vérifie le conducteur, le trajet, la réservation et le statut courant
pour ne pas écraser une transition ultérieure. `useDriverNavigationData.ts` et
`useDriverNavigationController.ts` transmettent ce commit ciblé.

`useDriverBookingActionGuard.ts` conserve les décisions acquittées pendant la vie
de l'écran du trajet : une carte encore rendue avec l'ancien statut ne permet pas
un second envoi. Le verrou reste actif pendant la mutation et sa réconciliation,
mais pas pendant les lectures de rafraîchissement suivant un succès.

**Comportements conservés.** Pas de succès optimiste avant réponse serveur. Les
erreurs ambiguës restent soumises à la réconciliation existante. Une réservation
de plusieurs places reste une seule unité d'action au nom de son titulaire.
Le nombre de places, les tarifs, les paiements et les décisions des autres
réservations ne sont ni estimés ni modifiés par le correctif.

## P1 — Empêcher les réponses tardives de rouvrir une interface obsolète

**Navigation.** `useDriverTripInterruptionActions.ts` protège le redémarrage par
un verrou commun et par un contexte écran/session. Une réponse après sortie,
démontage, changement de trajet ou aller-retour hors de l'écran ne réinitialise
pas la nouvelle navigation et n'ouvre pas de dialogue global. Après succès, les
relectures ne retardent plus l'interface. Une demande d'interruption en attente
de confirmation ne vaut toujours pas arrêt effectif du suivi GPS.

**Portefeuille.** `useWalletScreenScope.ts` capture compte, session, focus et activité
de l'application. Le contrôleur suspend les lectures wallet/ledger hors écran actif.
`useWalletTopUpMonitoring.ts` partage une vérification en vol, suspend les lectures
et la boucle automatique hors écran actif, et ignore leurs résultats obsolètes.
Un statut opérateur « en attente » ne recharge plus systématiquement solde et
historique. Après succès, l'actualisation du solde ne retient plus le dialogue.
Les limites existantes d'essais/durée du suivi automatique sont conservées.

`useWalletTopUpActions.ts` sauvegarde la référence financière pour le compte
d'origine avant d'ignorer une réponse tardive d'initiation. Ce sont les lectures
qui sont annulées, pas le paiement envoyé à l'opérateur. `useWalletTopUpRecovery.ts`
reprend le contrôle du statut au retour à l'écran actif avec la référence stockée.
Il n'envoie pas une nouvelle recharge pour effectuer cette reprise.

**Limite.** Un fournisseur indisponible ne devient pas un paiement refusé. Les
références non résolues restent conservées ; les contrôles ne constituent pas une
preuve de débit, d'encaissement ni de remboursement.

## P2 — Réduire l'accumulation locale des états de paiement

**Problème.** Le dictionnaire historique des paiements d'arrivée grossissait et
chaque modification pouvait mettre en file une nouvelle sérialisation complète.

**Solution appliquée.** `features/arrival-payment/paymentRetention.ts` et
`hooks/arrival-payment/usePaymentPersistence.ts` conservent au plus une écriture
active et un instantané récent en attente, fusionné par le contrôleur. Le JSON
n'est produit que lors de l'écriture effective. Les entrées confirmées ET acquittées
depuis plus de 90 jours, sans référence opérateur ni action en attente, sont retirées
du cache local au chargement ou à sa mise à jour.

`paymentTypes.ts` ajoute `settledAt`. `useArrivalPaymentCompletion.ts` le renseigne
uniquement pour un paiement réussi, un trajet gratuit ou un cash effectivement
confirmé reçu. L'acquittement par l'utilisateur reste également nécessaire.

**Précautions.** Aucun historique serveur n'est supprimé. Les références en attente,
cash non confirmé, dates inexploitables et anciens états sans preuve de règlement
restent conservés. Ce correctif borne la file d'écriture et nettoie les nouveaux
états résolus éligibles ; il ne plafonne pas arbitrairement les paiements non résolus
et ne purge pas tout l'historique préexistant. Une erreur disque est journalisée ;
le prochain changement peut réécrire l'instantané, sans prétendre garantir un disque
disponible ou un arrêt brutal sans perte de la toute dernière écriture.

## Contrôles et essais

Tests ajoutés : `sessionRenewal`, `authenticatedQueryLifecycle`, `authThunkLifecycle`,
`driverActionsReadIsolation`, `driverDecisionCache`, `walletTopUpLifecycle` et
`paymentRetention`. Les hooks/services réels sont exercés avec réseau et modules
natifs simulés. Les tests de cache utilisent un store RTK réel.

Scénarios couverts : réseau indisponible, cooldown, réponses après déconnexion,
écritures SecureStore concurrentes/partiellement en échec, requête annulée pendant
renouvellement, sortie/retour d'écran, compte suivant, deux réservations successives,
réservation de trois places, vérifications simultanées de recharge, rétention des
paiements ouverts et 1 000 mises à jour pendant une écriture lente.

Les mocks des tests `passengerGpsProfile` et `pinReset` sont adaptés aux nouveaux
imports, sans retirer leurs assertions. `scripts/check-network-boundaries.js`
déclare `__dirname` pour le lint, sans changer la règle de contrôle.

Résultats obtenus sur le poste de développement :

- Suite mobile complète : **890 tests réussis sur 892**, en environ 66 secondes.
  Les deux échecs préexistants restent dans `tests/sourceExtractions.test.js` :
  référence des styles `features/screen-styles/app/bookings/index.ts` et référence
  des endpoints `store/api/userApi.ts`. Ces sources et leurs snapshots n'ont pas
  été modifiés par cette intervention. Les références n'ont pas été régénérées
  pour masquer ces écarts hors périmètre.
- Les **48 nouveaux tests** des sept fichiers ajoutés passent dans cette suite.
- TypeScript mobile (`tsc --noEmit`) : validé.
- ESLint ciblé sur tous les fichiers de production modifiés/ajoutés : aucune
  erreur ni avertissement au dernier passage.
- Contrôle des frontières réseau : validé ; aucun nouvel appel HTTP direct
  hors RTK Query. `git diff --check` : validé.
- Contrôle de taille : **912 sources**, aucune au-dessus de 400 lignes.
- Aucun essai natif sur appareil, build release, paiement réel ou mesure de
  température effectué. Aucun engagement de disparition des freezes/crashes.

## Validation native encore nécessaire avant diffusion

- Trajet long iPhone/Android, plusieurs réservations et plusieurs places par
  réservation ; dépose automatique/manuelle, interruption, reprise et paiement.
- Veille puis retour à l'arrivée, alternance Wi-Fi/Mobile Money/réseau coupé,
  accès expiré et référence de paiement encore en attente.
- Quitter/revenir au portefeuille et à la navigation pendant une réponse lente ;
  déconnexion/reconnexion sans affichage d'un ancien dialogue.
- Build release Android installé depuis les splits du store, vérification des
  bibliothèques natives et essai release iOS ; observation mémoire/CPU/température
  et rapports natifs. Les tests JavaScript ne prouvent pas la disparition des
  crashes natifs, des freezes ou de la chauffe.
