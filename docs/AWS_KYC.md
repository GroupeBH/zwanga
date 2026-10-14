# Parcours KYC AWS — bascule du 13 octobre 2026

## Correctif Android Amplify et préparation serveur

Liveness Android passe de 1.5.0 à 1.6.0 (correctif 16 Ko) et ses dépendances
passent à LiteRT 1.4.0. Le plugin met aussi à jour un projet natif existant ;
les packages Swift et l'authentification Zwanga ne changent pas. Pas de Cognito,
de nouvel utilisateur AWS mobile ni de clé permanente. Le garde natif reste actif.
Un serveur en préparation fournit un code limité et un message sans boucle de
réessai ; aucun repli vers Didit ni approbation depuis le téléphone.

La préparation Terraform gère désormais les paramètres AWS_KYC_* et leurs
références ECS, sans activer la capture avant recette. Pour les commandes, les
tests physiques et le retour arrière, voir
`../zwanga-backend/docs/operations/aws-kyc-amplify-rollout-2026-10-13.md`.
Un nouveau build natif Android est nécessaire ; une OTA ne remplace pas les ELF.
Sur le poste Windows utilisé, la compilation locale reste bloquée par l'outillage
hôte Hermes (`nmake` absent), après résolution des téléchargements AndroidX.
Utiliser un nouveau build EAS pour la recette ; ne pas désactiver le garde 16 Ko.

## Bascule complète préparée

AWS est désormais le défaut pour les nouveaux bundles ; les profils EAS `dev`,
`dev-device` et `production` fixent `EXPO_PUBLIC_KYC_PROVIDER=aws`. Supprimer une
ancienne valeur locale explicite `didit` ou la remplacer pour tester en local.
Le sélecteur explicite `didit` reste uniquement un mécanisme de retour arrière,
sans repli implicite. L'ancien flag booléen ne peut plus réactiver Didit.

Le profil propose de reprendre sur AWS les dossiers Didit pending (passager et
parcours conducteur), sans refaire un KYC approuvé ni remplacer une revue legacy.
Le backend doit avoir `AWS_KYC_ENABLED=true` et `KYC_PROVIDER=aws` après IAM/recette.
Il reste seul décisionnaire : un serveur en coexistence peut refuser cette reprise.

Les anciens binaires sans le pont AWS exigent une mise à jour pour un **nouveau**
KYC. Les comptes déjà approuvés restent opérationnels. Le backend arrête les
nouvelles sessions Didit avec le message `KYC_APP_UPDATE_REQUIRED`, mais garde
les sync/webhooks historiques. Les dépendances Didit ne sont pas arrachées du
binaire dans cette livraison ; elles ne sont pas lancées en mode AWS.
`diditErrors.ts` reconnaît maintenant ce code ; les anciens binaires dont le
présentateur masque les messages serveur afficheront encore une erreur générique
jusqu'à leur mise à jour. Aucune promesse de modifier leur écran à distance.

Pas d'activation AWS/SSM, de build EAS distant ou de publication store exécutée.
Pour IAM, environnement local, SSM et ordre de livraison :
`../zwanga-backend/docs/auth/aws-kyc.md` (section Bascule complète).

Vérifications finales de cette bascule : 66 tests mobiles ciblés, 1 915 tests
de la suite complète, TypeScript et frontière réseau réussis. Les deux échecs
intermittents initiaux de reprise de trajets ne se reproduisent pas isolément
ni lors de la seconde suite complète. Voir le journal pour les limites natives :
compilation Android bloquée par des HTTP 404 Google Maven, iOS non compilé et
aucun essai caméra réel. Ne pas confondre ces tests JavaScript avec une recette native.

## Historique du sélecteur avant la bascule

Pièces de RDC : carte d’électeur, passeport, permis. Envoi de photos privées,
consentement explicite, capture vidéo AWS Liveness et suivi du contrôle serveur.
Le fournisseur est choisi par **`EXPO_PUBLIC_KYC_PROVIDER=didit|aws`** dans
l’environnement mobile. **Le défaut Didit décrit ci-dessous est historique et
remplacé par AWS dans la bascule ci-dessus.**
Aucune variable réelle, configuration EAS distante ou infrastructure AWS n’a été
modifiée pendant cette livraison.

| Configuration du bundle mobile | Parcours |
| --- | --- |
| `EXPO_PUBLIC_KYC_PROVIDER=didit` | Didit directement, sans requête de capacités AWS |
| `EXPO_PUBLIC_KYC_PROVIDER=aws` | AWS seulement, après confirmation des capacités serveur et présence du pont natif |
| Variable absente/vide | Ancien flag `EXPO_PUBLIC_AWS_KYC_ENABLED=true` reconnu ; sinon Didit |
| Valeur autre que `didit` / `aws` | Message de configuration incorrecte au lancement KYC, aucun appel fournisseur |

