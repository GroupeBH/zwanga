# QR de parrainage — 2 octobre 2026

## Demande et périmètre

Permettre aux utilisateurs de générer un QR code attaché à leur lien de parrainage.
L’espace Parrainage proposait le partage du lien et l’invitation des contacts, mais
pas de code à faire scanner ou à envoyer comme image.

Le backend existant fournit déjà `ReferralSummary.shareLink` via `/referrals/me`.
Lecture du contrat et du générateur ChottuLink dans le backend local uniquement :
aucune modification de serveur, de base de données, de configuration ou des commissions.

## Solution appliquée

- `app/referrals.tsx` et `features/referrals/ReferralQrAction.tsx` ajoutent un bouton
  explicite « Mon QR code » sous les actions de partage existantes. Le clavier est
  fermé lors de l’ouverture. L’accès reste **Profil → Parrainage → Mon QR code**.
- `hooks/referrals/useReferralQr.ts` réutilise le résumé déjà chargé. Une relecture
  RTK Query n’est demandée que si son lien manque ou n’est pas exploitable. Pas de
  nouvel appel au chargement de l’écran ni de requête vers un générateur d’images tiers.
- `features/referrals/referralQrModel.ts` encode l’URL HTTPS renvoyée par le serveur,
  paramètres d’attribution compris. Il refuse les identifiants bruts, les schémas
  non HTTPS, les URL contenant des identifiants de connexion et les liens de plus
  de 512 caractères. Aucun lien d’inscription n’est inventé côté client.
- `ReferralQrModal.tsx` et `ReferralQr.styles.ts` proposent une feuille sobre avec
  marque Zwanga, QR noir sur fond blanc, code de parrainage lisible, partage et copie.
  Aucun logo ne masque les modules du QR. Une marge blanche d’au moins quatre modules
  est conservée ; correction d’erreur M. La taille tient compte de la largeur, de la
  hauteur, des zones sûres et de l’agrandissement des polices. Les actions restent
  séparées du contenu défilant pour les contraintes d’accessibilité et très petits écrans.
- La présentation réutilise `RideModal` en overlay applicatif, afin de ne pas empiler
  un contrôleur modal UIKit devant la feuille native de partage. Fermeture explicite,
  retour système et échappement d’accessibilité restent disponibles. L’apparition en
  fondu est courte et respecte la préférence de réduction des animations à l’ouverture.
- `utils/shareReferralQr.ts` exporte le QR en PNG 1 024 × 1 024 puis ouvre la feuille
  native avec les types PNG Android/iOS. Les modules d’export sont chargés à la demande.
  Aucune permission de caméra, de contacts ou de photothèque n’est nécessaire au QR.
  Sur le web, l’aperçu est disponible et l’action partage le lien plutôt qu’un fichier natif.

Le skill frontend a guidé la hiérarchie autour du QR, la réduction du texte, l’accent
orange unique et les boutons explicites. Un premier aperçu coupait le contenu sur
petit écran : titre et texte ont été raccourcis et la taille du QR adaptée avant validation.

## Précautions et comportements conservés

- Le QR et le bouton de partage existant utilisent la même invitation serveur.
  Scannez-le avec l’appareil photo ou un lecteur de QR du téléphone destinataire ;
  aucun nouveau scanner n’est ajouté à Zwanga.
- Les règles ChottuLink, l’attribution différée, la récupération du parrainage,
  les invitations des contacts, commissions et retraits sont inchangés. Le bon
  déroulement après installation dépend toujours du fournisseur et des réglages
  de liens déjà en place ; il n’est pas garanti par le seul décodage du QR.
- Pas de fausse réussite : chargement, erreur avec réessai, échec de partage et
  copie confirmée ont des états distincts. Les erreurs natives affichées sont en français.
- Un verrou synchrone bloque les doubles appuis lors du chargement et du partage.
  Les réponses tardives après fermeture, changement d’écran ou de compte sont ignorées.
  L’export vérifie aussi la version de session avant de lancer le partage natif.
