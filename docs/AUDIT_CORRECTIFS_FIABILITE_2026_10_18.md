# Correctifs de l’audit mobile — 18 octobre 2026

## Périmètre et autorisation

Cette passe répond à la demande d’appliquer les correctifs de performance et de
fiabilité des écrans/composants. Elle inclut les deux évolutions backend autorisées
séparément : pagination des commandes et protection des transferts rejoués.
Les modifications d’accueil et de navigation déjà présentes sont conservées.
Aucun déploiement, installation mobile, changement AWS, lecture/modification des
secrets ou migration de base n’a été effectué pendant cette passe.

## Solutions appliquées

| Problème constaté | Solution effectivement appliquée | Fichiers principaux |
| --- | --- | --- |
| Le signalement depuis la notation annonçait un succès sans appel serveur. | Envoi via l’API de sécurité, destinataire sélectionné explicitement, description validée ; succès uniquement après réponse du serveur, verrou contre les doubles appuis et suppression des retours visuels tardifs. | `hooks/rating/useRatingReport.ts`, `useRatingActions.ts`, `app/rate/[id].tsx` |
| Un transfert pouvait partir deux fois ; après coupure, son résultat pouvait être ambigu. | Verrou immédiat et référence UUID persistée avant le POST. Même référence réutilisée après erreur réseau et réouverture de l’écran. Une autre intention est bloquée tant que la précédente reste ambiguë. Une erreur de rafraîchissement du solde ne transforme plus un transfert confirmé en échec. | `services/walletTransferIntent.ts`, `hooks/wallet/useWalletTransfer.ts`, `useWalletController.tsx`, `store/api/walletApi.ts` |
| La restauration des identifiants pouvait laisser le chargement sans fin. | Au bout de 8 secondes, écran de reprise plutôt que spinner illimité. Une nouvelle tentative réutilise l’opération native encore pendante ; pas de restaurations concurrentes et pas d’effacement des jetons sur ce délai. | `hooks/auth/useAuthBootstrap.ts`, `components/ReduxProvider.tsx` |
| Une création de session KYC tardive pouvait lancer le SDK après avoir quitté l’écran. | Garde de montage, focus, génération de session et premier plan avant lancement. Annulation de la confirmation locale à la sortie ; le passage temporaire en arrière-plan de la caméra native ne rend pas automatiquement son résultat invalide. | `hooks/identity/useKycFlowScope.ts`, `hooks/useDiditKycFlow.ts` |
| Des sockets pouvaient s’ouvrir sans jeton valable et se reconnecter indéfiniment. | Aucun socket lancé sans jeton, cinq tentatives automatiques par salve ; une reprise réseau, de premier plan ou d’authentification peut lancer une nouvelle salve. Conservation des abonnements attendus et nettoyage à la fermeture de session. | `services/socketConnectionPolicy.ts`, `chatSocket.ts`, `trackingSocket.ts`, `networkRecovery.ts`, `nativeQueryListeners.ts` |
| Les profils et détails de trajet chargeaient tous les avis. | Profils publics par pages de 20 ; détail de trajet limité à un avis pour obtenir le total ; ouverture de la liste complète dans le composant paginé existant. Total et moyenne restent ceux du serveur, jamais ceux de la page seule. | `hooks/usePublicReviewPage.ts`, `app/driver/[id].tsx`, `app/passenger/[id].tsx`, `hooks/trip-detail/useTripDetailBookingState.ts`, `useTripDetailActivity.ts`, `useTripDetailController.ts`, `features/trip-detail/TripReviewsModal.tsx` |
| Les modales natives du profil et des notifications risquaient de chevaucher la navigation. | Utilisation de `RideModal` en mode intégré, fermeture Android, nettoyage lors de la perte de focus et navigation après fermeture. Une sauvegarde tardive du profil ne rouvre pas un ancien message au retour. | `app/edit-profile.tsx`, `app/notifications.tsx` |
| Les changements d’état des trajets réguliers laissaient remonter des rejets non traités. | Verrou des actions, capture des erreurs, message dans l’écran et absence de faux état vide lors d’un échec de lecture. Dates invalides affichées sans exception ; erreurs analytiques sans effet sur une action confirmée. | `app/recurring-trips.tsx` |
| Les listes de commandes téléchargeaient l’historique complet. | `requests` et `my-requests` utilisent des pages de 20, avec précédent/suivant ; recherche serveur temporisée de 300 ms, par mots et références d’adresses. Rétention d’affichage hors ligne limitée à la page et à la session courantes. | `store/api/trip-request/pageEndpoints.ts`, `store/api/tripRequestApi.ts`, `hooks/requests/useRequestsData.ts`, `app/requests.tsx`, `app/my-requests.tsx` |

