# Audit global de stabilité et de fiabilité — 29 octobre 2026

> Suivi : les trois P2 et le périmètre de compilation P3 ont ensuite été corrigés à la demande de l'utilisateur. Voir [les correctifs et leurs vérifications](CORRECTIFS_ALERTES_HORAIRES_2026-10-29.md). Les constats et mentions « non appliqué » ci-dessous décrivent l'état au moment de l'audit, conservé comme historique.

## Périmètre et conclusion

Audit du mobile courant et des services backend associés : reprise de session/navigation,
demande/réservation, alertes natives et restitution iOS, paiement/portefeuille,
notification du conducteur, localisation en arrière-plan et nouvelle présentation de
l'accueil. Il s'agit d'une revue des chemins sensibles accompagnée de tests, pas
d'une inspection exhaustive de chaque ligne ni d'une certification de production.

**Trois anomalies P2 reproduites restent à corriger.** Les campagnes terminées
ci-dessous passent, mais ne prouvent pas l'absence de crash sur appareils réels.
Les changements préexistants des deux dépôts sont conservés ; aucun correctif
applicatif, déploiement, migration ou accès à la production dans cet audit.

## Anomalies confirmées

### P2 — La fiche conducteur masque un trajet confirmé après une panne réseau

- Emplacement : `app/request/[id].tsx:59` et `:77` ; rafraîchissement après
  acceptation dans `hooks/request-detail/useRequestDriverActions.ts:257`.
- Le bloc d'erreur remplace la fiche, même avec une demande attribuée et son
  identifiant de trajet en cache. Le lien « Voir mon trajet » est réservé au
  passager ; le conducteur ne peut plus poursuivre depuis cette fiche.
- Reproduction JavaScript : vrai composant, contrôleur simulant une attribution
  confirmée et une lecture `FETCH_ERROR`, puis HTTP 503. Dans les deux cas,
  aucun lien conducteur ; le cas témoin passager garde son lien.
- Ce défaut existait dans l'audit précédent et demeure présent. Il ne supprime
  pas l'attribution serveur et ne prouve aucune perte de réservation.
- Correctif proposé, **non appliqué** : garder un accès au trajet confirmé pour
  les erreurs transitoires, sans réutiliser les données d'un autre compte ni
  contourner les réponses d'autorisation/suppression.
- Diagnostic local : `.expo/audit-final-request-offline.cjs`, réexécuté.

### P2 — Rejet asynchrone non géré lors de la suppression du compte

- Emplacement : `store/api/user/getProfileSummary.endpoints.ts:70`.
- `deleteAccount.onQueryStarted` attend `queryFulfilled` puis la suppression
  AsyncStorage sans gestion d'erreur. RTK Query n'attend pas la promesse renvoyée
  par ce callback. Le `try/catch` de `useSettingsAccountActions` protège la mutation
  appelée par l'écran, mais pas cette seconde chaîne asynchrone.
- Reproduction avec le véritable store/middleware RTK et le véritable endpoint,
  HTTP et stockage simulés : échec réseau traité par l'appelant **et un rejet
  non géré** ; succès HTTP suivi d'un échec de stockage **et un rejet non géré**.
  Aucun compte réel n'a été supprimé.
- Conséquence établie : erreur asynchrone hors du traitement de l'écran. L'effet
  précis sur Hermes/iOS/Android en release n'a pas été testé : ne pas présenter
  ce résultat comme un crash natif reproduit.
- Correctif proposé, **non appliqué** : intercepter séparément l'échec métier et
  l'échec de nettoyage local, tout en conservant la déconnexion après suppression
  serveur réussie. Ajouter ces deux scénarios à la suite régulière.
- Diagnostic local : `.expo/audit-stability-delete-account.cjs network` et `storage`.

### P2 — Le statut d'accueil peut annoncer une réception qui n'est plus vérifiée

