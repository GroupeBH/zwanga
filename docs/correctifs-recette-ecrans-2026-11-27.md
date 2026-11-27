# Correctifs de la recette des écrans — 27 novembre 2026

## Complément R10–R11 : partage du reçu et accessibilité des services

Cette seconde passe corrige les deux défauts confirmés dans [la recette des actions restantes](recette-actions-restantes-2026-11-27.md), sans modification backend, dépendance supplémentaire, migration, déploiement, création de paiement ni envoi externe.

### Solution effectivement appliquée

- **R10** — `hooks/payment-history/usePaymentReceiptDownload.ts` remplace `Share.share({ message: contentUri })` par `Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })`. Le module `expo-sharing` était déjà installé. Son implémentation Android attache le fichier avec `EXTRA_STREAM` et accorde le droit de lecture via son FileProvider ; l'application ne partage plus une adresse locale en texte. L'API a été vérifiée dans la version locale 14.0.8 et dans la [documentation Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/), sans reprendre la configuration d'extensions entrantes des versions plus récentes.
- Disponibilité vérifiée avant écriture, repli existant du dossier documents vers le cache conservé. Si le partage ou le stockage est indisponible, l'erreur est explicite et le verrou est libéré. Le web indique d'utiliser l'application mobile : aucun fichier local n'est envoyé sur un serveur pour contourner cette limite. Le succès dit seulement que le document est préparé, pas qu'un destinataire l'a reçu.
- Le générateur PDF, les montants et les appels métier sont inchangés. Fermeture du détail avant présentation native, identité du paiement, verrou de double clic et vérifications compte/session/écran avant et après les attentes restent en place. Une déconnexion pendant l'écriture empêche le partage suivant ; elle ne peut pas révoquer un partage déjà présenté au système.
- **R11** — `features/pro-services/ServiceLayout.tsx` ajoute `accessibilityLabel={title}` au `ServiceButton`, normalise les états `busy`/`disabled` et marque le spinner `accessible={false}`. Le bouton conserve son titre dans les états normal, désactivé et occupé ; son action reste désactivée pendant le chargement. Les règles d'accès aux dossiers restent inchangées.

### Vérifications terminées

- `tests/paymentReceiptSharing.test.js` : **18 nouveaux cas**, sur le vrai hook avec stockage/partage natifs simulés. Pièce jointe PDF Android/iOS, absence de partage texte, indisponibilité/web, cache/stockage manquant, erreurs de lecture/écriture/partage et nouvelle tentative, doubles clics, mauvais paiement, réponses tardives à chaque attente, changement de compte, sortie d'écran et démontage.
- `tests/proServiceUI.test.js` : **un nouveau cas** sur le vrai composant et cinq états, vérifiant titre, rôle, désactivation et spinner. `tests/auditScreenCorrections.test.js` conserve les gardes de sélection/session avec le nouveau partage simulé. `scripts/audits/verify-screen-corrections.cjs` inclut ces suites : **92 réussis, zéro échec, zéro ignoré**. Les dépendances natives sont simulées dans ces tests, pas certifiées par eux.
- TypeScript global mobile sans émission réussi ; ESLint des six fichiers de code/tests/outillage concernés réussi ; frontière réseau et taille des 1 494 sources contrôlées réussies.
- **Émulateur Android connecté** : accès à Mes dossiers, toucher du bouton par son libellé exact sans contournement, lecture `getMyProCases` réussie. Une nouvelle hiérarchie confirme un contrôle unique, activé et cliquable, nommé « Actualiser mes dossiers ».
- **Reçu natif** : liste/récapitulatif/détail lus avec succès, toucher Télécharger PDF, détail fermé et feuille système affichant **« Sharing 1 file » et le fichier `.pdf`**, au lieu de « Sharing text ». Aucun destinataire sélectionné ; feuille annulée par Retour. Le premier contrôle de hiérarchie pendant la transition native a échoué ; il reste consigné, puis une capture visuelle et une nouvelle assertion de la hiérarchie confirment le résultat sans réenvoyer le fichier.
- Des lectures ont renvoyé `FETCH_ERROR` au retour de la feuille ; les lectures ultérieures des dossiers puis de l'accueil réussissent et `/health` répond 200 au contrôle final. Ce constat n'identifie pas la cause des interruptions locales. Accueil restauré, aucun nouveau dossier, trajet, message ou règlement créé.

Preuves privées locales : `.expo/screen-corrections-regression-2026-11-27.json` et journal TAP (nouvelle campagne de 92 cas), `.expo/platform-audit-2026-11-27-mobile-types-receipt-sharing-accessibility.json`, actions `fix-r10-*`/`fix-r11-*` dans `.expo/native-actions-2026-11-27.json`, captures `fix-r10-share-observation` et `fix-r11-accessible-title`. Ces captures et reçus peuvent contenir des données du compte de test : ils restent ignorés par Git et ne sont pas joints à cette documentation.