## Précautions et comportements conservés

- Aucun changement de tarifs, réduction du premier trajet, origine des jetons,
  permissions de contact, règles d’embarquement/arrivée ou cadence GPS en trajet.
- Les appels déjà envoyés ne sont pas « annulés » artificiellement à la sortie
  d’un écran : leur résultat serveur reste valable, mais leur interface tardive
  est ignorée. Le délai de démarrage libère l’interface, pas un appel natif bloqué.
- Le KYC reste Didit natif sur Android/iOS, avec navigateur uniquement pour la
  cible Web, comme dans la modification précédente. Aucune session payante lancée.
- Les anciens endpoints tableau et les anciens clients sans référence de transfert
  restent acceptés côté backend. Ils ne bénéficient pas de la nouvelle garantie
  de rejouement ; ne pas publier le mobile avant le backend compatible.
- Une référence de transfert conservée est liée au compte. Elle reste en attente
  après une erreur ambiguë, y compris si une reprise est ensuite refusée pour
  authentification. Aucun nouvel envoi différent n’est fabriqué automatiquement.
  En cas d’état local corrompu/stockage inaccessible, le transfert échoue fermé.
- Les avis d’une autre personne ou d’une session précédente ne sont pas conservés
  lors d’un changement de profil/compte. Le nombre affiché est le total serveur.
- La priorité/proximité des commandes est appliquée **dans la page récente
  affichée** ; le texte de l’écran le précise. Le total peut évoluer pendant une
  acceptation concurrente ; une page vide conserve son curseur suivant.

## Backend préparé

Dans le dépôt voisin `zwanga-backend`, les trois nouveaux endpoints authentifiés
sont `GET /trip-requests/pages/available`, `pages/my-requests` et `pages/my-offers`.
La sélection bornée d’identifiants précède l’hydratation des relations. Les curseurs
conservent les microsecondes et le contexte de recherche. Les commandes déjà
attribuées sont écartées, y compris après une acceptation concurrente.

`TransferWalletPointsDto.idempotencyKey` est optionnel pour les anciennes versions.
Pour les nouvelles, l’identifiant de transfert dépend du compte émetteur et de
cette référence. La recherche des écritures existantes se fait sous les verrous
transactionnels ordonnés des portefeuilles, avant tout nouveau débit. Un changement
de montant, destinataire ou note pour la même référence est refusé.

La migration `1780000075000-IndexRequestsAndTransfers` ajoute les index de pagination
et une unicité par transfert/direction. Délais de verrouillage de 5 secondes et
d’exécution de 30 secondes **par instruction**, restauration des réglages précédents
et respect d’une transaction englobante. Elle est préparée, **pas exécutée**.
Un historique déjà incohérent ferait échouer la création de l’index unique : aucune
écriture comptable n’est effacée pour contourner ce contrôle.

Voir aussi, dans ce dépôt voisin, `docs/operations/mobile-audit-fixes-2026-10-18.md`.
Le skill PostgreSQL a guidé la pagination par curseur, les index et l’ordre des
verrous ; aucun gain SQL chiffré n’est déduit des tests simulés.

