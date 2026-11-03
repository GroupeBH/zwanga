# Correctifs de l’audit global — 3 novembre 2026

## Périmètre et état

Suite de [l’audit initial](AUDIT_GLOBAL_2026-11-03.md) des dépôts mobile `zwanga`
et serveur `zwanga-backend`. Les corrections sont locales, sans déploiement,
sans consultation de secrets et sans modification de compte, de paiement ou de
base de production. Les résultats de l’audit restent un instantané **avant** ces corrections.

| Constat | Traitement effectué | Limite restante |
| --- | --- | --- |
| A01 — boucle du reçu conducteur | Abonnement booléen et régression avec React réel | Pas de validation sur iPhone physique |
| A02 — perte d’alerte sur panne de validation | Verdict distinct, pause réversible, reprises bornées et capacité fournie par REST | Sans confirmation serveur, pas de nouvelle autorisation sonore |
| A03 — restauration silencieuse bloquée | Expiration sonore séparée de l’accès au détail | La décision métier reste vérifiée par le serveur |
| A04 — vérification FlexPay désactivable | Interdiction hors tests, au démarrage et à l’exécution | Vérifier la configuration avant déploiement |
| A05 — Pods iOS incohérents | Diagnostic rejoué ; aucun lock fabriqué manuellement | Résolution CocoaPods sur macOS puis archive indispensables |
| A06 — tests et types en régression | Fixtures corrigées, nouveaux cas de régression et suites rejouées | Les intégrations non activées restent ignorées, pas validées |
| A07 — attente sous verrou Android et rendus inutiles | Attentes de publication hors verrou, abonnement ciblé du coordinateur | Pas de mesure Perfetto/ANR sur appareils physiques |
| A08 — dépendances modérées/faibles | Pas de changement forcé de version majeure | Mise à niveau compatible à traiter séparément ; constat non résolu |

## Corrections effectivement appliquées

### Panneaux et rendu

- `features/driver-navigation/DriverDropoffReceipts.tsx` observe désormais
  `useHasRideOverlay()` au lieu de l’objet complet du panneau. Les nouvelles
  références JSX d’un reçu ne déclenchent plus le cycle rendu → publication → rendu
  reproduit lors de l’audit.
- `features/navigation/RideOverlayProvider.tsx` expose un accès au store sans
  abonnement à son contenu. `components/ActiveRideResumeCoordinator.tsx` l’utilise
  tout en conservant son abonnement booléen à l’occupation : les changements de
  priorité restent détectés, sans réagir à chaque modification du contenu du panneau.
- `tests/driverReceiptsReact.test.js` monte les vrais composants de reçu,
  `RideModal` et store avec React 19/StrictMode, puis ouvre, met à jour, ferme et
  masque le panneau. Les primitives React Native sont simulées : ce test démontre
  la stabilité du rendu JavaScript, pas l’absence de crash natif.
- Les règles de notation après paiement confirmé, de proposition de fin de course,
  de priorité paiement/SOS et de non-empilement des panneaux sont conservées.

### Reprise des alertes et secours REST

- `services/rideRingValidation.ts` distingue autorisation, refus explicite,
  indisponibilité temporaire et échéance sonore expirée. Un timeout, une erreur
  réseau ou une capacité absente ne constitue plus un refus. Les nouveaux
  publieurs conservent leur interface booléenne et restent fermés par défaut.
- `services/rideAlertSession.ts` sépare la suspension sonore de l’acquittement
  d’une décision. Une alerte suspendue reste un candidat silencieux pour la
  navigation, pas pour la voix ou le lecteur sonore. Un secours REST peut enrichir
  une alerte connue avec sa capacité manquante, sans modifier son délai ni lever
  la suspension avant vérification.
- `services/rideAlertRevalidation.ts` mutualise les reprises à l’entrée et à la
  reconnexion : au plus trois essais par séquence, attente de 3 puis 6 secondes,
  vérification HTTP bornée à 3 secondes et simultanéité limitée par le validateur.
  La sortie de l’application, le démontage et le changement de session empêchent
  un résultat tardif de relancer le son. Aucune boucle de polling permanente n’est ajoutée.
- `hooks/notifications/useRideRinging.ts` conserve la carte sur indisponibilité
  de vérification et réessaie de façon bornée. Une carte dont seule la fenêtre
  sonore est passée peut être restaurée comme entrée silencieuse. La reprise du
  lecteur iOS ne dépend pas d’une énumération native qui resterait bloquée.
