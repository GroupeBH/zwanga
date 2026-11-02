# Audit global de fiabilité et de sécurité de Zwanga

Date : 1 novembre 2026. Périmètre : mobile `zwanga` (`1c3a37b`) et serveur `zwanga-backend` (`79b6ac1`), sans modification du fonctionnement ni déploiement.

## Conclusion

**Suivi du 2 novembre :** des correctifs ont été appliqués après cet audit. Voir l’entrée « Correctifs de l’audit global mobile et backend » dans le [journal technique](CHANGEMENTS_TECHNIQUES.md). Le présent rapport conserve les constats et résultats initiaux ; les validations, corrections partielles et limites restantes figurent dans ce suivi.

Les contrôles mobiles et les intégrations isolées de distribution des demandes et de paiement réussissent. Ils ne suffisent toutefois pas à valider sans réserve une mise en production : la reprise de certaines notifications n'a pas les protections de concurrence du chemin urgent, une écriture partielle des identifiants peut laisser une session incohérente, et certains journaux conservent des données personnelles. Un test backend échoue au changement de mois. Le verrou CocoaPods local doit également être réconcilié avec les dépendances attendues et vérifié sur macOS.

Une interruption de Redis conserve les invitations déjà enregistrées et permet leur expiration SQL, mais bloque la sélection du conducteur suivant. Cette limite de disponibilité est explicitement confirmée par les tests existants ; ce n'est pas une preuve que Redis est à l'origine d'un incident de production.

Les priorités ci-dessous sont celles de correction du projet, distinctes de la sévérité attribuée aux avis de sécurité npm. P2 signifie un problème important, conditionnel ou de fiabilité à traiter avant de conclure à une validation globale ; P3 désigne une amélioration ciblée. Aucun exploit critique ni panne de production n'a été démontré dans cette intervention.

## Constats prioritaires

### A01 P2 Reprise des notifications sans protection contre les résultats de workers périmés

- **Code :** backend `src/notifications/notifications.service.ts:900`, `:936`, `:967` ; `src/notifications/notification-push-claim.ts:21`, `:62`.
- Le cron de reprise prend jusqu'à 25 notifications, marque le lot avec la constante `CRITICAL_PUSH_RETRY_CLAIMED`, puis les traite successivement. Il ne leur associe pas le jeton de propriété `ownPushClaim` ni son renouvellement, contrairement au chemin urgent.
- Après cinq minutes, un autre worker peut reprendre une ligne toujours en attente. Si l'ancien worker finit ensuite, `saveNotificationResult` utilise `repository.save` sans vérifier qu'il possède encore cette tentative. Une lenteur fournisseur ou une interruption rend donc possibles des doublons et l'écrasement d'un état plus récent. Un verrou SQL lors de la sélection ne protège pas la période d'envoi après le commit.
- **Preuve locale :** le véritable helper, exécuté avec un dépôt simulé, accepte la sauvegarde sans propriété ; le même résultat est rejeté lorsqu'un jeton périmé lui est associé. Le chevauchement complet de deux workers avec fournisseur lent n'a pas été reproduit.
- **Impact :** notifications transactionnelles répétées ou incohérentes, notamment de paiement ; ce constat ne démontre pas un double débit. Les alertes urgentes sont exclues de cette requête et disposent déjà d'une protection distincte.
- **Correction proposée :** identifiant unique par tentative, renouvellement borné, sauvegarde conditionnelle, délai fournisseur explicite et concurrence limitée. Ajouter un test de reprise après expiration avec deux workers et un résultat tardif. Ne pas enlever les contrôles d'obsolescence métier.

### A02 P2 Une écriture partielle peut laisser une paire de jetons incohérente