## Vérifications

- Suite mobile complète : **1 959 tests réussis**, 239 fichiers, aucun échec.
- Après les derniers garde-fous de reprise de transfert et de cycle de vie KYC :
  **44 tests ciblés réussis** dans `auditReliabilityActions`, `auditScreenReliability`,
  `auditPagedReads`, `socketRecoveryPolicy`, `diditNativeFlow` et `startupSession`.
  Ces 44 ne sont pas à additionner
  intégralement aux 1 959 : la plupart figuraient déjà dans la suite complète.
- Backend : **64 tests réussis**, six suites ciblées (transferts, portefeuille,
  pages de commandes, contrôleur, curseurs partagés, budgets de migration).
- TypeScript sans émission : mobile et backend validés. Frontières réseau : aucun
  appel HTTP direct ajouté hors RTK Query. Taille : 1 096 sources contrôlées,
  aucun fichier au-dessus du seuil de 400 lignes.
- Lint final ciblé sur onze fichiers de cette passe : aucune erreur ni avertissement.
  Le contrôle plus large des fichiers modifiés comporte encore des avertissements
  préexistants dans les hooks de navigation/détail de trajet ; pas de réécriture
  de ces parties indépendantes pour les masquer.
- Tests de non-régression existants adaptés aux nouveaux contrats paginés et à
  `RideModal`. Des assertions devenues obsolètes lors des modifications d’accueil
  et de navigation antérieures ont également été réalignées, sans retirer les tests.

## Limites et travail restant

- **La pagination n’est pas encore généralisée.** L’accueil, la recherche globale
  et les compteurs du profil utilisent encore certaines anciennes lectures de
  commandes/offres. Le nouveau endpoint de pages d’offres est prêt mais non utilisé
  par ces compteurs. Il faut des endpoints dédiés de proximité/activité et
  d’agrégats avant leur conversion, pour ne pas masquer un trajet prioritaire ou
  afficher des compteurs calculés sur seulement vingt lignes.
- Les pages bornent les commandes chargées, pas le nombre total d’offres attachées
  à chacune. Les relations d’une commande très sollicitée restent à mesurer.
- La référence locale de transfert suppose que les données de l’application ne
  sont pas effacées. Une intention ambiguë ne doit pas être abandonnée en vidant le
  stockage ; vérifier d’abord l’historique. Aucun mécanisme de réconciliation
  administrative automatique n’a été ajouté.
- Pas de test PostgreSQL réel de concurrence multi-processus, d’EXPLAIN, ni de
  mesure mémoire/CPU/réseau/énergie pour ces modifications. Les requêtes, DDL et
  accès natifs sont simulés dans les tests cités. Les chiffres d’autres audits
  présents dans le dépôt backend ne sont pas des mesures de cette passe.
- Pas de build release installé ni d’essai sur Android/iOS physique. Aucune
  disparition de crash, de blocage natif ou de chauffe n’est annoncée.

## Ordre de livraison et recette restante

1. Relire le diff backend en préservant les changements parallèles, inventorier
   toutes les migrations en attente et tester celle-ci sur une base jetable.
   Simuler deux requêtes simultanées avec la même référence et vérifier exactement
   une paire débit/crédit, puis un refus si son contenu change.
2. Livrer le backend compatible et ses index selon la procédure d’exploitation,
   avec sauvegarde et fenêtre adaptée. Cette passe n’exécute aucune de ces actions.
3. Livrer le mobile après le serveur ; pas de repli silencieux vers un transfert
   sans référence ni vers un téléchargement complet lorsque les nouvelles API manquent.
4. Sur appareils : connexion lente/hors ligne, retour réseau, KYC quitté pendant
   création de session, navigation après fermeture de modale, deux appuis sur un
   transfert, perte de sa réponse, redémarrage, reprise et changement de compte.
   Contrôler aussi les sockets lors d’un trajet actif et l’accès aux anciennes pages.
