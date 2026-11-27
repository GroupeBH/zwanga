# Audit de la plateforme Zwanga — 27 novembre 2026

## Conclusion

**Avis : pas de feu vert au déploiement en l’état.** Des parcours importants passent avec le vrai backend sur des bases temporaires, mais les contrôles de livraison ne sont pas verts et la recette intégrale n’est pas acquise. Plusieurs échecs sont des décalages de l’infrastructure de test ; ils ne prouvent pas un dysfonctionnement en production, mais empêchent de certifier les changements.

Les priorités sont : rétablir les contrôles de livraison, protéger les actions de devis côté mobile, clarifier la protection de la route de profil public, réduire le volume de l’activité conducteur et terminer les essais natifs du cycle de trajet et de l’arrière-plan.

Cet audit distingue quatre niveaux de preuve :

- **Reproduit** : résultat de test, réponse HTTP ou comportement observé pendant cette session.
- **Constaté dans le code** : mécanisme vérifiable, sans reproduction native de son impact.
- **Hypothèse** : cause plausible nécessitant une vérification supplémentaire.
- **Non validé** : contrôle non exécuté ou interrompu ; ce n’est pas un succès.

## Périmètre et conditions

Lecture du mobile, du backend NestJS, de l’admin, du portail partenaire et du site public. Exécution de tests JavaScript/TypeScript, de recettes HTTP/SQL isolées, de lectures API locales et d’un parcours Android limité.

Révisions de départ observées : mobile `a1d3dce`, backend `f66b47f`, admin `386619a`, partenaire `5d77536`, site `135935e`. Les arbres de travail contiennent aussi des modifications non commitées : ces identifiants ne décrivent donc pas seuls le code audité.

Précautions :

- Aucun déploiement, intervention AWS, paiement réel, SMS réel ni notification réelle déclenchés par les scénarios d’audit.
- Aucun trajet créé, annulé, embarqué, déposé ou réglé sur la base habituelle. Les essais mutateurs utilisent des données synthétiques et des instances PostgreSQL/Redis jetables. Les services externes y sont remplacés ou les connexions distantes interdites.
- Les lectures connectées utilisent la session de développement en mémoire, sans enregistrer son jeton, les corps de réponse ou les identifiants dans les rapports de mesures.
- Pas de réinitialisation ni de migration de la base habituelle. Les migrations utilisées pour l’authentification concernent uniquement la base temporaire du test.
- Aucun correctif fonctionnel de l’application n’est inclus dans cet audit. Les seules modifications de code concernent les scripts et fixtures de vérification décrits plus bas.
- Les compétences PostgreSQL ont guidé l’isolation et la lecture des contraintes SQL ; le rapport reste dans la documentation locale conformément aux instructions du projet.

Le poste exécutait aussi Metro, l’émulateur et le backend. La mémoire libre observée est descendue vers **0,3 à 0,4 Gio sur 15,7 Gio**. Plusieurs suites longues ont été interrompues ; leurs durées ne mesurent ni la disponibilité ni les performances de production.

## Résultats exécutés

