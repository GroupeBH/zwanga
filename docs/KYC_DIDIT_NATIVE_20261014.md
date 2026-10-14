# KYC Didit natif — 14 octobre 2026

## Demande et constat

Remettre Didit comme fournisseur par défaut et supprimer le passage au navigateur
pour la vérification d'identité. Le SDK était déjà présent ; le mobile choisissait
AWS par défaut et plusieurs erreurs Didit pouvaient ouvrir un parcours web.
Le dépôt backend préparait aussi un mode hébergé supprimant le token natif.

### Complément : token manquant dans le build de développement

Après rechargement du fournisseur mobile, la capture utilisateur affichait
`KYC_SDK_TOKEN_MISSING`. Les tokens d'accès et de renouvellement Zwanga ne sont
pas le token de session nécessaire au SDK Didit.

Constats locaux : le manifeste servi par Metro cible une API du réseau local ;
`src/config/config.module.ts` du backend charge sa configuration locale ; le mode
Didit configuré y était encore hébergé. `diditSessionLaunch` retire volontairement
le token dans ce mode, contrairement au parcours natif. Le normaliseur mobile
reconnaît déjà les alias camelCase et snake_case : aucun changement de ce contrat
n'est nécessaire pour corriger ce cas.

Correction appliquée : uniquement le paramètre de lancement Didit dans le fichier
local `../zwanga-backend/.env`, aligné sur le mode natif. Aucun autre paramètre,
secret ou réglage distant n'a été modifié. Relecture ciblée concluante et 11 tests
`didit-session-launch` réussis après correction.

Le backend en cours doit être arrêté avec `Ctrl+C`, puis relancé depuis son dossier
avec `npm.cmd run start:dev`. Aucun processus n'a été arrêté ou relancé ici. Retenter
ensuite une fois la vérification depuis le profil. Ce changement de configuration
backend ne demande pas un autre build mobile lorsque le SDK est déjà intégré.
Pas d'appel fournisseur ni de capture physique réalisé pendant le diagnostic.

## Changements appliqués dans les fichiers

- `features/identity/kycProvider.ts` : Didit par défaut, AWS toujours sélectionnable
  explicitement. Une configuration inconnue bloque seulement l'action KYC.
- `eas.json` : profils `dev`, `dev-device` et `production` alignés sur Didit.
  Exemple `.env.kyc.example` et sélection publique dans `.env` local alignés,
  sans modification des autres paramètres ou ajout de secrets.
- `hooks/useDiditKycFlow.ts` : token SDK requis, lancement natif uniquement ; retrait
  de l'initialisation du navigateur, du callback URL et des bascules de secours.
  Un résultat SDK ne remplace jamais une approbation serveur manquante. Le résultat
  encore inconnu affiche « Confirmation en attente », pas une annulation fictive.
- `features/identity/diditSdk.ts` : chargement dynamique conservé, message français
  de mise à jour si le module natif manque, sans navigateur. Paramètres de caméra
  et de langue conservés ; logs SDK toujours désactivés en release.
- `features/identity/diditRecovery.ts` : après expiration native, seule une
  approbation serveur du même dossier Didit permet de continuer. Pas de seconde
  session facturable automatique ni de contournement par une URL.
- `features/identity/diditErrors.ts` et `diditFlowTypes.ts` : retrait des branches,
  types et interprétations devenus inutiles avec la suppression du parcours web.
- `tests/kycProvider.test.js` : tests des vrais modules TypeScript et du hook avec
  SDK, serveur, React et autres entrées/sorties simulés.
- Dépôt voisin : `infra-aws/production.auto.tfvars` prépare maintenant le mode natif
  déjà supporté par le backend. Changement documenté dans `infra-aws/docs/CHANGELOG.md`
  sous `INFRA-2026-10-14-001`. Aucun code métier backend, IAM ou schéma modifié.

## Comportements conservés

- Les identités déjà approuvées sont relues sur le serveur, sans nouveau dossier.
- Le contrôle des noms, le verrou contre les doubles appuis et la libération du
  chargement après annulation ou erreur restent actifs.
- Les refus de caméra, problèmes réseau et limites de tentatives sont expliqués
  en français sans afficher le diagnostic interne en production.
- AWS n'est ni supprimé ni automatiquement invoqué après un échec Didit. Les
  dossiers AWS en cours ne sont pas convertis ou approuvés automatiquement.
