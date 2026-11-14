# Catégories de conducteurs, inscription et actualisations du guidage

Date : 12 novembre 2026. Périmètre : mobile Zwanga et persistance minimale dans le dépôt voisin `zwanga-backend`. Aucun déploiement ni changement des données de production.

## Catégories déclarées

Deux choix exclusifs sont proposés aux nouvelles inscriptions conducteur : **Conducteur privé** (`private`) et **Taxi / moto-taxi** (`transport`). Aucune valeur n'est présélectionnée. Le choix est obligatoire dans ce nouveau formulaire, mais facultatif dans l'API pour préserver les anciens clients.

Les conducteurs existants peuvent choisir ou modifier cette indication depuis **Profil → Modifier mon profil**. Leur ouverture de session n'est pas bloquée. Un compte historique sans choix reste sans catégorie ; il n'est pas automatiquement classé « privé ». L'indication apparaît sur le profil personnel et sur le profil public du conducteur.

Il s'agit d'une activité déclarée : ce n'est ni une licence professionnelle, ni une approbation KYC, ni un nouveau rôle. Les droits conducteur, vérifications d'identité, véhicules, tarifs, commissions, attribution des commandes, notifications et sonneries restent inchangés. Un compte en parcours conducteur peut renseigner sa catégorie sans être activé. Un passager sans intention conducteur ne peut pas s'attribuer une catégorie par le profil.

### Fichiers mobiles

- `features/profile/driverCategory.ts`, `types/users.ts` : valeurs autorisées, libellés et lecture compatible des anciennes réponses.
- `components/profile/DriverCategoryPicker.tsx` : deux options accessibles, contrôlées et verrouillées pendant l'envoi.
- `components/auth/steps/ProfileStep.tsx`, `app/auth.tsx`, `hooks/auth/useAuthFormState.ts`, `useAuthController.ts`, `useSignupProfileActions.ts`, `useRegistrationActions.ts` : saisie, validation, transmission téléphone/Google/Apple. Le parcours passager n'envoie pas ce champ.
- `services/authFlowDraft.ts` : conservation de la catégorie dans le brouillon d'inscription, sans conserver la case d'annonces.
- `store/api/authApi.ts`, `store/api/user/profileMapper.ts` : contrats et normalisation des réponses.
- `app/edit-profile.tsx` : mise à jour sans modification de rôle ; une actualisation du profil ne remplace pas un choix encore non enregistré.
- `components/profile/ProfileHeader.tsx`, `app/driver/[id].tsx` : indication de l'activité déclarée, distincte du badge d'identité.

### Persistance backend

`src/users/driver-category.ts` valide les deux valeurs et l'intention conducteur. Les DTO de création téléphone/Google/Apple et de modification de profil acceptent le champ facultatif, mais rejettent les valeurs inconnues. `src/auth/auth.service.ts` enregistre la catégorie lors de la création ; une connexion sociale à un compte existant ne la remplace pas. `src/users/users.service.ts` la conserve dans les modifications de profil où elle est omise et la retourne dans le profil public.

`src/users/entities/user.entity.ts` et la migration additive `src/database/migrations/1780000120000-DriverCategory.ts`, enregistrée dans `migrations/index.ts`, ajoutent une colonne `text` nullable et une contrainte autorisant uniquement `NULL`, `private` et `transport`. Pas d'index supplémentaire, de valeur par défaut, ni de réécriture des comptes historiques. La contrainte `NOT VALID` contrôle les nouvelles écritures sans lancer un scan des anciennes lignes. Comme toute modification de table, son acquisition de verrou reste à surveiller lors du déploiement. La migration inverse supprime la colonne et ses choix : ne pas l'utiliser comme retour arrière applicatif ordinaire.

**Ordre de mise en service :** vérifier puis exécuter la migration avec le processus habituel, publier le backend compatible, puis le mobile. L'ancien serveur peut rejeter ce champ inconnu ; le nouveau code serveur nécessite la colonne. Aucune de ces opérations n'a été exécutée pendant cette intervention.

## Case d'annonces à l'inscription

`components/auth/SignupAnnouncementsCheckbox.tsx` ajoute **Me prévenir des mises à jour**, décoché initialement, avec indication de son caractère obligatoire à l'inscription et de sa modification ultérieure dans les paramètres. `hooks/auth/useSignupAnnouncements.ts` garde un choix explicite limité au formulaire courant : changer de numéro, de fournisseur ou de mode l'annule ; revenir ensuite au formulaire précédent ne réactive pas l'ancien choix.

`useSignupProfileActions.ts` et `useRegistrationActions.ts` empêchent la création avant cette sélection, y compris sur les parcours Google/Apple. Après une création réussie, la finalisation enregistre l'intention via le service d'annonces existant. En cas d'échec de stockage local, la reprise finalise le compte déjà créé sans refaire son POST. Le choix n'est pas présumé à partir de la préférence d'une autre session, et un brouillon repris doit le confirmer de nouveau.