- Emplacement : `features/home/homeDriverStatus.ts:23` et `:25`.
- Dès qu'un cache existe, `isError` est ignoré. `available` est accepté tel quel,
  sans vérifier l'expiration d'une présence historique (`discoveryEnabled: null`).
- Reproduction sur la fonction réelle : présence récente mais bail expiré,
  disponibilité positive en cache, puis erreur de rafraîchissement. Les deux cas
  affichent toujours en vert « Vous recevez les demandes ».
- Contrat serveur : `dispatch.service.ts:83` calcule une disponibilité à l'instant
  de lecture ; `driver-location-policy.ts` invalide un bail historique expiré.
  En outre, cette réponse ne constitue pas un diagnostic des permissions audio,
  de notification ni de la livraison du push au téléphone.
- Impact : un conducteur peut croire ses alertes opérationnelles et ne pas
  consulter les réglages malgré une situation inconnue ou périmée.
- Correctif proposé, **non appliqué** : distinguer disponibilité serveur et
  réception d'alertes ; état incertain en cas de rafraîchissement impossible,
  respect des baux historiques. Ne pas faire expirer artificiellement les
  positions durables (`discoveryEnabled: true`) prévues par le produit.
- Diagnostic local : `.expo/audit-stability-driver-status.cjs`.

### P3 — Le contrôle TypeScript local backend inclut des diagnostics temporaires

- `../zwanga-backend/tsconfig.build.json:3` exclut les tests mais pas `tmp/` et
  n'impose pas d'inclusion limitée à `src/`.
- La commande standard échoue actuellement avec TS2339 dans le script local
  ignoré `tmp/audit-booking-interleavings.ts:23` (`DataSourceOptions.port`).
  Ce script n'a pas été créé ou modifié pendant cet audit.
- Le Dockerfile ne copie que `src/` et les fichiers de configuration ; `.dockerignore`
  exclut aussi `tmp`. Il ne s'agit donc pas d'une preuve d'échec de l'image de
  production ni d'un crash du serveur déployé.
- Piste **non appliquée** : séparer la compilation applicative des diagnostics
  locaux et typer les diagnostics conservés. Ne pas supprimer les fichiers de
  travail pour masquer le problème. Une vérification temporaire limitée à `src/`,
  avec les mêmes options TypeScript et sans émission, est exécutée séparément.

## Vérifications de cette campagne

| Contrôle | Résultat | Portée réelle |
| --- | --- | --- |
| Compatibilité URI/Metro, parité native, TypeScript mobile, ESLint, frontière réseau, taille des sources | Réussis ; 1 243 sources sous la limite de 400 lignes | Vérifications statiques, sans compilation native complète |
| Suite mobile globale | **2 990 réussis, 0 échec, 1 ignoré (Ruby absent)** | Tests JavaScript, composants/hooks avec dépendances natives simulées ; 2 991 cas au total |
| Backend auth, demandes, paiements, portefeuille | **891 tests réussis, 65 suites** | Services réels avec dépendances simulées ; suites PostgreSQL exclues de ce lot |
| Paiement mixte, repli cash et portefeuille | **74 tests réussis, 4 suites** | Dont 26 cas sur PostgreSQL/PostGIS jetable : concurrence, débit unique, rollback et retour tardif ; prestataire simulé |
| Paiement conducteur, socket et rattrapage REST | **151 tests réussis, 7 suites** | PostgreSQL jetable et autres tests unitaires ; émission après commit et décodage mobile exercés |
| Publication native Android | **17 scénarios réussis** | Carte, prix/actions, doublons, auteur exclu, expiration, WorkManager, repli Notifee, veille, plein écran autorisé/refusé |
| Service audio Android | **10 scénarios réussis** | Carte après 8 s, autre notification, interruption transitoire/duck, veille/déverrouillage, passage au premier plan, décision, échéance |
| TypeScript backend, commande standard | **Échec local TS2339 dans `tmp/`** | Diagnostic temporaire inclus à tort dans la compilation ; voir P3 |
| TypeScript backend limité aux sources `src/` | **Réussi** | Options backend et types ambiants du backend, sans émission ni diagnostic `tmp/` ; pas une image Docker compilée |