- Authentification, OTP, paiement, notifications et usages du navigateur hors KYC
  sont inchangés. Le paquet SDK Didit reste à sa version existante, sans dépendance
  ajoutée ni changement des sources natives.

## Vérifications et limites

Vérifications locales réussies :

- 74 tests ciblés : `kycProvider`, `awsKyc`, `profileModules`, `iosPrivacy`.
- TypeScript sans émission ; ESLint sur les fichiers TypeScript/JavaScript modifiés.
- Contrôles des frontières réseau et de la taille des sources ; diff sans erreur
  d'espacement, y compris les deux fichiers de configuration/documentation backend.
- Suite JavaScript mobile complète réussie :
  `node --test --test-reporter=dot --test-concurrency=4 tests/*.test.js` (sortie 0).
- Backend : `npm.cmd test -- --runInBand --silent didit-session-launch`, 11 tests
  réussis du choix du mode et du contrat de réponse, sans appel à Didit.

Les cas couverts incluent le fournisseur par défaut, AWS explicite, l'absence de
token, le module natif indisponible, l'annulation, les doubles appuis, l'expiration,
la caméra refusée, le réseau indisponible et l'absence de faux succès après le SDK.
La récupération après expiration refuse un autre fournisseur ou un autre dossier.

Aucun appareil physique, build EAS ou déploiement n'a été utilisé pour ces
vérifications. Terraform n'est
pas disponible dans ce shell : aucun `validate`, `plan` ou `apply` exécuté.
Le changement de parcours ne prouve pas que l'ancien problème d'expiration native
après photo est résolu. La validation native reste indispensable avant diffusion.

## Livraison à effectuer séparément

1. Backend : vérifier que `KYC_PROVIDER` sélectionne Didit et que la configuration
   fournisseur existante est utilisable. Ne pas remplacer les clés ou le workflow
   pour masquer un échec. Aucun paramètre distant n'a été lu ou changé ici.
2. Infrastructure : dans le dépôt backend, produire et relire un nouveau plan
   Terraform du dossier `infra-aws`. Appliquer uniquement après revue des effets
   prévus. Le changement de `DIDIT_KYC_LAUNCH_MODE` doit être chargé par de nouvelles
   tâches ECS ; une tâche existante conserve ses paramètres de démarrage.
   Ne pas réutiliser un ancien plan, ni déployer les autres modifications du dépôt
   backend sans les avoir revues.
3. Vérifier que la création authentifiée de session renvoie bien un `sessionToken`
   natif non vide. Cette vérification crée potentiellement une session facturable :
   elle n'a pas été effectuée ici. Ne jamais copier ce token dans les logs.
4. Construire et installer le mobile correspondant, puis effectuer la recette.
   Le SDK natif et son plugin sont déjà présents ; cette modification n'ajoute pas
   de dépendance. Ne pas tester ce parcours dans Expo Go.

Commandes proposées (non exécutées, builds EAS potentiellement facturables) :

```powershell
# Android de développement
npx.cmd eas-cli@latest build --platform android --profile dev
# iPhone physique enregistré pour le développement
npx.cmd eas-cli@latest build --platform ios --profile dev-device
# Après recette, nouveaux binaires de diffusion
npx.cmd eas-cli@latest build --platform all --profile production
```

## Recette sur appareils physiques

- Nouveau compte : depuis le profil, démarrer la vérification, confirmer les noms,
  photographier la pièce et terminer le selfie dans le SDK, sans navigateur.
- Autoriser puis refuser la caméra ; annuler le SDK ; relancer volontairement.
  Vérifier l'absence de bouton bloqué, de double fenêtre et de fermeture de l'app.
- Couper le réseau pendant la capture puis le rétablir : aucune fausse approbation,
  aucun lancement web et aucune création automatique d'un deuxième dossier.
- Compte déjà approuvé : pas de nouvelle capture. Dossier en examen : conserver
  l'attente jusqu'au résultat serveur. Une expiration doit être remontée au support
  avec le code et la version du build, sans token ni photo de pièce dans les logs.
- Réaliser cette recette sur Android et iPhone réels, puis vérifier le profil et
  l'activation conducteur après une approbation serveur.

Référence API : [SDK React Native officiel Didit](https://github.com/didit-protocol/sdk-react-native).
L'implémentation s'appuie sur la version installée, pas sur une mise à niveau du SDK.
