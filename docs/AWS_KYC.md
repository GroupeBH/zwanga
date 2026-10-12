# Parcours KYC AWS — 11 octobre 2026

Pièces de RDC : carte d’électeur, passeport, permis. Envoi de photos privées,
consentement explicite, capture vidéo AWS Liveness et suivi du contrôle serveur.
**Parcours actuellement actif dans l’application : Didit.** Le verrou mobile
`EXPO_PUBLIC_AWS_KYC_ENABLED` est désactivé par défaut (variable absente ou autre
valeur que `true`). Dans ce cas, aucun appel à
`GET /users/kyc/aws/capabilities` n’est effectué : une activation du backend seul
ne fait pas basculer l’application vers AWS.

Pour une activation ultérieure, ce verrou mobile et le flag backend doivent tous
deux être activés. Ancien backend (404) ou flag serveur désactivé : Didit conservé.
Après activation mobile, une erreur serveur autre que 404 est remontée sans
tentative Didit payante automatique.

## Implémentation

- `features/identity/kycProvider.ts` : choix explicite du fournisseur, partagé par
  `useDiditKycFlow`, la reprise depuis le profil et l’entrée du provider AWS.
  Les parcours AWS et leurs dépendances natives restent présents ; cette
  désactivation concerne leur lancement, pas leur inclusion dans les builds.
- `components/identity/AwsKycProvider.tsx` : parcours global accessible depuis
  inscription, profil, publication et vérification passager. Photographie,
  contrôle des noms, consentement, reprise du dossier, attente et erreurs.
- `store/api/awsKycApi.ts` : réseau via la couche RTK Query existante. Clé
  d’idempotence par tentative ; sondage de statut uniquement au premier plan,
  hors états terminaux. Le statut de réussite vient exclusivement du backend.
- `native/aws-liveness/` : pont Android Kotlin/Compose et iOS Swift/SwiftUI vers
  les composants AWS officiels 1.5.0. Pas d’Expo Go, WebView ni selfie statique
  utilisé comme preuve de présence réelle.
- `plugins/withAwsLiveness.js` : génération Expo reproductible, dépendances
  Android et Swift Package Manager (Amplify Swift 2.60.2).
- `scripts/configure-aws-liveness.cjs` : enregistrement ciblé dans les dossiers
  natifs suivis en git, sans régénérer les autres réglages Expo.

Les identifiants STS expirent en 15 min et ne permettent que de démarrer la capture
dans la région configurée. Aucun secret permanent dans `.env` mobile. Ils ne sont
pas persistés ; le résultat RTK contenant les credentials est immédiatement
retiré après lecture. Le pont les conserve uniquement en mémoire pendant la
capture. Pas de journalisation/analytics de documents, credentials ou scores.
Les photos locales créées par ce parcours sont supprimées du cache à sa fermeture.

La pièce/selfie de référence est archivée côté backend sans expiration automatique,
avec accès admin audité, conformément au choix produit ; l’utilisateur doit
accepter le texte de consentement. La politique de confidentialité et les
déclarations de données des stores doivent être revues avant publication.

## Compilation / activation

La partie native est indispensable : une mise à jour JavaScript seule ne suffit
pas. Les anciens binaires restent sur Didit ; ne pas envoyer ce code JS par OTA
à un binaire dépourvu du pont. L’app affiche une demande de nouvelle version si
AWS est choisi mais que le module natif est absent.

Après installation des dépendances habituelles, si les projets natifs existent :

```sh
node scripts/configure-aws-liveness.cjs
node --test tests/awsKyc.test.js
```

Android : compiler une nouvelle version native (`expo run:android` ou Gradle).
iOS : résoudre les packages Swift dans `ios/zwanga.xcworkspace`, installer les
pods si nécessaire, puis compiler sous macOS/Xcode. L’intégration Swift utilise
le protocole `AWSTemporaryCredentials` officiel. Ne pas ajouter d’utilisateur
Cognito public ni de clé AWS permanente.

Le backend doit avoir sa migration appliquée, le rôle STS de capture, les droits
Rekognition/Textract et le stockage privé. Pour l’activation future, après recette
native, définir `EXPO_PUBLIC_AWS_KYC_ENABLED=true` lors de la génération du bundle
mobile et `AWS_KYC_ENABLED=true` côté backend. Le flag mobile est public, intégré
au bundle par Expo ; changer uniquement une variable AWS ne le modifie pas.
Pour le moment, laisser le flag mobile absent ou à `false` et conserver Didit.
La région Liveness proposée est `eu-west-1` ; elle peut différer de celle du
serveur et du stockage de preuves.

Le serveur donne `approved` automatiquement quand tous les contrôles sont
concluants (pièce RDC, noms, confiance OCR, validité, Liveness et visage).
Sinon le dossier reste `pending` pour « Vérification complémentaire » ; une
capture Liveness échouée/expirée reste à refaire. L’app ne calcule jamais la décision.

Pour Didit comme pour AWS, après toute nouvelle approbation, manuelle ou automatique, le hook transactionnel
backend active le rôle conducteur si le passager possède déjà un véhicule actif.
Sans véhicule actif, il reste passager avec identité validée. Aucun conducteur
n’est rétrogradé et aucun compte suspendu/désactivé n’est réactivé.

`features/identity/kycDecision.ts` centralise le sondage (5 s pendant traitement,
30 s pendant revue manuelle, arrêté en arrière-plan et après décision). Le composant
`AwsKycProvider` actualise les données de profil après décision. `NotificationHandler`
invalide les caches KYC/profil après un push et `utils/notificationNavigation.ts`
ouvre le profil depuis la notification. La synchronisation de rôle existante relit
`/users/me` : le champ `role` du push n’est jamais une autorisation.

## Vérifications et limites

Après le maintien de Didit par défaut : 55 tests JavaScript ciblés exécutés
avec succès (sélection du fournisseur, AWS KYC, profil, navigation des
notifications), dont un test du hook réel sur le parcours complet Didit sans
appel AWS et l’idempotence de la configuration Android/Xcode. TypeScript et la
frontière réseau RTK Query sont également vérifiés. Ce résultat
ne prouve pas le fonctionnement de la caméra, des permissions ou du streaming.
La compilation Android a été tentée mais n’a pas abouti : téléchargements Gradle
impossibles depuis `dl.google.com` et délai dépassé sur Maven Central (AndroidX,
Hermes et autres dépendances). Le module Kotlin n’est donc pas déclaré compilé.
Il faut relancer cette compilation avec accès aux dépôts, sans remplacer les
dépôts officiels par des miroirs non vérifiés. La compilation iOS n’est pas
exécutée sur le PC Windows. Aucun appel AWS facturé
ni déploiement n’a été réalisé. Recette sur appareils physiques obligatoire :
documents réels consentis, conditions lumineuses, capture annulée, arrière-plan,
réseau lent/perdu, refus caméra, reprise, expiration, double appui et changement
de compte. Les contrôles automatiques ne prouvent pas l’authenticité d’une pièce.

Configuration backend et IAM : `zwanga-backend/docs/auth/aws-kyc.md`.