| Contrôle | Résultat de cette session | Limite importante |
| --- | --- | --- |
| Contrôle mobile de livraison | TypeScript, ESLint sans erreur, frontières réseau et cohérence des sources natives réussis ; échec sur la taille d’un fichier | Arrêt avant l’étape de régression ; aucune compilation native |
| Régressions JavaScript mobiles, première passe | 4 255 sous-tests réussis et 12 échoués observés avant interruption à 20 minutes | Pas de bilan final de suite complète |
| Reprise de la fin de la liste mobile | 168/168 réussis | Recouvre une partie de la première passe : ne pas additionner les deux nombres comme un total unique |
| Types backend de production | Réussis | Compilation sans émission, pas démarrage d’un binaire de production |
| Types backend, tests inclus | 5 erreurs dans 3 fichiers de tests | Bloque une validation complète des tests typés |
| Backend Jest général | 71 suites réussies observées dans la première passe | Interrompu ; suites SQL conditionnelles non toutes activées ; pas de total final |
| Backend Jest en transpilation seule | Quelques suites supplémentaires réussies | Interrompu ; ne remplace pas le contrôle TypeScript |
| Admin | 236/246 tests réussis, 10 échecs ; types réussis | Les dix échecs viennent du harnais React de rapprochement de paiements |
| Partenaire | 98/98 tests réussis dans 15 fichiers ; types réussis | Pas de recette complète dans un navigateur |
| Site public | 7/7 tests réussis ; types réussis | Pas de nouvelle compilation de production ni de parcours navigateur exhaustif |
| Authentification HTTP + PostgreSQL + Redis | 6/6 scénarios réussis après réparation du schéma temporaire | SMS simulés ; pas de réception réelle sur téléphone |
| Réservation mobile → HTTP → SQL | 10/10 scénarios réussis après réparation du montage de test | Actions API réelles, mais pas de parcours tactile complet ni de prestataire de paiement |
| Crédit admin/mobile → HTTP → SQL | 8/8 scénarios réussis | Aucun débit réel chez un prestataire, aucune remise physique d’équipement |
| Catalogue commercial multi-projets | 7/9 scénarios réussis, 2 échecs | Deux décalages de fixture/contrat à résoudre avant validation |
| PostgreSQL transverse | 5 suites réussies, 3 suites en échec observées avant arrêt | Deux expirations `initdb` ; une suite de rapprochement avec deux assertions à revoir |
| Création et transmission séquentielle de demande | 2/2 scénarios sélectionnés échoués en HTTP 500 ; 127 autres volontairement exclus du filtre | Le parcours ne rejoint pas l’acceptation mobile ; fixture de dépendance obsolète identifiée |
| API du backend local habituel | 38 GET réussis en HTTP 200 ; santé HTTP 200 en contrôle final | Lectures seulement, sans charge concurrente ni preuve de stabilité longue durée |
| Android | Profil, Services, Recherche et détail d’une réservation existante consultés ; carte routière visible | Binaire installé ancien : 1.0.18, code 176, JavaScript de développement actuel |
| iOS, appareils physiques, mode veille | Non exécutés dans cette session | Aucune certification des correctifs natifs, du son, du GPS en arrière-plan ou de l’absence de crash |

### Ce que prouvent les recettes isolées réussies

**Authentification :** OTP lié au numéro, erreurs et réutilisation de preuve, inscription avec hachage du mot de passe, connexion, unicité du numéro, politique du compte historique non vérifié, réinitialisation protégée par OTP, révocation des sessions et réponse générique pour un numéro inconnu. Les SMS utilisent un fournisseur fictif ; aucun basculement vers un envoi réel n’est autorisé dans cette fixture.

**Réservation :** les constructeurs de requêtes mobiles traversent HTTP, JWT/DTO, le vrai service de réservation, SQL et l’outbox. Les scénarios couvrent notamment l’accord de prix, les capacités concurrentes, les reprises de requêtes, la propriété des données et le refus d’un accès devenu invalide. L’intercepteur réel de réponse reste actif.

**Crédit :** clients admin et mobile, création/lecture contractuelle, addition des taux, consentement devenu obsolète, contrôles de rôle/KYC, remboursement manuel, rafraîchissement du cache et reprise après une réponse perdue. Ces résultats ne remplacent pas la recette des vrais moyens de paiement.

**Catalogue :** les sept scénarios réussis couvrent entre autres achat comptant idempotent, remise conditionnée au paiement, échéance initiale et versements quotidiens, changement de formule, rôles/KYC/activité véhicule, appels issus du détail produit mobile et prix publics sans coûts privés. Les deux échecs empêchent néanmoins de déclarer l’intégration commerciale entièrement validée.

## Constats prioritaires

### A1 — Contrôles de livraison actuellement bloquants

**Priorité P1 pour la livraison ; reproduit.**

`scripts/check-release.cjs` s’arrête sur `app/trip/[id].tsx` : **401 lignes pour une limite de 400**, sur 1 490 sources contrôlées. `package.json` branche ce contrôle au post-install EAS. Il s’agit d’un échec réel du garde-fou, pas d’une preuve qu’une ligne supplémentaire provoque un crash.

Les régressions mobiles présentent douze échecs. Le backend a cinq erreurs TypeScript dans les fixtures de tests, et l’admin dix tests en échec. Un succès de compilation du code de production ne suffit donc pas à rendre le dossier de livraison vert.

**Action recommandée :** petite extraction cohérente du détail de trajet, mise à jour justifiée des fixtures et assertions, puis réexécution complète. Ne pas simplement relever la limite ni supprimer les assertions pour obtenir un résultat vert.

### A2 — Acceptation de devis déclenchable deux fois et sur lecture en erreur