**Limites** : iOS couvert uniquement par tests JavaScript et types ; aucun essai iPhone/iPad, Android physique, TalkBack/VoiceOver ou application destinataire. Aucun nouveau binaire construit ni déployé, aucune mesure de charge/chauffe/stabilité prolongée. Le correctif ne signifie pas que toute la plateforme est intégralement validée.

## Première passe R2–R8 : périmètre et résultat

Les sept défauts mobiles confirmés R2–R8 du [rapport de recette](recette-integrale-2026-11-27.md) ont reçu un correctif. R1 était déjà corrigé séparément sur la base locale. R9 reste une suspicion écartée, pas un défaut corrigé.

Cette passe ne modifie ni le code backend ni le schéma de base, ne déploie rien et ne déclenche aucun paiement réel. Un ticket synthétique a été créé par l'application sur la base locale autorisée et reste dans l'historique. Elle ne constitue pas une validation exhaustive de tous les écrans, de tous les appareils ou des prestataires externes.

## Solutions appliquées

| Référence | Problème | Solution effective et fichiers |
| --- | --- | --- |
| R2 | L'invalidation après création démontait le formulaire documentaire avant son succès | `app/services/new.tsx` vérifie le dossier existant à l'entrée, puis conserve le formulaire admis et son état pendant les rafraîchissements. La portée est propre à l'utilisateur et au service, et réinitialisée lors d'un changement de compte. L'accusé et « Suivre mon dossier » du formulaire existant restent visibles après la réponse. |
| R3 | Deux clics de sauvegarde pouvaient créer deux favoris | Verrou synchrone dans `hooks/favorites/useFavoriteLocationActions.ts`, commun à la création et à la modification, libéré en `finally`. Une erreur conserve le brouillon. Une réponse tardive ne ferme pas un écran devenu inactif et ne modifie pas l'interface d'une nouvelle session. |
| R4 | Une panne des favoris apparaissait comme une liste vide | `app/favorite-locations.tsx` distingue chargement, succès vide, erreur et données en cache. Message explicite, bouton « Réessayer », rafraîchissement manuel et conservation des lieux connus. |
| R5 | Un ancien détail de paiement remplaçait le dernier choisi | `hooks/payment-history/usePaymentDetailsSelection.ts` mutualise la sélection manuelle et le lien entrant avec un numéro de requête et une portée de session. Fermeture, changement d'écran ou de compte invalident les réponses anciennes. `app/payment-history.tsx` utilise ce contrôleur. `usePaymentReceiptDownload.ts` vérifie l'identifiant du reçu, ne remplace plus la sélection et ne partage pas une réponse reçue après invalidation de session. |
| R6 | Huit interrupteurs n'avaient aucun effet réel et oubliaient leur valeur | `app/settings.tsx` retire les faux réglages de filtrage des notifications, visibilité du téléphone/évaluations, partage de position, thème et acceptation automatique. Il ne leur ajoute pas une persistance trompeuse. « Gérer la localisation » ouvre les réglages réels conducteur, ou les autorisations système pour un passager. Les annonces de mise à jour déjà persistées et la sonnerie/vibration restent disponibles. |
| R7 | « Langue » ressemblait à un bouton sans action | Français est affiché en lecture seule, sans chevron ni élément tactile. Aucun changement de langue non traduit n'est proposé. |
| R8 | Double soumission d'un ticket avant le rerendu du bouton | `hooks/support/useSupportTicketActions.ts` ajoute un verrou immédiat, conserve les champs après erreur et ignore les retours devenus obsolètes. Fermer le formulaire pendant un envoi ne vide plus ses champs. |

`hooks/useAccountScreenScope.ts` réutilise le garde de session déjà présent dans `useWalletScreenScope` : déconnexion, changement de compte, perte de focus et démontage invalident les traitements visuels en attente. Il n'annule pas une mutation déjà reçue par le serveur et ne change pas le suivi GPS.

## Comportements et précautions conservés

- Un seul dossier documentaire par utilisateur ; une demande déjà présente reste orientée vers la modification ou le suivi. Les contrôles d'unicité serveur, consentement, idempotence du formulaire et contrats restent inchangés.
- Pas de suppression des favoris existants ni de paiement lors des vérifications de cette passe.
- Les réglages supprimés étaient inopérants. Aucun nouveau filtrage serveur des messages/promotions, masquage du téléphone ou des évaluations, mode sombre, traduction ou acceptation automatique n'a été inventé. Ces fonctionnalités demanderaient une implémentation distincte de bout en bout.
- Les autorisations système et le suivi d'une course active ne sont pas coupés arbitrairement. Aucun changement dans les services GPS/voix ou l'acceptation des commandes.
- Le vieux formulaire d'identité inaccessible et son callback local ont été retirés de Paramètres. Cela ne vaut ni approbation KYC ni découverte d'un contournement accessible ; le parcours KYC existant reste inchangé.
- La protection déjà présente dans le vrai écran d'assistance contre une erreur du stockage de préférence est conservée et testée (R9).
- Les verrous des favoris et de l'assistance empêchent les doubles actions simultanées dans l'écran. Ils ne garantissent pas une exécution unique après réponse réseau perdue ou redémarrage : une garantie complète nécessite une clé d'idempotence serveur. Aucune garantie de ce type n'est annoncée ici.