- **Code :** mobile `services/tokenStorage.ts:187`, `:198` ; `features/auth/sessionPolicy.ts:4` ; restauration dans `store/slices/authSlice.ts`.
- L'access token et le refresh token sont enregistrés séparément avec `Promise.allSettled`. En remplaçant une paire existante, l'échec d'une seule écriture peut laisser le nouveau premier jeton avec l'ancien second. La politique de restauration contrôle les dates et l'identité du jeton d'accès, mais ne compare pas les identités des deux jetons.
- **Preuve locale :** stockage synthétique d'une paire A, remplacement par B avec échec de l'écriture du refresh token, puis rechargement du module : la paire B/A persiste et la politique l'accepte. Aucune identité réelle ni authentification serveur utilisée.
- **Impact :** identité locale et session renouvelée susceptibles de diverger, ou reconnexion échouée après redémarrage. Le scénario nécessite une paire préexistante et un échec partiel ; il ne décrit pas une déconnexion normale réussie. Il ne contourne pas la vérification cryptographique du backend.
- **Correction proposée :** écriture atomique d'une enveloppe de session versionnée, ou protocole durable de validation de la paire ; vérifier la concordance d'identité. Tester chaque écriture interrompue et le redémarrage, en conservant les protections de déconnexion et la récupération hors ligne.

### A03 P2 Les journaux de paiement et de connexion ne masquent pas toutes les données personnelles

- **Code :** backend `src/payments/payment-log.util.ts:33`, `:41` ; `src/payments/payments.service.ts:503`, `:632` ; `src/auth/auth.service.ts:325`, `:333` ; `src/common/logger/logger.module.ts:16`.
- Le filtre masque les clés de secrets et celles contenant `phone`, mais laisse notamment `payer.msisdn`, `email` et `name`. Les callbacks fournisseur sont enregistrés au niveau `warn`. Des échecs de connexion journalisent également le numéro de téléphone brut. Le niveau par défaut de production conserve les avertissements.
- **Preuve locale :** le filtre conserve un numéro `msisdn` et une adresse électronique synthétiques alors qu'il masque le champ `token`. Aucune donnée ou archive de journal de production consultée.
- **Impact sécurité :** exposition inutile de données personnelles aux personnes et outils ayant accès aux journaux, même sans compromission de la base applicative.
- **Correction proposée :** journaliser une liste restreinte de champs techniques, supprimer les payloads bruts et utiliser un identifiant non réversible pour corréler les échecs de connexion. Compléter les tests de masquage imbriqué et vérifier la rétention et les accès aux journaux.

### A04 P2 Redis reste indispensable à la sélection du prochain conducteur

- **Code :** backend `src/trip-requests/dispatch/sequential-dispatch.service.ts:43`, `:102` ; `src/trip-requests/dispatch/sequential-dispatch.postgres.spec.ts:281`, `:299`.
- Si `queue.claim()` échoue, `advance()` retourne sans créer de nouvelle invitation. La récupération SQL des expirations continue ; elle ne remplace pas la sélection Redis. Les scénarios existants confirment l'absence d'une nouvelle invitation pendant la panne, puis la reprise au rétablissement.
- **Impact disponibilité :** une demande peut rester sans nouveau conducteur alerté pendant une panne Redis, malgré un backend HTTP et une base disponibles. Les notifications déjà enregistrées ne sont pas toutes perdues pour autant.
- **Correction proposée :** décider explicitement entre cette dépendance forte, accompagnée de haute disponibilité Redis et d'une alarme métier, et un secours SQL borné sous les mêmes contraintes d'exclusivité. Ne pas introduire une sélection parallèle sans protection contre la double affectation.
- **Infrastructure à vérifier :** les valeurs par défaut de `infra-aws/variables.tf:124`, `:182`, `:239`, `:245` correspondent à RDS sans Multi-AZ, un nœud Redis et une tâche ECS sans autoscaling. Ce sont des valeurs de code, pas un relevé des ressources AWS déployées. Activer des réplicas nécessite une décision de coût et une validation de bascule.

### A05 P2 Un test backend dépend du mois réel et échoue en novembre