**Priorité P2 ; reproduit en JavaScript sur le composant réel.**

Dans `app/services/[id].tsx:38`, le dossier provient de `currentData`. L’action utilise seulement l’état `isLoading` du rendu pour empêcher un nouvel appel (`:40–46`). Le bouton « Accepter ce devis » ne tient pas compte d’une erreur de relecture (`:181–183`).

Le probe `scripts/audits/probe-service-quote-actions.cjs` invoque deux fois le bouton avant le rendu suivant : **deux mutations sont déclenchées**, y compris avec une erreur de lecture HTTP 403 et un dossier conservé en cache. Les mutations sont simulées ; aucun débit n’est effectué.

**Protection conservée côté serveur :** `zwanga-backend/src/pro-services/pro-service.workflow.ts:94` verrouille l’utilisateur et le dossier en transaction, puis traite l’acceptation répétée de la même version de façon idempotente. L’audit ne démontre donc pas un double encaissement.

**Action recommandée :** verrou synchrone partagé entre accepter/annuler, vérification de l’état courant autorisé et blocage des actions engageantes après une erreur définitive de lecture. Tester aussi changement de session, réponse perdue et reprise après reconnexion.

### A3 — Route de profil membre absente du groupe protégé

**Priorité P2 ; omission et deux échecs de test reproduits.**

`public-profile/[id]` n’apparaît pas dans le groupe `hasSession` de `components/ProtectedAppStack.tsx:34`. Les deux cas Android/iOS de `tests/authNavigationSession.test.js` échouent.

Le composant `app/public-profile/[id].tsx:17` exige déjà un identifiant de lecteur avant de demander les données. **Aucune divulgation de données sans authentification n’a été démontrée.** L’incohérence porte sur la navigation et l’expérience après ouverture d’un lien ou déconnexion : écran indisponible au lieu d’un parcours de connexion maîtrisé.

**Action recommandée :** déclarer explicitement la politique d’accès de cette route, la placer dans le groupe approprié et vérifier les liens profonds, le retour arrière et l’expiration de session.

### A4 — L’activité conducteur reste volumineuse

**Priorité P2 ; volume et temps reproduits localement.**

`GET /trips/my-trips?scope=activity` renvoie **86 trajets et 369 899 octets de JSON décodé** sur le compte local contrôlé. Les trois lectures prennent entre **1 021 et 2 729 ms** sur ce poste chargé.

`zwanga-backend/src/trips/trips.service.ts:716` charge les relations véhicule, réservations, passagers et conducteur avant sérialisation. La politique d’activité conserve les trajets actifs/à venir et certains terminés récents ; elle ne constitue pas une pagination de tous les trajets futurs. `store/api/trip/getTrips.endpoints.ts` et `activityTripMapper.ts` consomment ce modèle riche.

**Action recommandée :** réponse d’activité compacte avec état, résumé financier et version ; chargement détaillé au besoin ; pagination séparée de l’historique et des départs futurs. Ne pas couper arbitrairement la liste au risque de masquer une course en cours, une réservation ou un paiement à terminer.

Le chemin de réconciliation après publication ambiguë (`hooks/publish/usePublishSubmission.ts:330`) relit aussi la liste historique complète. Préférer à terme une recherche serveur ciblée par identifiant d’opération, sans déduire ici un doublon de trajet non reproduit.

### A5 — Temporisation GPS partagée entre sessions de trajet

**Priorité P2 ; risque constaté dans le code, pas reproduit en veille.**

`services/driverBackgroundLocationTask.ts:31` et `services/passengerBackgroundLocationTask.ts:34` conservent chacun une échéance globale de temporisation après échec réseau. Les chemins de démarrage/arrêt ne remettent pas cet état à zéro par session. Une nouvelle course démarrée juste après l’échec de l’ancienne peut ainsi hériter du délai restant, de l’ordre de 30 secondes.

**Action recommandée :** borner la temporisation à une génération de session/trajet et ignorer les réponses tardives de l’ancienne. Conserver la protection contre les boucles réseau. Vérifier arrêt/reprise, changement de compte, mode avion et veille sur Android/iOS réels. Ce point n’est pas présenté comme la cause prouvée des remontées historiques de GPS interrompu.

### A6 — Invalidations de cache trop larges entre services

**Priorité P3 ; risque de performance constaté dans le code.**