- `hooks/notifications/useRideRealtime.ts` utilise le même coordinateur de
  vérification. Les événements terminaux recherchent aussi les alertes suspendues
  et les transferts en attente afin de ne pas laisser une ancienne offre active.
- Côté serveur, `src/notifications/notifications.service.ts` enrichit les copies
  retournées par la boîte de notifications authentifiée avec la capacité courte
  utilisée pour le push. Celle-ci est liée à la notification et au destinataire,
  n’est pas persistée et n’est pas renouvelée au-delà de l’échéance originale,
  y compris si le transport indiquait une échéance plus courte.
- Conservés : contrôle d’appartenance, déduplication, exclusion de sa propre
  demande, offre expirée/annulée, acceptation/refus serveur, silence des réponses
  passager dans l’application et absence de prolongation automatique du son.

Tests concernés : `tests/rideRingValidation.test.js`,
`tests/rideAlertRevalidation.test.js`, reprise iOS/Android, restauration d’entrée
et événements temps réel ; backend `src/notifications/ride-ring-permit.spec.ts`.

### Paiements et sécurité

`zwanga-backend/src/payments/payments.service.ts` refuse le démarrage si la
vérification fournisseur FlexPay est explicitement désactivée hors environnement
de test. La méthode de contrôle impose également cette vérification lorsqu’un
service est instancié sans les hooks de démarrage Nest. Les tests couvrent
production, développement, environnement non renseigné et configuration de test.

Cette mesure suit la revue `security-best-practices` : le statut déclaré dans un
callback public n’est pas une preuve de paiement. Les contrôles déjà obligatoires
pour les recharges et retraits, l’idempotence, les transactions et les preuves
PawaPay restent inchangés. Aucun tarif, solde ou règlement réel n’est modifié.

### Android natif et banc d’essai

- `native/android/notifications/RideCardDelivery.java` et son miroir dans
  `android/app/src/main/java/com/zwanga/notifications/` déplacent les deux attentes
  de visibilité de la carte hors du verrou global. Propriétaire, génération et
  bail de publication sont revérifiés avant le secours et la finalisation.
- Le garde « carte publiée avant son », les limites temporelles et la protection
  contre les doublons sont conservés. Des appels système brefs restent présents
  sous verrou : cette correction n’est pas une garantie d’absence d’ANR.
- `tests/nativeAlertAuditFixes.test.js` interdit par contrôle de source les attentes
  actives et `awaitPosted` sous ce verrou. Il ne mesure pas le thread principal.
- Les scripts `scripts/audits/test-native-ride-delivery.cjs` et
  `test-ride-audio-service.cjs` utilisent `local-ring-validation.cjs` : un serveur
  de verdict synthétique en loopback, servi par un worker pour ne pas être bloqué
  par les commandes ADB synchrones. Le tunnel est retiré et le worker terminé en sortie.
- `tests/android/ride-alert-harness/build.gradle`, `NativeCardProbe.java` et le
  README du banc ajoutent un mode **opt-in** `-PauditLoopbackValidation`. Seul ce
  banc peut configurer l’URL synthétique `127.0.0.1`. L’accès réseau et le HTTP local
  concernent uniquement ce paquet de test, pas le manifeste de production. Ce
  n’est pas une isolation réseau imposée par Android, ni un serveur d’autorisation réel.

### Fiabilité de la validation automatique

Les tests mobiles d’entrée, navigation, reçus et temps réel ont été alignés sur
les exports effectivement utilisés. Les fixtures iOS contiennent une capacité
synthétique et un serveur simulé. `tests/fixtures/sourceExtractions.json` actualise
seulement les deux empreintes OTP relues ; aucune vérification OTP n’est supprimée.

Dans le backend, les fixtures des suites activité, administration, authentification,
migrations, finances, notifications, paiements, notation, boutique, demandes,
trajets, utilisateurs et portefeuille ont reçu des signatures de mocks et des
types partiels explicites. Les trois aides `test/available-request-flow.ts`,
`test/home-discovery-postgres.ts` et `test/map-driver-priority-flow.ts` contrôlent
leurs résultats optionnels. Aucun contrôle TypeScript global n’est désactivé.
Les seules autres modifications de sources exécutables sont des annotations de
types dans `src/notifications/android-driver-backup.ts` et
`src/trip-requests/request-search-map.ts` ; elles ne modifient ni SQL ni payload.