- **Code :** backend `src/subscriptions/subscriptions.service.spec.ts:409`, `:411`, `:413`.
- Le test attend les bornes d'octobre 2026, mais appelle le service pour le mois courant sans figer l'horloge. Le 1 novembre, le service calcule novembre et l'assertion échoue.
- **Preuve :** la campagne backend complète hors suites PostgreSQL/Redis termine avec 3 136 réussites, un échec et un test ignoré.
- **Impact :** suite de validation rouge et risque de bloquer une livraison ou d'encourager le contournement des contrôles. Ce résultat ne démontre pas une erreur de calcul des abonnements en production.
- **Correction proposée :** figer l'horloge du test ou injecter une horloge ; couvrir les changements de mois et d'année dans le fuseau de Kinshasa.

### A06 P2 Des dépendances présentent de nouveaux avis de sécurité

Inventaire npm du 1 novembre, dépendances de développement incluses, sans installation ni mise à jour automatique :

| Dépôt | Critiques | Élevées | Modérées | Faibles | Total signalé |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mobile | 0 | 0 | 111 | 1 | 112 |
| Backend | 0 | 2 | 35 | 1 | 38 |

Ces nombres incluent la propagation d'un même avis dans plusieurs dépendances ; ils ne représentent pas autant de failles indépendantes exploitables.

