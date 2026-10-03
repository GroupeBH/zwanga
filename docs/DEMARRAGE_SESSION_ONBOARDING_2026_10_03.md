# Démarrage : session prioritaire et introduction raccourcie

Date : 3 octobre 2026. Périmètre : démarrage mobile, restauration d’authentification,
écran de bienvenue et anciennes routes de présentation.

## Problèmes identifiés

- Le splash lisait `hasSeenOnboarding` et `hasSeenBackgroundLocationDisclosure`
  avant de donner priorité à une session déjà restaurée. Des indicateurs absents
  imposaient de nouveau des écrans publics ; une erreur AsyncStorage envoyait
  vers `/auth-entry`, même avec une session valide.
- Les erreurs temporaires SecureStore pouvaient être converties en jetons absents
  puis mises en cache. L’initialisation retournait alors un état déconnecté.
  Cette possibilité a été reproduite avec un stockage natif simulé, **pas constatée
  directement sur les appareils de production**.
- La présentation initiale enchaînait trois diapositives, un écran d’information
  sur la localisation et le choix connexion/inscription avant le formulaire.
- Le garde global traitait le segment initial vide comme une route privée, et
  pouvait aussi concurrencer le traitement de la page d’authentification/KYC.

## Solutions appliquées

### Session et navigation

`ReduxProvider` attend la fin effective de `initializeAuth().unwrap()` avant de
monter les routes et les coordinateurs. La lecture de démarrage SecureStore est
stricte : une erreur ne signifie pas « utilisateur déconnecté », ne vide pas les
jetons et n’est pas mémorisée comme une lecture vide. Le chargement affiche alors
une explication et **Réessayer**, avec reprise automatique au prochain retour au
premier plan. Les lectures usuelles des jetons conservent leur contrat nullable.

La racine et les anciennes routes `splash`, `onboarding` et
`background-location-disclosure` utilisent la même redirection : session récupérable
restaurée → `/(tabs)` ; sinon → `/auth-entry`. Les anciens indicateurs de présentation
ne participent plus à cette décision. Leurs anciennes valeurs ne sont pas supprimées.

Les écrans connexion/inscription ne sont pas rendus pour une session déjà valide :
redirection déclarative à la place. Une étape KYC déjà engagée sur `/auth` reste
accessible ; le garde global n’impose plus une redirection concurrente. Les routes
privées restent protégées par le mécanisme existant. Le chargement de restauration
ne se relance pas à chaque retour du premier plan après une initialisation réussie.

L’ouverture ordinaire à froid conduit à l’accueil. Un détail ouvert par notification
ou lien reste géré par les flux existants. Un simple retour au premier plan ne
réinitialise pas arbitrairement une navigation de trajet ou un formulaire en cours.

### Première utilisation

Un seul écran regroupe présentation courte, **Créer un compte**, **Se connecter**,
information sur la localisation en arrière-plan pendant un trajet et lien légal.
Les diapositives, le bouton Suivant et la page d’information intermédiaire ne sont
plus imposés. Les anciennes routes restent compatibles grâce à leur redirection.

Le skill `frontend-skill` a guidé une composition sobre blanc/orange, des actions
fixes dans la zone sûre et une copie plus courte. Les éléments secondaires se
réduisent sur petits écrans/grandes polices ; le contenu peut défiler si nécessaire
sans tronquer le texte. Les doubles appuis sont bloqués jusqu’au changement d’écran,
et le retour depuis le formulaire réactive les actions.

L’information sur la position n’est **pas** une autorisation système. Les demandes
GPS, le refus possible et l’explication contextuelle conducteur durant le trajet
restent inchangés. Aucune permission n’est accordée ou demandée depuis le nouvel
écran de bienvenue. Les étapes OTP/PIN, les formulaires de création de compte,
le contrôle d’identité et les exigences conducteur ne sont pas supprimés.

## Fichiers concernés

- `services/tokenStorage.ts`, `store/slices/authSlice.ts` : lecture stricte de
  démarrage, cache après succès seulement et remontée de l’échec sans suppression.