`proServicesApi.ts`, `assetCreditApi.ts`, `fleetApplicationsApi.ts`, `fleetPaymentsApi.ts` et `fleetRegistryApi.ts` partagent le tag générique `ProServices`. Une mutation peut provoquer la relecture de plusieurs domaines simultanément **si leurs requêtes sont encore abonnées**.

**Action recommandée :** tags par domaine, liste et entité ; tests du nombre de requêtes lors d’un remboursement ou d’une modification de flotte. Aucun volume de rafraîchissement en boucle n’a été mesuré pendant cette session.

### A7 — Des fonctionnalités SQL peuvent être absentes d’une CI verte

**Priorité P1 pour la confiance dans la livraison ; constaté dans le code.**

`scripts/check-integration.cjs:8` n’inclut actuellement que les suites réservation et crédit matériel, pas les recettes authentification et catalogue commercial.

Dans les boucles d’activation PostgreSQL de `zwanga-backend/.github/workflows/deploy.yml:65` et `deploy-staging.yml:66`, les variables `CO_PASSENGERS_TEST_POSTGRES_BIN`, `DRIVER_QR_TEST_POSTGRES_BIN` et `PAYMENT_ARRIVAL_TEST_POSTGRES_BIN` sont notamment absentes. Les suites correspondantes utilisent un mécanisme d’exclusion lorsque ces variables ne sont pas définies.

**Action recommandée :** inventaire explicite des suites obligatoires, activation de leurs dépendances et échec du contrôle si une suite critique attendue est ignorée. Le lanceur local d’audit a été complété ; les workflows de déploiement n’ont pas été modifiés.

### A8 — Fixtures fragiles et services backend difficiles à isoler

**Priorité P2 de maintenabilité ; décalages reproduits.**

Exemples de volumes observés : `bookings.service.ts` environ 6 849 lignes, `trips.service.ts` 4 262, `trip-requests.service.ts` 3 392. Le nombre de lignes n’est pas un défaut en soi ; il accompagne ici plusieurs responsabilités métier et des fixtures qui instancient manuellement ces services.

Décalages rencontrés : dépôt `Booking` absent du module de test après ajout d’un intercepteur ; identité téléphonique temporaire sans la migration courante ; mocks de hooks React incomplets ; ancien écran admin remplacé par des composants ; mocks d’abonnement ne fournissant pas la méthode groupée maintenant utilisée.

**Action recommandée :** extractions incrémentales des transitions, paiements et projections ; modules de test partagés ; utilisation contrôlée des vraies migrations ; tests de composants avec un renderer React plutôt que dépendance excessive aux chaînes de code, couleurs et empreintes SHA. Ne pas entreprendre une réécriture générale sans tests de caractérisation.

## Classification des échecs de test

### Les douze échecs mobiles

| Fichier | Nombre | Analyse |
| --- | ---: | --- |
| `tests/authNavigationSession.test.js` | 2 | Omission réelle de la route de profil dans le groupe protégé ; voir A3 |
| `tests/arrivalTerminology.test.js` | 1 | Assertion textuelle trop globale, atteint aussi les commandes conducteur ; revoir le périmètre avant de changer le produit |
| `tests/driverFinance.test.js` | 1 | Sélecteur historique « Cash » incompatible avec le libellé de secours actuel ; absence du moyen de paiement non démontrée |
| `tests/passengerInterruptionPreview.test.js` | 1 | Import natif non simulé, erreur de suppression de types dans `expo-modules-core` sous Node |
| `tests/passengerPickupEstimate.test.js` | 1 | Dépendance native/Flow chargée par Node, `Unexpected token typeof` |
| `tests/pickupProximity.test.js` | 1 | Mock incomplet : `refetchBooking` absent |
| `tests/releaseAuditFixes.test.js` | 1 | Ancienne couleur attendue alors que le bouton a été modifié |
| `tests/requestSummaryViews.test.js` | 1 | Assertion de casse sur « Course confirmée » |
| `tests/sourceExtractions.test.js` | 2 | Instantanés de styles et contrat/empreinte de `confirmCashReceipt` à réexaminer, sans les réenregistrer aveuglément |
| `tests/tripExpiryAccess.test.js` | 1 | Import natif/SVG non simulé, `Unexpected token '<'` |

### Backend, admin et catalogue