Le choix explicite est prioritaire sur l’ancien flag, y compris pour revenir à
Didit. Les espaces et la casse sont normalisés. Une activation du backend seul
ne fait pas basculer une application réglée sur Didit.

**AWS choisi ne retombe plus silencieusement sur Didit**, même en cas de backend
ancien (404), désactivé ou non configuré. L’app présente alors une erreur sans
créer de session chez un autre fournisseur. Les erreurs réseau/authentification
restent distinguées. Cette règle s’applique aussi à l’ancien flag lorsqu’il
sélectionne AWS. Les deux intégrations sont conservées.

## Implémentation

- `features/identity/kycProvider.ts` : choix explicite du fournisseur, partagé par
  `useDiditKycFlow`, la reprise depuis le profil et l’entrée du provider AWS.
  Le nom historique `useDiditKycFlow` est conservé pour ses consommateurs ; il
  aiguille désormais explicitement les deux parcours. Une erreur AWS n’est plus
  comptée comme une erreur Didit dans les événements analytics.
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

Dans le dossier **`zwanga`**, ajouter une seule des deux configurations à `.env`
ou `.env.local` existant, sans remplacer les autres variables :

```dotenv
EXPO_PUBLIC_KYC_PROVIDER=aws
```

Pour revenir à Didit : `EXPO_PUBLIC_KYC_PROVIDER=didit`.
Le modèle [.env.kyc.example](../.env.kyc.example) n’est pas chargé automatiquement.
En développement, recharger complètement l’application après le changement.
Pour un build EAS, fournir la variable dans l’environnement utilisé par son
profil (`development` / `production` selon `eas.json` actuel).
La valeur est intégrée au bundle JavaScript par Expo ; ce n’est pas un réglage
serveur à distance. Modifier un `.env` ne change pas les applications déjà
installées. Voir [les variables d’environnement Expo](https://docs.expo.dev/guides/environment-variables/).

La partie native est indispensable : une mise à jour JavaScript seule ne suffit
pas. Les anciens binaires restent sur Didit ; ne pas envoyer ce code JS par OTA
à un binaire dépourvu du pont. L’app affiche une demande de nouvelle version si
AWS est choisi mais que le module natif est absent.

Après installation des dépendances habituelles, si les projets natifs existent :

```sh
node scripts/configure-aws-liveness.cjs
node --test tests/kycProvider.test.js tests/awsKyc.test.js
```

Android : compiler une nouvelle version native (`expo run:android` ou Gradle).
iOS : résoudre les packages Swift dans `ios/zwanga.xcworkspace`, installer les
pods si nécessaire, puis compiler sous macOS/Xcode. L’intégration Swift utilise
le protocole `AWSTemporaryCredentials` officiel. Ne pas ajouter d’utilisateur
Cognito public ni de clé AWS permanente.

Le backend doit avoir sa migration appliquée, le rôle STS de capture, les droits
Rekognition/Textract et le stockage privé. Après recette native, choisir
`EXPO_PUBLIC_KYC_PROVIDER=aws` lors de la génération du bundle mobile et
`AWS_KYC_ENABLED=true` côté backend. Les identifiants AWS et les clés Didit restent
côté serveur : **aucune clé privée dans une variable `EXPO_PUBLIC_*`**.
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

Après l’ajout du sélecteur explicite : 63 tests JavaScript ciblés exécutés
avec succès (sélection du fournisseur, AWS KYC, profil, navigation des
notifications), dont le hook réel sur les parcours Didit et AWS avec transports
simulés, priorité des variables, erreur de configuration, serveur AWS désactivé,
404, panne réseau, absence du module natif, revue manuelle et annulation.
L’idempotence de la configuration Android/Xcode est aussi vérifiée. TypeScript et la
frontière réseau RTK Query sont également vérifiés. Ce résultat
ne prouve pas le fonctionnement de la caméra, des permissions ou du streaming.
La compilation Android initiale n’avait pas abouti : téléchargements impossibles
depuis Google/Maven. Nouvel essai le 13 octobre avec
`:app:compileDebugKotlin --offline` : le sandbox bloque d’abord le wrapper Gradle ;
la relance autorisée hors sandbox utilise le cache mais échoue sur des dépendances
AndroidX/Compose/Hermes absentes. Le module Kotlin n’est donc pas déclaré compilé.
Il faut relancer cette compilation avec accès aux dépôts, sans remplacer les
dépôts officiels par des miroirs non vérifiés. La compilation iOS n’est pas
exécutée sur le PC Windows. Aucun appel AWS facturé
ni déploiement n’a été réalisé. Recette sur appareils physiques obligatoire :
documents réels consentis, conditions lumineuses, capture annulée, arrière-plan,
réseau lent/perdu, refus caméra, reprise, expiration, double appui et changement
de compte. Les contrôles automatiques ne prouvent pas l’authenticité d’une pièce.

Configuration backend et IAM : `zwanga-backend/docs/auth/aws-kyc.md`.