- `hooks/auth/useAuthBootstrap.ts`, `components/ReduxProvider.tsx` : état de
  restauration, attente réelle, réessai manuel/premier plan et écran d’erreur.
- `features/auth/StartupRedirect.tsx`, `app/index.tsx`, `app/splash.tsx`,
  `app/onboarding.tsx`, `app/background-location-disclosure.tsx` : destination
  unique priorisant la session.
- `features/auth/AuthWelcome.tsx`, `app/auth-entry.tsx` : introduction et accès
  direct au formulaire, sans lecture AsyncStorage de présentation.
- `app/auth.tsx`, `hooks/auth/useAuthController.ts`, `components/AuthGuard.tsx` :
  pas de formulaire connecté visible, segment initial public, exception KYC.
- Tests ajoutés : `tests/startupSession.test.js`, `tests/authWelcome.test.js`.
  Simulations existantes adaptées : `authKeyboardLayout.test.js`,
  `authSubmissionLoading.test.js`, `authThunkLifecycle.test.js`.
- `scripts/preview-auth-welcome.cjs` : aperçu des vrais composants via React Native
  Web ; sorties ignorées dans `.expo/auth-welcome-preview/`.

## Préservation des comportements et validation

Les refresh tokens expirés ou refusés par le serveur imposent toujours une
reconnexion. Un jeton d’accès expiré est renouvelé selon le service existant ;
une panne réseau transitoire préserve le contexte récupérable, mais n’autorise
jamais l’envoi HTTP avec un jeton d’accès expiré. Les protections contre les réponses
tardives après déconnexion/changement de compte restent en place. Aucun rôle ni
aucune identité serveur n’est créé à partir d’un simple indicateur d’onboarding.

Vérifications réalisées :

- **129 tests JavaScript réussis** couvrant démarrage, bienvenue, session,
  refresh, concurrence entre initialisation/déconnexion, retour Android,
  OTP/PIN et chargement d’authentification, KYC, cache des requêtes authentifiées,
  parrainage, notifications, assistance et session GPS conducteur.
- Scénario de session valide simulée : deux lectures natives de jetons, puis cache ;
  aucun appel de renouvellement pendant l’initialisation. Ce n’est pas une mesure
  de latence ni une absence de requêtes de l’écran d’accueil après montage.
- TypeScript `tsc --noEmit --incremental false` : réussi.
- ESLint ciblé : aucune erreur ; un avertissement préexistant sur les dépendances
  de l’effet Apple dans `hooks/auth/useAuthController.ts`, hors modification de cet effet.
- Contrôles réseau et taille : réussis, 997 sources et aucune au-dessus de 400 lignes.
- `git diff --check` : réussi, avertissements de normalisation CRLF/LF seulement.
- Capture navigateur inspectée à 360 × 760 et 320 × 568, avec marges de 24 px en
  haut/bas simulant la zone sûre : aucun débordement horizontal ; actions et texte
  de localisation visibles sans recouvrement dans ces deux cas. Le routage natif
  et les icônes sont simulés ; le logo et le composant sont ceux de l’application.

Limites : pas d’essai physique iOS/Android, ni de mesure de crash, batterie ou chauffe.
À vérifier sur téléphone : relancement après fermeture complète avec session valide,
verrouillage/déverrouillage, accès expiré hors ligne puis retour réseau, déconnexion
réelle, nouvelle installation, grandes polices, notification vers un trajet et
permissions GPS avant suivi. Aucun backend modifié, dépendance ajoutée, changement
de `.env`, build natif ou déploiement effectué. Les modifications concurrentes
hors périmètre sont conservées.

Commande de régression :

```text
node --test --test-concurrency=2 tests/startupSession.test.js tests/authWelcome.test.js tests/authNavigationSession.test.js tests/authThunkLifecycle.test.js tests/sessionRenewal.test.js tests/homeBackNavigation.test.js tests/authSubmissionLoading.test.js tests/authKeyboardLayout.test.js tests/authenticatedQueryLifecycle.test.js tests/referralAttributionPolicy.test.js tests/notificationNavigation.test.js tests/navigationAssistance.test.js tests/driverBackgroundSession.test.js
```