- Backend `package-lock.json:13535` : `joi 17.13.8`, concerné par un déni de service dans la validation de listes d'adresses électroniques. Aucun appel applicatif à cette fonction n'a été identifié. Les correctifs annoncés incluent 17.13.9 et 18.3.1. [Avis du mainteneur Joi](https://github.com/hapijs/joi/security/advisories/GHSA-4528-x5fx-h6hg).
- Backend `package-lock.json:16697` : `systeminformation 5.33.1`, via la chaîne PM2, concerné notamment par une injection dans `services()` sous Windows. Le conteneur fourni démarre directement Node sous Linux, sans appel applicatif identifié à cette fonction ; ne pas assimiler cet avis à une exécution distante démontrée sur AWS. [Avis du mainteneur systeminformation](https://github.com/sebhildebrandt/systeminformation/security/advisories/GHSA-3f7j-7jwc-fxfj).
- Les arbres mobile et backend propagent aussi des avis sur `glob`, `minimatch` et `deepmerge`, notamment dans les outils de build/lint. L'avis `glob` concerne le contournement d'annulation ; les versions corrigées commencent à 14.0.2. [Avis du mainteneur glob](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4).

**Correction proposée :** mises à jour ciblées compatibles, puis tests des consommateurs et reconstruction native si nécessaire. Ne pas appliquer `npm audit fix --force` : les propositions automatiques comprennent des changements majeurs incompatibles avec l'ensemble Expo actuel. L'inventaire n'est pas un scan d'exploitation et ne couvre pas les dépendances système des images effectivement déployées.

### A07 P2 La validation native iOS locale reste incomplète

- **Code :** mobile `ios/Podfile.lock:1`, `ios/Podfile`, `scripts/validate-ios-crashlytics.cjs`, `package.json:13`.
- `validate-ios-crashlytics.cjs` échoue réellement avec code 1 : le verrou versionné ne comporte pas les Pods Crashlytics et Didit attendus, alors que le SDK Didit installé attend 4.9.1. Les phases du projet sont contrôlées séparément ; il ne faut pas remplacer ce diagnostic par l'affirmation que Crashlytics fonctionne dans l'archive.
- Le contrôle des images Xcode EAS passe en mode configuration uniquement. EAS exécute `pod install` avant le hook post-install : un verrou local incomplet n'est donc pas à lui seul la preuve d'un prochain échec cloud. [Ordre officiel du build iOS EAS](https://docs.expo.dev/build-reference/ios-builds/).
- **Action avant validation iOS :** réconcilier les Pods sur macOS, conserver le verrou généré, exécuter le contrôle après installation, compiler une archive release et vérifier la remontée symboliquée d'un incident de test. Ne pas modifier manuellement les versions résolues pour faire passer le contrôle.

### A08 P3 Le secours des permissions de localisation exige encore une navigation manuelle

- **Code :** mobile `hooks/profile/useNearbyLocationPermission.ts:113` ; `components/location/BackgroundLocationApproval.tsx:38`.
- Lorsque la demande système ne peut plus être présentée, le secours appelle `Linking.openSettings()`. Le modal indique ensuite le parcours « Autorisations → Position → Toujours autoriser » sur Android ou « Position → Toujours » sur iOS.
- **Impact UX :** ce cas reste plus complexe que le choix direct souhaité par l'utilisateur. Ce n'est pas une permission fictivement accordée : l'état est relu au retour et le guide décrit les étapes restantes.
- **Amélioration proposée :** conserver le recours système, tester les chemins disponibles par OS/constructeur et adapter précisément la consigne au résultat. Ne pas promettre un accès direct universel ni un retour automatique que le système ne garantit pas. Aucun essai de ce parcours sur appareil physique dans cet audit.

## Couverture des services et comportements conservés

| Domaine | Vérifications et protections observées | Limite de la conclusion |
| --- | --- | --- |
| Authentification et sessions | Stockage sécurisé, protections de déconnexion, renouvellement partagé et contrôles de session ; défaut A02 reproduit séparément | Pas d'attaque sur comptes réels, ni de validation d'authentification Apple sur appareil |
| Demandes et réservations | PostgreSQL/PostGIS et Redis isolés, exclusivité, refus, expiration, retrait après acceptation, ciblage carte et reprise | Transport push et client mobile simulés dans ces intégrations ; dépendance Redis A04 |
| Notifications et sonnerie | Tests des contrats, délais, réception, cycle de vie et code Java ; parité des sources natives | Ni son audible, ni réveil, ni plein écran FCM/APNs physique validés ici ; A01 concerne la reprise non urgente |
| Paiements et jetons | 17 scénarios PostgreSQL isolés de concurrence, idempotence et rollback ; tests unitaires callbacks/reprises | Prestataires simulés, aucun débit, remboursement ou callback de production |
| Localisation et cartes | Tests de permissions, envoi, sélection et rendu logique ; flux d'actualisation conservé | GPS réel en veille, autonomie et restrictions constructeur non mesurés ; A08 |
| Réseau et reprise | Frontière HTTP centralisée validée, tests des erreurs et de l'isolation des sessions | Pas de mesure p95 sous charge, de coupure radio réelle ou de panne AWS |
| Infrastructure | Configuration de TLS, chiffrement, ressources privées, contrôles de santé et alarmes examinée | Valeurs AWS effectives, bascule et restauration de sauvegarde non vérifiées |
| UX et UI | Routage prioritaire, actions, permissions, données manquantes et tests de présentation examinés | Pas de validation visuelle exhaustive de chaque écran ni de test utilisateur ; ne vaut pas certification d'accessibilité |

Les limites système restent importantes : APNs ne garantit pas la livraison de chaque notification, et une alerte plein écran Android dépend de conditions et permissions du système. Un succès fournisseur ou un accusé d'affichage ne prouve pas un son audible ni l'attention du conducteur. [Documentation Apple sur les notifications distantes](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CreatingtheNotificationPayload.html), [notifications urgentes Android](https://developer.android.com/develop/ui/views/notifications/time-sensitive).

## Résultats des contrôles réellement exécutés

Environnement Node 24.22.1 sous Windows. Les suites backend utilisent un environnement minimal et, pour les intégrations, des instances locales jetables ; aucun environnement de production n'est chargé.

| Contrôle | Résultat |
| --- | --- |
| Mobile `scripts/check-release.cjs` | Réussi : TypeScript, ESLint erreurs, parité native, compatibilités URI/images, frontière réseau et taille des sources |
| Tests mobiles inclus dans ce contrôle | 3 043 réussis, aucun échec, un ignoré, sur 3 044 ; durée de la campagne de tests environ 292 s |
| Taille des sources mobiles | 1 249 sources contrôlées, aucune au-delà de la limite de 400 lignes |
| Backend TypeScript `tsconfig.build.json` | Réussi, sans émission de fichiers |
| Backend tests généraux hors PostgreSQL/Redis | 3 136 réussis, un échec A05, un ignoré ; 254 suites réussies, une échouée, une ignorée ; environ 328 s |
| Attribution des demandes PostgreSQL/PostGIS et Redis | Deux suites réussies ; 179 tests réussis et un benchmark optionnel ignoré ; environ 248 s |
| Intégrité financière PostgreSQL | Une suite, 17 tests réussis ; environ 48 s |
| Backend `test/dependency-security.test.cjs` | Cinq tests réussis : upload borné, gRPC local, instrumentation, modules natifs image/mot de passe et sérialisation Swagger |
| Reproductions additionnelles sur modules réels | Quatre assertions confirmées : identités de jetons différentes acceptées, paire partiellement remplacée après redémarrage, `msisdn/email` non masqués, sauvegarde de notification sans propriété |
| Configuration des images EAS iOS | Réussie avec `--config-only`, sans Xcode |
| Pods iOS locaux | Échec du contrôle Didit/Crashlytics A07 |
| Inventaire npm des deux dépôts | Réalisé contre le registre ; dépendances non modifiées ; résultats A06 |

Le test mobile ignoré nécessite Ruby pour exécuter la politique CocoaPods. La compilation de fragments Java et leur exécution sur JVM ne remplacent pas une compilation complète Android ni un essai sur téléphone. Les durées du tableau sont celles des campagnes, pas des latences de l'application. Le benchmark de charge optionnel n'a pas été exécuté ; aucun chiffre de mémoire, de chauffe, de batterie ou de débit maximal n'est certifié.

Les premières tentatives de démarrage des services PostgreSQL/Redis étaient bloquées par les restrictions d'exécution locales. Les relances autorisées sur instances isolées ont réussi et les bancs ont nettoyé leurs instances temporaires. Ce problème initial n'est pas classé comme panne applicative.

## Vérifications complémentaires avant production

1. Corriger et tester A01, A02, A03 et A05, puis traiter les dépendances A06 sans casser Expo et les consommateurs backend.
2. Valider les Pods et l'archive iOS A07 sur macOS ; compiler également la vraie build Android release.
3. Confirmer les paramètres AWS réellement déployés et le choix de résilience Redis A04. Tester la bascule et la restauration sur un environnement dédié.
4. Corréler invitation, tentative fournisseur, accusé reçu/affiché et décision dans un tableau de suivi opérationnel. Mesurer les délais de chaque étape et les invitations expirant sans affichage ; ne pas se limiter au statut fournisseur `sent`.
5. Réaliser sur Android et iPhone physiques les cas application ouverte, arrière-plan, veille, déverrouillage, notification concurrente, perte de réseau et changement de compte. Inclure acceptation/refus, réservation et arrêt de la sonnerie après traitement.
6. Tester le paiement jetons + complément avec le bac à sable fournisseur, callback retardé ou doublé, reprise manuelle et affichage du résultat au conducteur. Ne pas utiliser de paiements réels pour valider une hypothèse.
7. Mesurer sous charge les endpoints et workers, ainsi que le comportement lent de S3 et Rekognition. Les clients de `src/common/services/s3.service.ts:23` et `content-moderation.service.ts:93` n'explicitent pas leur budget de requête ; les délais effectifs du SDK restent à mesurer. Aucun blocage infini ni doublon d'upload n'est démontré ici.

## Livrables et précautions

Seuls ce rapport et sa référence dans `CHANGEMENTS_TECHNIQUES.md` sont ajoutés aux fichiers versionnés. Les recommandations ci-dessus ne sont pas appliquées. Le diagnostic synthétique local `.expo/audit-global-20261101.cjs`, ignoré par Git, n'est ni un nouveau composant ni un correctif livré. Les lanceurs backend locaux existants n'ont pas été modifiés.

Le guide de sécurité a orienté la distinction entre présence d'une dépendance vulnérable et possibilité réelle d'exploitation ; le guide PostgreSQL a orienté l'examen des verrous et les essais de concurrence. Le guide rédactionnel a servi à consigner les résultats dans la documentation du dépôt, sans publication externe. Aucun secret, contenu de `.env`, donnée personnelle réelle, changement de schéma, déploiement, envoi de notification réelle ou mouvement financier n'est inclus dans cette intervention.