Cette case n'accorde **pas** la permission système Android/iOS, et ne garantit pas la livraison d'un push. La demande de permission existante après inscription et le mécanisme d'enregistrement des installations sont conservés. Aucun nouvel envoi SMS/push réel et aucune nouvelle donnée de consentement serveur n'ont été ajoutés. L'obligation est celle du nouveau formulaire mobile, pas une interdiction imposée aux anciens clients par le backend.

## Actualisations répétées dans le guidage conducteur

Deux causes ont été identifiées dans le code :

- Chaque événement socket de proximité relançait la lecture du trajet et de ses réservations, même sans changement métier.
- Après un refus de finalisation automatique, l'invalidation du cache et un nouveau point GPS pouvaient relancer immédiatement la même mutation. Le test a reproduit **50 tentatives pour 50 actualisations** avant le correctif ; après correction, il n'en produit qu'une dans la fenêtre de 30 secondes. Une fin déjà confirmée pouvait aussi être soumise deux fois tant que le cache affichait encore « ongoing ».

`features/driver-navigation/progressRefresh.ts` regroupe les événements métier sur une seconde, n'autorise qu'une lecture en cours et conserve une lecture différée si un autre changement survient pendant celle-ci. Les événements de proximité restent transmis aux panneaux/annonces, mais ne déclenchent plus cette double lecture REST. `hooks/driver-navigation/useDriverTrackingSocket.ts` libère le regroupement à la sortie de l'écran. Le suivi GPS, les événements socket, les contrôles manuels et le polling de secours existant restent actifs.

`hooks/driver-navigation/useDriverCompletionActions.ts` borne les nouvelles tentatives automatiques à une par 30 secondes, garde un verrou de succès jusqu'au changement de trajet et ignore les anciennes réponses pour l'affichage. Une réussite reçue après fermeture de l'écran arrête toujours le suivi GPS du trajet concerné, sans rouvrir un panneau ni parler sur un autre écran. Les seuils métier et la réconciliation des réponses ambiguës sont conservés.

Ce correctif n'est pas une preuve que toute source possible d'actualisation visuelle sur appareil a disparu. Aucun changement des lecteurs audio, de Notifee, du dispatch backend ou des permissions natives n'a été effectué.

## Vérifications et limites

- Tests JavaScript ciblés : inscriptions téléphone/Google/Apple, case non cochée, conservation de la préférence, reprise après échec de stockage sans double création, catégories et mapping de profil, brouillons, édition des anciens comptes et préservation des droits. Trois passages réussis de 114, 79 et 37 tests, avec recouvrement : ces totaux ne s'additionnent pas.
- Régressions de navigation : regroupement/échec/reprise REST, notifications de proximité conservées, sortie d'écran, callback tardif, absence de répétition après réussite et délai de reprise après échec. Les tests utilisent des horloges et transports simulés, pas une mesure de charge en production.
- Backend : compilation TypeScript sans émission réussie ; campagne finale ciblée réussie, **94 tests sur quatre suites**, incluant profil public et connexion sociale à un compte déjà inscrit sans écrasement de sa catégorie.
- Case d'annonces : six tests complémentaires réussis, dont un rendu avec le vrai réconciliateur React en StrictMode, 30 actualisations et changement aller-retour de formulaire ; pas de boucle de rendu ni de réactivation implicite du choix dans ce scénario. Ce test ne rend pas de composants natifs iOS/Android.
- Contrôle global mobile `node scripts/check-release.cjs` terminé avec code de sortie **0** : parité des sources natives, TypeScript, ESLint, frontières réseau et limite de taille passent ; **3 769 tests réussis sur 3 770, zéro échec, un test ignoré**. La campagne inclut les tests de notifications et de paiements existants. Les fichiers ajustés après le début de la campagne ont aussi été revérifiés par les tests ciblés et ESLint, sans erreur.
- Aucun essai physique Android/iPhone, compilation native, migration sur PostgreSQL réel, appel aux fournisseurs OAuth, envoi réel d'annonce ou déploiement. Les tests serveur utilisent les vrais services/DTO avec dépôts simulés ; ils ne remplacent pas une recette API/base de données ni une validation native.

Tests principaux : `authSubmissionLoading.test.js`, `signupPreferences.test.js`, `authFlowDraft.test.js`, `auditScreenReliability.test.js`, `tripCompletionPresentation.test.js`, `driverTrackingPolling.test.js`, `driverProgressRefresh.test.js` ; backend `src/users/driver-category.spec.ts`, `driver-onboarding-flows.spec.ts`, `user-gender.spec.ts` et `src/auth/registration-compatibility.spec.ts`.