## Vérifications réalisées

Les campagnes se recouvrent : leurs nombres ne représentent pas une couverture unique.
Les premiers essais ont révélé des mocks devenus incomplets ; ils ont été corrigés
avant les nouvelles exécutions complètes. Les traces de ces échecs intermédiaires
restent sous `.expo/` et ne sont pas présentées comme des validations réussies.

| Contrôle | Résultat final observé | Portée |
| --- | --- | --- |
| TypeScript backend, tests inclus | Réussi, code de sortie 0 | Vérification sans émission, pas de déploiement |
| Suite backend globale | 275 suites réussies ; 3 379 tests réussis, 755 ignorés, aucun échec ; code de sortie 0 | Intégrations opt-in distinctes |
| Garde mobile complète | Réussie, code de sortie 0 ; 3 173 tests réussis, aucun échec, 1 ignoré (Ruby indisponible) | TypeScript, lint, frontières réseau, taille, parité native et tests ; pas une compilation native |
| Intégrations PostgreSQL isolées | 174 tests réussis dans 4 suites, aucun échec/ignoré, code de sortie 0 | 6 paiements/socket/REST, 127 dispatch, 29 changement de conducteur, 12 boutique |
| Compilation Android du banc | Réussie, sans puis avec le mode loopback | Sources natives et Notifee ; pas AAB release Zwanga |
| Présentation native, émulateur API 36 | 19 scénarios/assertions réussis, plus une entrée descriptive de périmètre | Demandes proches, offres de dispatch et réservations ; transport simulé |
| Audio natif, même émulateur | 11 scénarios réussis | État du lecteur, pas mesure acoustique |
| Diagnostic iOS local | Échec confirmé : Pods Crashlytics et Didit 4.9.1 absents/incompatibles | Résolution sur macOS nécessaire |
| `git diff --check`, deux dépôts | Réussi | Les avertissements CRLF/LF ne constituent pas des erreurs de contenu |

Les essais Android comprennent refus/indisponibilité du validateur, plein écran
avec permission système, carte seule sans cette permission, réveil, doublons,
expiration, secours WorkManager, notification audible concurrente, interruptions
audio, veille puis déverrouillage, transfert au premier plan et arrêt à la décision.
Ce sont des tests de `com.zwanga.audit`, pas des vrais envois FCM/APNs à des comptes.

Les intégrations SQL emploient des clusters PostgreSQL/PostGIS temporaires en
loopback, sans chargement de `.env` ni base existante. Les précautions du guide
`supabase-postgres-best-practices` sont suivies ; aucun service Supabase ni migration
de production n’est utilisé. Les fournisseurs de paiement et de push sont simulés.

Traces locales non versionnées : `.expo/fixes-release-final-20261103.log`,
`fixes-backend-final-20261103.json`, `fixes-backend-typescript-final2-20261103.log`,
`fixes-integration-20261103.json`, `fixes-native-build-20261103.log`,
`fixes-native-delivery-20261103/native-matrix.json` et
`fixes-native-audio-20261103/results.json`.

## Conditions avant livraison et limites

1. Livrer le contrat backend de validation/restauration avant le mobile dépendant
   de la capacité. Vérifier que la vérification fournisseur est activée : le nouveau
   garde bloque volontairement un démarrage avec sa désactivation hors tests.
2. Le changement Java nécessite une nouvelle build Android ; une mise à jour
   JavaScript seule ne le déploie pas. Le banc n’est pas un test de l’AAB final.
3. Sur macOS, résoudre les Pods, conserver le lock réellement généré, relancer le
   diagnostic puis produire et tester une archive iOS. Ce travail n’est pas effectué
   sous Windows. Aucun contournement de la validation de build n’est ajouté.
4. Les vulnérabilités modérées/faibles relevées dans l’audit ne sont pas corrigées
   par cette intervention. Aucun `npm audit fix --force` ni changement majeur non
   validé n’est appliqué ; les chiffres de l’audit restent un instantané antérieur.
5. Restent nécessaires : essais iPhone et Android physiques avec vrais push,
   réseau instable/Doze, vérification visuelle et acoustique, traces Perfetto/ANR et
   contrôles des artefacts release. Aucun gain chiffré de fluidité ni disparition
   de crashs/chauffe n’est annoncé à partir des seuls tests locaux.
