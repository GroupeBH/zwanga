# Notation de l'application depuis le profil

Date : 23 septembre 2026. Périmètre : profil mobile iOS et Android.
Ce document remplace le comportement initial du 22 septembre (lien externe).
Les sollicitations automatiques après trajet restent décrites dans
[Notation native après trajet](NATIVE_STORE_REVIEW.md).

## Problème et solution appliquée

Le bouton « Noter l’application » ouvrait la fiche du store, alors que
l'utilisateur souhaite noter sans quitter Zwanga. Il demande désormais la
fenêtre native avec `expo-store-review`, déjà installé pour les sollicitations
automatiques. Aucun lien externe, navigateur, WebView ni fallback HTTPS.

Le bouton vérifie la disponibilité native uniquement après un appui, puis
appelle `requestReview()`. Une absence du module ou une indisponibilité détectée
affiche un message français, sans quitter l'application. Une erreur technique
est remplacée par une invitation à réessayer. Si l'API se termine sans afficher
la fenêtre, aucun faux message d'échec ou de publication n'est affiché.

## Fichiers concernés

- `hooks/useStoreReview.ts` : remplace `Linking.openURL` par le chargement natif
  protégé, le contrôle de disponibilité et la demande d'avis. Le hook n'utilise
  plus les URLs du manifeste ; il reste inactif tant que personne n'appuie.
- `features/store-review/nativeReview.ts` : adaptateur partagé avec la notation
  automatique. Vérifie les méthodes du module natif AVANT d'importer le SDK
  (compatibilité avec les anciens binaires). Une promesse commune dédoublonne
  les appels natifs simultanés, y compris entre consommateurs et remontages.
  Le verrou est libéré après résolution ou rejet, sans timer récurrent.
- `components/profile/ProfileStoreReviewButton.tsx` : sous-titre « Donner votre
  avis sans quitter Zwanga », chevron à la place de l'icône de lien externe,
  indication d'accessibilité et état de chargement conservés.
- `utils/storeReview.ts` : ancien utilitaire de construction et d'ouverture des
  liens supprimé, ses seuls consommateurs étant le hook remplacé et ses tests.
- `tests/storeReview.test.js`, `tests/nativeStoreReviewRepository.test.js` :
  scénarios natifs et dédoublonnage partagé. Les métadonnées des stores dans
  `app.config.js` restent inchangées et sont toujours vérifiées sans lire `.env`.

## Comportements conservés et protections

- Aucun changement aux avis conducteur/passager, paiements, reçu cash ou backend.
- Aucun polling, requête HTTP, appel GPS ou nouvel abonnement natif ajouté.
  L'activité de l'écran est lue via le hook partagé existant.
- Double appui verrouillé dès le premier clic, y compris pendant le chargement
  du module et la vérification de disponibilité.
- Focus, génération d'opération, montage, état natif `AppState` et occupation du
  registre des overlays sont revérifiés après chaque attente avant présentation.
  Une réponse obsolète ne présente pas de fenêtre ni d'erreur par-dessus un autre écran.
- La perte de focus remet l'indicateur à zéro sans libérer prématurément une
  opération encore en attente. Aucune réouverture automatique au retour.
- La protection partagée couvre la promesse native, pas toute la durée visuelle
  du dialogue : iOS n'expose pas d'événement fiable de fermeture à cette API.
- Les sollicitations AUTOMATIQUES gardent leurs compteurs par rôle, seuils
  1/10/20 puis dizaines, quota de trois tentatives sur 365 jours et trace AsyncStorage.
  Le bouton volontaire n'avance ni ne remet à zéro ces compteurs et ne consomme
  pas leur quota local ; il constitue une action explicite, pas une sollicitation
  automatique. Les limites propres au store s'appliquent néanmoins à tous les appels.
- Sur le Web, l'entrée est masquée. Sur mobile, la disponibilité est contrôlée
  au clic pour éviter une vérification native à chaque affichage du profil.
- Aucun faux accusé « Avis publié », pas de filtrage de satisfaction, pas de
  formulaire local se substituant aux avis Apple/Google.

## Limites natives et déploiement

Apple et Google peuvent ne rien afficher, même si l'API est disponible et son
appel résolu. Zwanga ne peut ni forcer la fenêtre, ni connaître la note ou sa
publication. Le choix d'un bouton natif est celui demandé par l'utilisateur :
la documentation Expo déconseille ce déclenchement précisément parce que
l'affichage n'est pas garanti. Aucun contournement par lien n'est conservé.
Voir [Expo StoreReview, SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/storereview/).

Le module natif `ExpoStoreReview` doit être inclus dans les builds iOS/Android.
Un ancien binaire recevant uniquement le JavaScript reste protégé mais ne peut
pas afficher cette fenêtre. Si le module installé lors de l'étape précédente
est déjà intégré au binaire, ce correctif n'ajoute aucune dépendance native.
TestFlight n'autorise pas la demande réelle ; Google Play applique également
ses conditions d'installation, de compte et de quota.

## Vérifications réalisées

- **51/51 tests ciblés réussis** : profil, bouton natif, seuils/quota automatique,
  reçu cash, veille/reprise, démontage, disponibilité, erreurs et dédoublonnage.
  Les SDK, le rendu natif et les cycles de vie sont simulés dans ces tests.
- Frontières réseau : réussi, aucun HTTP direct ajouté hors RTK Query.
- Contrôle global des tailles : 889 sources ; seule l'exception préexistante
  `app/wallet.tsx` (414 lignes) dépasse 400. Les fichiers de cette intervention
  restent en dessous de 400 lignes.
- TypeScript et ESLint ciblé : résultats consignés dans le journal des changements.
- La suite complète n'a pas été relancée pour ce correctif ciblé ; les résultats
  de l'intervention précédente restent historiques, pas une nouvelle validation.

Aucun build, déploiement, avis réel, essai sur appareil physique ni mesure de
stabilité native effectué ici. Recette restante : bouton depuis le profil sur
iPhone/Android, fermeture du dialogue, double appui, changement d'onglet/veille
pendant l'attente, ancien binaire, appareil sans capacité native, grandes polices
et VoiceOver/TalkBack. Ne pas automatiser la publication de vrais avis.