- **Types backend :** `src/bookings/payment-arrival.postgres.spec.ts:32` et `security-regressions.postgres.spec.ts:53,77,97` utilisent des schémas de test dont les types ne correspondent plus aux relations/champs ; `src/payments/flexpay-deposit-evidence.spec.ts:14` fournit une preuve FlexPay incomplète.
- **Admin :** les dix échecs de `lib/features/finance/paymentReconciliation.test.cjs` invoquent le composant avec un harnais qui remplace certains hooks, mais pas `useEffect`. L’erreur React ne prouve pas un dysfonctionnement de rapprochement dans le navigateur ; ce dernier reste à tester.
- **Commerce :** un test vise l’ancien écran admin monolithique et son chargeur résout mal l’alias du composant maintenant extrait ; l’autre exige l’égalité intégrale entre projections admin et mobile alors que l’admin comporte désormais des champs privés de débiteur/retard. Ne pas exposer ces champs au mobile pour satisfaire l’assertion ; comparer le contrat public pertinent.
- **PostgreSQL transverse :** `pin-reset-welcome-bonus-postgres` et `welcome-bonus-200-postgres` échouent à initialiser la base dans le délai ; aucune assertion métier n’est atteinte. Dans `financial-recovery-postgres`, deux assertions terminales échouent avec une fixture de paiement sans `orderNumber`, alors que `flexpay-deposit-state.ts` exige maintenant une commande vérifiée concordante. La fixture doit être alignée sans affaiblir cette preuve.
- **Transmission séquentielle :** les deux scénarios sélectionnés reçoivent HTTP 500 dès la création HTTP. Le helper `zwanga-backend/test/sequential-mobile-flow.ts:86` fournit un mock avec `getPremiumOverview`, tandis que `trip-requests.service.ts:2613` appelle désormais `getPremiumFeaturesForUsers`. Ce contrat de test est certainement incomplet et constitue une cause plausible du 500 ; le logger de cette application temporaire est désactivé. Sans nouvelle exécution après correction de la fixture, le relais HTTP/push/action mobile reste non validé, et ce 500 n’est pas attribué au backend de production.

Les cinq suites PostgreSQL terminées avec succès avant interruption sont : gestion de boutique, résilience de base, cohérence financière des réservations, opérations mobiles et analyses admin. Cela ne couvre pas tout le domaine SQL.

## Mesures de performance

### API connectées : trois lectures séquentielles par route

| Route | Minimum–maximum local | Taille JSON décodée | Éléments |
| --- | ---: | ---: | ---: |
| `/me/activity` | 85–162 ms | 427 octets | — |
| `/trips/my-trips?scope=activity` | 1 021–2 729 ms | 369 899 octets | 86 |
| `/trips/my-trips/history?limit=30` | 235–1 090 ms | 95 625 octets | 30 |
| `/bookings/my-bookings?scope=activity` | 180–1 017 ms | 67 188 octets | 19 |
| `/bookings/my-bookings/history?limit=30` | 224–637 ms | 109 921 octets | 30 |
| `/zwanga-pro/commerce/categories` | 19–76 ms | 646 octets | 5 |
| `/zwanga-pro/commerce/products?limit=20` | 26–35 ms | 30 octets | 0 |
| `/zwanga-pro/mine?limit=25` | 49–68 ms | 30 octets | 0 |

Les 24 réponses de cette série sont HTTP 200. Une autre série de 14 lectures réussit aussi, dont les anciennes listes complètes : 566 trajets et 61 réservations. Le catalogue local vide limite la recette tactile de l’achat ; les produits synthétiques sont couverts dans les bases isolées.

Ces tailles sont celles des corps UTF-8 décodés, pas des octets transférés après compression. Trois échantillons par route sur un poste chargé ne permettent pas d’annoncer un p95, une capacité de production, un SLA ni un taux de disponibilité.

### Calcul de suivi d’itinéraire

Une exécution de `scripts/benchmark-driver-route.cjs`, avec 8 000 points synthétiques et 500 positions, donne environ **4 573 ms pour l’ancienne approche contre 52 ms pour l’approche indexée, construction comprise**. Les projections passent de 7 999 000 à 18 992.

C’est un microbenchmark Node du calcul géométrique, pas une mesure des images par seconde, du rendu Google Maps, de la batterie ou de la chauffe. Répéter sur appareils représentatifs avant toute promesse utilisateur.

### Protections positives constatées

