# Reprise de l’authentification et photo de profil

## 6 octobre 2026 — Périmètre et constat

Signalements : après ouverture de WhatsApp pour récupérer un OTP, ou de l’appareil
photo pendant l’inscription, retour au début du parcours / au lancement de Zwanga.

Constats dans le code : les champs et étapes d’authentification vivaient seulement
dans `useState` ; le démarrage sans session allait systématiquement vers l’accueil
de connexion. L’inscription ouvrait une caméra externe avec recadrage natif, alors
que le profil possédait déjà une caméra intégrée sur Android. La recréation de
l’activité/processus est une **hypothèse cohérente**, pas un crash natif reproduit.
[Expo documente cette possibilité pour ImagePicker sur Android](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/#imagepickergetpendingresultasync).

## Solutions appliquées

### Reprise OTP / inscription

- `services/authFlowDraft.ts` : brouillon versionné dans SecureStore, durée de
  reprise de 30 minutes après une écriture, validation des valeurs, écritures et
  suppressions sérialisées, protection contre les anciennes lectures/écritures.
  Données conservées : mode, étape, téléphone, champs du profil et du véhicule,
  URI locale de la photo. Pas de binaire photo dans le stockage sécurisé.
- Aucun chiffre OTP, PIN, confirmation PIN, nouveau PIN, preuve de réinitialisation
  ou token de session Zwanga n’est enregistré dans ce brouillon. Pour le parcours
  social déjà commencé, le jeton d’identité Google/Apple et le nonce Apple restent
  temporairement dans le même stockage sécurisé, sans dépasser leur expiration
  effective pour la reprise. Cela ne crée pas de session et ne prouve pas une
  vérification de téléphone. Les règles serveur restent inchangées.
- `components/ReduxProvider.tsx` restaure le brouillon **avant** le montage du
  navigateur uniquement sans session. Une erreur temporaire de lecture propose
  une nouvelle tentative, sans effacer le brouillon. Une session valide a priorité
  et n’attend pas la lecture du brouillon ; sa présence / son établissement purge
  le contexte d’authentification temporaire.
- `features/auth/StartupRedirect.tsx`, `app/auth-entry.tsx` et
  `hooks/auth/useAuthFormState.ts` reprennent directement l’étape sauvegardée.
  La redirection de reprise n’a lieu qu’avant la première ouverture du formulaire
  dans ce lancement : revenir volontairement à l’accueil ne crée pas de boucle.
  Choisir explicitement un autre mode permet de commencer ce nouveau parcours.
- `hooks/auth/useAuthDraftPersistence.ts` et `useAuthController.ts` sauvegardent
  seulement les champs autorisés ; saisir un chiffre OTP/PIN ne déclenche pas
  d’écriture. Retour au premier plan : nouvelle tentative de sauvegarde, **pas**
  de réinitialisation de formulaire ni de nouvel envoi OTP automatique.
  `app/auth.tsx` avertit si le stockage ne permet pas la reprise.
- Après une véritable destruction du processus, les cases OTP reprennent vides.
  Une inscription classique arrivée au profil reprend au PIN, avec les autres
  champs conservés et une explication visible. Une réinitialisation de PIN reprend
  à l’OTP : sa preuve à usage unique reste volontairement en mémoire seulement.
  Un simple aller-retour WhatsApp sans destruction garde l’état vivant inchangé.
- `usePhoneAuthActions.ts` : après un code refusé/expiré, « Réessayer » vide le
  code mais conserve l’étape OTP et le numéro ; le renvoi existant reste explicite.
  `useAuthFormNavigation.ts` évite qu’une attribution de parrainage chargée tard
  ne change le mode d’un brouillon restauré. Le parrainage conserve son stockage
  et ses règles existants.

### Photo de création / modification du profil

- Nouveau `hooks/profile/useProfilePhotoSelection.ts` partagé : choix de source,
  caméra **dans Zwanga sur Android et iOS**, préparation, aperçu, confirmation,
  reprise/annulation. L’inscription n’appelle pas d’endpoint de profil authentifié.
- Suppression du lancement de caméra externe et du recadrage natif dans ces
  parcours. Galerie conservée, autorisation demandée seulement à son ouverture.
  Réutilisation de `prepareProfilePhoto` : JPEG, bord maximal 1 024 px avant aperçu,
  sans agrandir une petite image. La caméra est détachée avant cette préparation.
- `components/profile/ProfilePhotoCameraCapture.tsx` : capture unique même avant
  le rendu suivant, pas de changement de caméra pendant la capture, démontage
  en arrière-plan et rejet d’une capture devenue obsolète.
- `hooks/auth/useSignupProfileActions.ts` et `components/auth/steps/ProfileStep.tsx` :
  photo locale uniquement après confirmation, état occupé, poursuite désactivée
  pendant la sélection. Récupération du résultat Android en attente seulement sur
  le formulaire photo actif ; après destruction, reprise au profil après le PIN.
- `hooks/useProfilePhoto.ts` : réutilisation du même sélecteur pour le profil,
  les paramètres et la modification ; envoi uniquement après confirmation,
  verrou pendant sélection/envoi, garde de session avant/après la réponse serveur.
  Les écrans inactifs ne récupèrent plus les résultats Android du sélecteur.
- `app/edit-profile.tsx` : le rafraîchissement dû à la photo ne remplace plus les
  champs personnels déjà modifiés ; un autre compte réinitialise ces champs.
  Pas de rafraîchissement supplémentaire après annulation/échec de la photo.

## Conservé et limites

- Connexion automatique à la saisie complète du PIN, états de finalisation,
  vérification OTP côté serveur, expiration serveur des codes, KYC, règles de rôle,
  immatriculation et endpoints d’inscription/profil conservés. Aucun backend ni
  schéma de base modifié pour cette correction. Aucune nouvelle dépendance.
- Un brouillon expiré/invalide n’est pas repris ; sa suppression est effectuée au
  prochain chargement, pas par un minuteur système quand l’app est arrêtée.
  Une URI photo dans le cache natif n’est pas un fichier durable garanti.
- Les erreurs natives de SecureStore sont traitées et signalées ; certaines
  plateformes peuvent refuser des valeurs volumineuses, notamment un contexte
  social. Aucun repli vers un stockage en clair.
  [Contraintes officielles SecureStore](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/).
- Aucun mécanisme JavaScript ne peut empêcher le système de tuer un processus.
  Le correctif permet une reprise à partir du dernier brouillon écrit et réduit
  les sorties vers une application caméra ; il ne prouve pas la disparition de
  tous les crashs, ni une réduction mesurée de mémoire/chauffe.

## Socket / webhook : décision de périmètre

Les sockets existants restent utiles pour le suivi/messagerie au premier plan.
Ils ne remplacent pas APNs/FCM pour réveiller une application suspendue. Un webhook
reçoit un événement côté serveur ; il ne fournit pas à lui seul une position GPS
récente d’un conducteur absent de l’app. Les événements réservation/demande
existent déjà dans NestJS : aucun nouveau webhook ou socket ajouté ici.
[Contraintes iOS d’exécution en arrière-plan](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time).
Le dispositif push et les limites de fraîcheur GPS précédemment documentés dans
[les alertes conducteur](DRIVER_DISPATCH_NOTIFICATIONS.md) restent applicables.

## Vérifications et recette native

Tests ajoutés : `tests/authFlowDraft.test.js`, `tests/profilePhotoSelection.test.js`.
Fixtures adaptées : `vehiclePlate`, `authKeyboardLayout`, `authSubmissionLoading`,
`authWelcome`, `googleAuthFlow`, `pinAutoLogin`.
Les tests exercent les modules TypeScript réels avec stockage, caméra et navigation
simulés : redémarrage d’un module, reprise OTP/social, absence de secrets OTP/PIN,
expiration, courses lecture/suppression, échec du stockage, session prioritaire,
pas d’écriture par chiffre, confirmation/annulation photo, double appui, capture
tardive, changement de compte et conservation des champs édités.

Résultats finaux et limites de validation : voir l’entrée du journal technique
du 6 octobre 2026 « Reprise OTP/WhatsApp et photo de profil ».

Commandes locales :

```powershell
node --test tests/authFlowDraft.test.js tests/profilePhotoSelection.test.js
node --test tests/*.test.js
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-network-boundaries.js
node scripts/check-source-size.cjs
npx expo start --dev-client
```

Ces changements seuls ne nécessitent pas de nouvelle dépendance/module natif :
Camera, ImagePicker, ImageManipulator et SecureStore sont déjà présents, avec les
autorisations caméra Android/iOS déclarées. Utiliser néanmoins un dev build natif
contenant ces modules. Les précédents changements de son/notifications nécessitent
toujours leur nouveau build ; ne pas les confondre avec ce correctif JavaScript.

Recette **à faire** sur appareils réels Android et iOS :

1. Inscription téléphone : demander le code, ouvrir WhatsApp, copier le code,
   revenir. Même numéro/étape ; aucun code renvoyé spontanément. Valider réellement.
2. Refaire le test en verrouillant l’appareil, puis en arrêtant réellement le
   processus en arrière-plan. L’écran de reprise reste l’OTP, cases vides ; un
   démarrage système peut être brièvement visible. Tester également SMS et les
   parcours Google/Apple, avec comptes de test.
3. Réinitialisation du PIN : vérifier OTP, destruction avant le nouveau PIN,
   retour à l’OTP ; pas de réutilisation d’une ancienne preuve.
4. Profil d’inscription : remplir les champs, caméra intégrée avant/arrière,
   reprendre/confirmer/annuler, retour arrière-plan pendant une capture,
   autorisation refusée puis accordée. Refaire via la galerie et, sur Android de
   test, avec « Ne pas conserver les activités » ; rétablir ce réglage après essai.
5. Modification du profil : saisir un champ sans enregistrer, changer la photo,
   vérifier que le champ n’a pas été effacé. Tester annulation, réseau indisponible
   et déconnexion pendant l’envoi ; aucun succès ni changement du nouveau compte.
6. Session valide : fermer/rouvrir → accueil connecté. Vérifier aussi le retour
   volontaire au choix connexion/inscription et un brouillon expiré.

Aucun appareil physique, build, déploiement ou envoi de push réel exécuté pour
cette validation locale. Les modals, permissions et reprises sous pression mémoire
doivent être validés nativement avant publication.