Les campagnes se recoupent ; ne pas additionner leurs effectifs pour annoncer un
nombre de parcours uniques. Les diagnostics d'anomalies sont des tests de
caractérisation qui confirment les défauts, pas des validations d'un correctif.

La configuration TypeScript temporaire, placée dans `.expo/` du mobile, a d'abord
résolu les types ambiants du mobile et produit des erreurs `JsonWebKey`/`Multer`.
Après fixation explicite de `typeRoots` vers les dépendances **backend**, le
contrôle limité à `src/` passe. Ces premières erreurs du montage diagnostique ne
sont pas retenues comme défauts du backend. Aucun fichier applicatif n'a été
modifié pour faire passer cette vérification.

Le premier essai PostgreSQL dans le bac à sable a échoué au démarrage de `pg_ctl`
et au délai d'`initdb` : 26 cas non exécutables, 48 tests unitaires réussis.
La relance locale autorisée hors de cette restriction a réussi les 74 cas.
Seuls des clusters temporaires créés par le banc ont été initialisés puis
supprimés ; aucune base existante ni donnée utilisateur n'a été consultée.
Les consignes PostgreSQL ont guidé cette isolation et les vérifications de
concurrence/rollback ; aucun changement de schéma applicatif.

## Précautions natives et limites restantes

- Banc Android séparé `com.zwanga.audit`, sans permission Internet. L'empreinte
  SHA-256 de l'APK installé correspond à l'artefact local ; les 13 sources Java
  copiées dans le banc correspondent aux sources actuelles. Pas de recompilation
  complète de Zwanga dans cette campagne.
- Notifications, MediaPlayer, activités et SystemUI sont réels dans l'émulateur ;
  identité, événements d'arrivée et pont React sont simulés. Le banc utilise le
  rendu logiciel configuré précédemment pour isoler les problèmes graphiques de
  cet émulateur. Ces résultats ne valident pas Fabric, le SDK de carte, le rendu
  GPU ou les transitions de la véritable application.
- L'état `playing` du lecteur n'est pas une mesure acoustique. Une perte
  définitive de priorité audio arrête le son selon la politique actuelle tout
  en conservant la carte ; les interruptions transitoires sont reprises.
- Aucun test iOS/Xcode, Samsung physique, Doze prolongé, push réel FCM/APNs,
  Mobile Money opérateur ou GPS physique en arrière-plan. Pas de recette complète
  push → application React Native → acceptation → navigation → paiement dans
  cette campagne. Le débit bancaire réel n'est jamais simulé comme une preuve.
- Aucun chiffre de FPS, mémoire, batterie, chauffe ou capacité AWS n'a été
  mesuré. Les durées de tests sur ce poste chargé ne sont pas des latences de
  production. Le polling des paiements est suspendu hors premier plan/hors ligne,
  le rattrapage iOS est borné à deux tentatives par activation et les nouveaux
  marqueurs d'accueil réutilisent les listes chargées (maximum dix) : constats de
  code, pas mesures physiques.
- Avant production : corriger les trois anomalies, relancer les régressions,
  puis tester les builds exacts sur iPhone et Android physiques avec réseau
  interrompu, permissions retirées, appareil verrouillé et reprise de paiement.

## Traces locales

`.expo/stability-20261029-release.log`,
`.expo/stability-20261029-backend-{units,payments,payments-retry,receipts,types,types-src,types-src-retry}.log`,
`.expo/stability-20261029-native-delivery.json/native-matrix.json`,
`.expo/stability-20261029-audio/results.json` et les diagnostics cités ci-dessus.
Le dossier dont le nom se termine par `.json` est le répertoire de sortie du
runner natif. Ces artefacts restent locaux et ignorés par Git.