- Pool SQL et délais bornés dans `src/database/typeorm-options.ts` : valeurs par défaut de 10 connexions, délai de connexion de 5 secondes, requête de 30 secondes et transaction inactive de 60 secondes. Les valeurs effectives de production n’ont pas été auditées.
- Verrous transactionnels, contrôles de capacité/propriété et idempotence exercés par les recettes réservation et crédit.
- Repli de suivi conducteur conditionné à une position devenue ancienne et au focus de l’écran ; il ne s’agit pas d’un polling aveugle permanent dans le code inspecté.
- Frontière réseau mobile centralisée et cohérence des sources natives vérifiées par les contrôles du projet.

## Contrôle Android et limites de stabilité

L’émulateur permet d’ouvrir Profil, Services, Recherche et une réservation existante. Sur ce détail, le tracé routier est visible et les extrémités sont compactes. Aucun point de récupération ni nouvelle réservation n’a été soumis : cela ne certifie pas à lui seul toute la règle des 100 mètres.

L’accueil présente aussi un modal existant de prise en charge en retard. Seule l’option locale « Attendre » a été utilisée pour le fermer, sans relancer ni modifier la demande. Retour ensuite vers Profil. Les captures restent dans les artefacts locaux et ne sont pas intégrées à ce document, car elles contiennent des données de compte.

Le binaire Android installé est **1.0.18 / 176**, avec le JavaScript courant fourni par Metro. Il ne prouve pas la validité des dernières modifications natives. Aucun test complet de veille, redémarrage système, voix, autorisation plein écran, consommation mémoire du processus mobile, chauffe ou batterie n’a été réalisé. Aucun iPhone physique n’a été utilisé.

La saturation mémoire du poste et les arrêts volontaires des lanceurs d’audit ne sont pas des crashs du backend. Son endpoint de santé répond encore HTTP 200 au dernier contrôle. L’absence d’échec sur 38 GET ne démontre pas une stabilité sur plusieurs heures.

## Changements techniques effectivement appliqués pendant l’audit

- `scripts/audits/run-platform-audit.cjs` : lanceurs locaux avec environnement minimal, logs séparés, concurrence limitée pour Node/Vitest et durée maximale de 20 minutes. Modes de types distincts de la transpilation d’exécution ; aucune compilation de livraison ni déploiement.
- `scripts/audits/probe-platform-readonly.cjs` : 24 GET bornés sur l’API locale, métriques sans corps ni jeton enregistré.
- `scripts/audits/probe-service-quote-actions.cjs` : reproduction déterministe de l’action doublée et du dossier périmé, avec mutations simulées. Ce probe est un outil d’observation, pas un test de non-régression réussi.
- `scripts/audits/run-isolated-e2e.cjs` : activation explicite de suites SQL supplémentaires et mode d’exécution PostgreSQL en transpilation seule. Le contrôle complet des types reste séparé ; ce mode ne remplace pas un contrôle de livraison.
- `tests/helpers/bookingBackendFixture.cjs` : dépôt réel `Booking` enregistré dans le module de test pour préserver l’intercepteur actuel ; dix scénarios revalidés.
- `tests/integration/authOtpLocal.cjs` : schéma utilisateur synthétique complété, migration réelle de réservation d’identité téléphonique appliquée à la base jetable, logs d’erreur de fixture activés ; six scénarios revalidés.

Comportements préservés : aucun changement de prix, commission, éligibilité, KYC, OTP, paiement, contrôle d’accès métier, trajet ou notification en production. Aucun contournement de la règle de proximité. Les fichiers de l’application et du backend n’ont pas été corrigés à l’occasion de ce rapport.

Vérification des scripts/fixtures modifiés : ESLint ciblé réussi. Les recettes mentionnées ci-dessus ont été réexécutées après correction de leurs fixtures ; les autres échecs restent explicitement ouverts.

## Reproduction et artefacts

Exécuter les suites longues **une à une**, après avoir libéré des ressources ; ne pas lancer tous les modes simultanément sur le poste de développement. Les modes PostgreSQL nécessitent le chemin explicite des binaires locaux et créent leurs propres bases temporaires. Les scripts s’appuient sur les projets frères et leurs dépendances installées.