- Un PNG de cache immuable par URL est réutilisé pour éviter une accumulation à
  chaque appui. Le nom contient une empreinte du lien, pas le code ni une identité.
  Le fichier partagé est conservé dans le cache pour les applications qui le lisent
  après fermeture de la feuille ; il n’est pas enregistré automatiquement dans la
  galerie. Le système peut évincer ce cache. Un nouveau fichier non partagé est
  supprimé si la préparation est annulée après son écriture.
- Aucun journal n’imprime le lien personnel, son token ou les données de l’utilisateur.
  Les autres changements déjà présents dans le workspace sont conservés.

## Dépendances et livraison

`package.json` et `package-lock.json` ajoutent :

- `react-native-qrcode-svg` 6.3.26, générateur QR JavaScript ;
- `react-native-svg` 15.12.1 et `expo-sharing` 14.0.8, versions correspondant au
  catalogue local du SDK Expo 54 installé ;
- `jsqr` 1.4.0 en **dépendance de développement uniquement**, pour le décodage indépendant
  des QR de test, non importé par le code applicatif.

Installation effectuée sans scripts npm. Un avertissement de dépendance transitive
dépréciée `text-encoding` est émis par le générateur ; aucune mise à niveau globale
ni correction automatique des autres dépendances n’a été lancée.

**Livrer un nouveau binaire iOS et Android** avec les modules natifs autolinkés.
Une simple actualisation JavaScript/OTA ne suffit pas pour les anciens binaires.
Sur iOS, l’installation des pods/build reste à effectuer sur macOS ou par EAS.
La version applicative n’a pas été incrémentée dans cette intervention.

Références consultées : [générateur QR](https://github.com/Expensify/react-native-qrcode-svg),
[partage Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/sharing/),
[stockage local Expo](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem-legacy/)
et [décodeur de test jsQR](https://github.com/cozmo/jsQR).

## Vérifications réalisées

- **58 tests Node réussis** : `referralQr.test.js`, `referralQrShare.test.js`,
  `referralQrModal.test.js`, attribution existante et `profileModules.test.js`.
  Le script `npm run test:referrals` inclut les trois nouveaux fichiers et les
  tests existants d’attribution. Les 58 incluent les tests du profil lancés en plus.
- Génération réelle par le moteur utilisé par le composant et décodage indépendant
  par jsQR sur des pixels synthétiques : lien court, paramètres d’attribution et
  caractères encodés retrouvés à l’identique. Pas de scan avec une caméra physique.
- Tests de cache, échec réseau/lien absent, réessai, double appui, fermeture,
  navigation, changement de compte/session, verrou de partage, copie, types PNG,
  timeout d’export, image invalide et alternative web. Les appels natifs et API sont simulés.
- `scripts/preview-referral-qr.cjs` rend le vrai composant via React Native Web,
  avec pont SVG de prévisualisation et lien fictif. Aperçu inspecté dans Chrome
  headless à **360 × 760 et 320 × 568** : aucun débordement horizontal, QR non recouvert
  et boutons visibles. Les deux QR de la capture finale ont également été décodés
  correctement. Ce rendu navigateur n’est pas une validation Android/iOS.
- TypeScript `--noEmit --incremental false`, ESLint ciblé, frontière réseau et
  contrôle de taille réussis : **991 sources, aucune au-dessus de 400 lignes**.

## À vérifier sur appareils réels

Après build : scan depuis un second téléphone, partage vers WhatsApp et Fichiers,
annulation/retour de la feuille, iPad, grandes polices, mode sombre, hors connexion
avec lien déjà chargé, et attribution après installation/inscription. Le PNG partagé
contient le QR lui-même, pas une capture de l’interface avec les boutons.

Aucun build natif, test caméra, appel réel ChottuLink, fichier `.env`, donnée de
production ou publication sur les stores n’a été utilisé pour cette intervention.