## Vérifications réalisées

### Tests automatisés

`tests/auditScreenCorrections.test.js` ajoute **34 cas**, exécutant les vrais hooks et composants avec dépendances natives/API simulées : doubles clics, erreur/reprise sans effacer le brouillon, création/modification, validations, retour après changement de session, chargement/erreur/cache/vide, réponses A/B inversées, lien entrant, fermeture, reçu incohérent, contrôle de partage, paramètres réellement raccordés et erreur des réglages système.

Le cas documentaire rend le vrai parent, le vrai formulaire et son hook : le rafraîchissement commence avant la résolution de la création, puis renvoie le dossier créé. Le formulaire conserve son identité, montre « Demande envoyée » et ouvre le bon suivi. Le dossier déjà existant et le changement de compte restent bloquants avant admission.

La campagne ciblée comprend également `proServiceForm`, `driverAlertSettingsUx`, `proServices` et `platformAuditCorrections` : **68 réussis, aucun échec ni cas ignoré**. Elle ne réexécute pas les milliers de tests des campagnes précédentes. Les anciens scripts `probe-screen-edge-cases.cjs` et `probe-settings-support.cjs` lancent désormais ces assertions via `verify-screen-corrections.cjs` ; les anciens rapports de reproduction sont conservés, pas réécrits comme des succès.

Preuves locales sans secrets : `.expo/screen-corrections-regression-2026-11-27.json` et son journal TAP. Vérification TypeScript finale sans émission réussie (`.expo/platform-audit-2026-11-27-mobile-types-screen-corrections-final.json`) ; ESLint ciblé sans erreur ni avertissement ; frontière réseau valide ; contrôle de taille des sources réussi.

### Essais Android connectés

Émulateur local, compte de test, JavaScript courant chargé par Metro, ancien binaire 1.0.18 / 176 :

- Paramètres : absence du faux partage de position, accès « Gérer la localisation » et ouverture effective de `/driver-availability` ; lecture du statut conducteur réussie.
- Favoris : ouverture et lecture API réussies, sans suppression ni ajout d'un lieu existant.
- Historique des paiements : liste et résumé lus ; premier détail ouvert par toucher puis fermé, lecture `getPaymentDetails` réussie. Aucun encaissement, téléchargement ou partage natif de reçu.
- Assistance : formulaire ouvert, champs vides bloquants, catégorie et saisies synthétiques. Des essais de saisie ont été interrompus par un retour à l'accueil ; le journal Android contenait des mentions de rechargement de développement, sans exception fatale dans l'extrait consulté. Une saisie sans la séquence de touches précédente a ensuite réussi. Ce constat ne certifie pas la stabilité native ; ces interruptions ne sont pas comptées comme des tests réussis.
- Lors du premier toucher « Envoyer ma demande », les lectures réseau échouaient déjà ; le contrôle direct de `/health` a confirmé que le port 5200 ne répondait plus. L'écran a montré « Envoi impossible ». Après relance par l'utilisateur, un GET a confirmé l'absence du ticket avant toute nouvelle soumission. La fermeture du message a retrouvé le brouillon intact ; le nouvel envoi a affiché « Ticket envoyé » et rafraîchi la liste. **Contrôle final : HTTP 200, exactement un ticket synthétique, statut `open`, catégorie `other`.** Il reste dans l'historique, sans paiement ni contact externe. Le test du double clic simultané reste une simulation, pas un doublon créé volontairement en base.
- Documents : après correction, le dossier déjà existant sur le compte continue de proposer « Modifier ma demande », avec lectures catalogue/dossier réussies ; aucun second dossier créé. L'accueil a été restauré à la fin des essais.

Les traces sont ajoutées à `.expo/native-actions-2026-11-27.json` avec le préfixe `fix-r`. La vérification finale en lecture seule est reproductible via `scripts/audits/verify-native-correction-readback.cjs`, avec résultat dans `.expo/native-correction-readback-2026-11-27.json` (aucun jeton ni identifiant personnel enregistré). L'outil exige une hiérarchie fraîche, vérifie le focus avant saisie et ne permet un index explicite que pour les boutons répétés de consultation du détail de paiement. Il ne clique pas à l'aveugle sur les opérations financières.

## Limites restantes

Pas d'essai physique Android/iOS, de compilation native, de paiement réel, de SMS/push réel, de validation prolongée GPS/voix en veille, ni de nouvelle mesure de chauffe/mémoire/fluidité. Les tests de concurrence simulent des réponses différées ; ils ne constituent pas un essai de charge serveur. La création documentaire connectée complète n'a pas été rejouée sur un nouveau compte : le compte actuel possède déjà son dossier et la règle d'unicité n'est pas contournée.