```powershell
node scripts/audits/run-isolated-e2e.cjs release
node scripts/audits/run-platform-audit.cjs mobile
node scripts/audits/run-platform-audit.cjs admin
node scripts/audits/run-platform-audit.cjs partner
node scripts/audits/run-platform-audit.cjs web
node scripts/audits/run-platform-audit.cjs backend-types
node scripts/audits/run-platform-audit.cjs backend-production-types
node scripts/audits/run-isolated-e2e.cjs auth 'C:/Program Files/PostgreSQL/18/bin'
node scripts/audits/run-isolated-e2e.cjs booking 'C:/Program Files/PostgreSQL/18/bin'
node scripts/audits/run-isolated-e2e.cjs credits 'C:/Program Files/PostgreSQL/18/bin'
node scripts/audits/run-platform-audit.cjs commerce 'C:/Program Files/PostgreSQL/18/bin'
node scripts/audits/probe-service-quote-actions.cjs
node scripts/benchmark-driver-route.cjs
```

Les probes connectés nécessitent un runtime de développement authentifié dirigé vers l’API locale. Ne pas les rediriger vers la production ni copier des jetons dans un terminal.

Principaux artefacts locaux de cette session :

- `.expo/isolated-e2e-2026-11-27-release.log`
- `.expo/platform-audit-2026-11-27-mobile.log` et `mobile-tail.log`
- `.expo/platform-audit-2026-11-27-{admin,partner,web,backend-types,backend-production-types}.log`
- `.expo/isolated-e2e-2026-11-27-auth-schema.log`
- `.expo/isolated-e2e-2026-11-27-booking-fixture.log`
- `.expo/isolated-e2e-2026-11-27-credits-fixture.log`
- `.expo/platform-audit-2026-11-27-commerce.log`
- `.expo/isolated-e2e-2026-11-27-postgres-runtime-audit.log`
- `.expo/isolated-e2e-2026-11-27-sequential-probe-audit.log`
- `.expo/platform-readonly-2026-11-27.json`

Ces artefacts sont locaux, non assimilables à une archive de CI publiée. Les relances peuvent remplacer les fichiers datés ; archiver les preuves utiles avant une nouvelle campagne. Ne pas publier les captures de compte ou les logs bruts sans contrôle de confidentialité.

## Plan de sortie avant déploiement

1. **Rétablir une base de tests fiable :** A1/A3, types des fixtures backend, harnais React admin, contrats commerce et abonnement du relais. Ajouter les suites manquantes aux contrôles obligatoires de CI. Exiger un bilan complet, sans exclusions critiques involontaires.
2. **Corriger les risques mobiles reproduits :** verrou des actions de devis et invalidation des données devenues interdites. Ajouter des tests double appui, réponse perdue, changement de session et erreur 403.
3. **Réduire et mesurer les relectures :** réponse compacte d’activité conducteur, tags de cache ciblés, réconciliation de publication ciblée. Comparer les volumes et requêtes avant/après sur un jeu de données stable.
4. **Achever la recette de trajet sur une base dédiée autorisée :** demande immédiate et programmée, conducteur ciblé, négociation, refus/timeout/relais, changement de conducteur, publication, réservation multiple, références et proximité, embarquement, dépose, notifications passager, paiement et fin de trajet. Inclure concurrence, perte réseau et répétition des actions.
5. **Vérifier les paiements sans argent réel :** jetons, prestataire en sandbox, cash de secours, avertissement/pénalité/désactivation différée, paiement incertain, rapprochement, remboursement de crédit et changements d’échéancier. Contrôler les écritures et l’absence de double débit, pas seulement les messages d’interface.
6. **Recetter admin, partenaire et site dans un navigateur :** catalogue, prix et marges privées, documents, offres et contrats, échéanciers, flottes et versements, rôles, filtres/exports et pages publiques. Vérifier aussi les nouvelles compilations de production.
7. **Construire puis tester les versions natives actuelles sur Android et iOS physiques :** permissions refusées/révoquées, GPS désactivé, veille prolongée, appel externe, reprise d’application, notifications ouvertes/ignorées, voix, plein écran Android, grandes polices et mémoire limitée. Ne pas utiliser le build 176 comme certification des correctifs natifs récents.
8. **Recette d’exploitation isolée :** chaîne complète des migrations sur copie anonymisée, reprise après redémarrage backend/Redis, outbox et tâches différées, charge concurrente réaliste et test prolongé. Mesurer latences p50/p95/p99, erreurs, pool SQL, files, mémoire, CPU et intégrité financière sur un banc dédié.

Le présent rapport fournit des preuves et une liste d’actions ; il ne certifie ni l’absence de tous les défauts, ni un audit de sécurité offensif, ni la capacité de production de la plateforme.
