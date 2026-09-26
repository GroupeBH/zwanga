# Statut passager et activation conducteur

Date : 24 septembre 2026. Périmètre : application mobile et `zwanga-backend`.

## Problème constaté et causes vérifiées

Une inscription explicitement passager pouvait devenir conducteur. Ce n'était
pas uniquement un problème de libellé dans le profil :

- Le formulaire mobile envoyait `isDriver` sous forme de chaîne dans un multipart.
  Avec la conversion implicite du `ValidationPipe`, `"false"` devenait `true`.
  Ce comportement a été reproduit localement avec le DTO réel.
- Le résolveur serveur acceptait `role`, `isDriver` ou la présence d'un véhicule
  comme motifs concurrents de promotion.
- L'ajout de véhicule, certaines synchronisations d'identité et la publication
  pouvaient normaliser le compte vers conducteur sans contrôler l'ensemble du parcours.
- La mise à jour ordinaire du profil permettait d'envoyer directement `role: driver`.
- Plusieurs écrans mobiles interprétaient `isDriver: true` comme une autorisation,
  même lorsque le rôle renvoyé était passager.
- Des sauvegardes complètes du compte lors des connexions, changements de PIN et
  mises à jour FCM pouvaient réécrire une ancienne valeur du rôle en concurrence.

## Règle appliquée

`role` est l'autorité serveur pour le statut du compte. `isDriver` reste présent
pour compatibilité ; il n'est plus une autre manière d'accorder ce statut.
La contrainte PostgreSQL historique rôle/drapeau est conservée.

| Situation | Résultat |
| --- | --- |
| Inscription Passager | Passager, aucune intention conducteur enregistrée |
| Inscription Conducteur | Passager en préparation, intention conducteur enregistrée |
| Identité approuvée seule | Ne rend pas conducteur |
| Véhicule seul | Ne rend pas conducteur |
| Identité approuvée et véhicule, sans intention explicite | Reste passager |
| Intention explicite + dernière identité approuvée + véhicule actif appartenant au compte | Activation conducteur |
| Compte suspendu, désactivé ou administratif | Pas d'activation par ces parcours |

Le rôle dans une réservation reste distinct : un conducteur peut réserver et
voyager comme passager. Les droits pendant un trajet continuent de dépendre de
la réservation et des participants, et non du seul statut conducteur du compte.

## Backend : une transition centralisée

Fichiers principaux :

- `src/users/driver-activation.ts` : conditions, activation transactionnelle,
  contrôle des nouvelles opérations conducteur sans promotion implicite.
- `src/users/driver-boolean.transform.ts`, `src/auth/dto/auth.dto.ts` : lecture du
  booléen brut pour les anciens clients. Seuls les booléens et les chaînes
  `"true"` / `"false"` sont acceptés ; les autres valeurs non nulles sont rejetées.
- `src/users/user-role.policy.ts`, `src/auth/auth.service.ts` : inscriptions
  téléphone, Google et Apple initialement passager. Les données contradictoires
  Passager + indicateur conducteur/véhicule sont refusées avant la création.
- `src/users/users.controller.ts` et `users.service.ts` : deux mutations
  authentifiées, sans rôle fourni dans leur corps :
  - `POST /users/driver-onboarding` enregistre la demande et active si tout est prêt ;
  - `POST /users/driver-activation` exige tous les prérequis ou renvoie une erreur.
- `src/users/didit-kyc.service.ts`, l'ancien upload d'identité et
  `src/admin/admin.service.ts` : une approbation peut terminer un parcours déjà
  demandé ; elle ne crée pas l'intention à la place de l'utilisateur.
- `src/vehicles/vehicles.service.ts` : réévaluation après sauvegarde effective
  du véhicule, y compris sa réactivation ; aucune promotion par simple possession.
- `src/trips/trips.service.ts`, `src/trip-requests/trip-requests.service.ts` :
  publication, démarrage et offre conducteur vérifient les prérequis en lecture.
  Réservations, encaissements, historiques et actions des trajets en cours ne
  sont pas convertis en nouveaux parcours d'activation.
- Les décisions dans les abonnements, notifications d'engagement et sélection
  de conducteurs utilisent le rôle. Le calcul administratif « conducteur qualifié »
  n'utilise plus le drapeau comme autorité.

Compatibilité : un ancien client qui envoie `PUT /users/me {role: driver}` passe
par la même activation contrôlée, dans la transaction de mise à jour du profil.
Un simple enregistrement de profil sans rôle ne demande jamais l'activation.
Un ancien envoi `role: passenger` ne rétrograde pas un conducteur.

L'activation verrouille d'abord la ligne utilisateur, puis vérifie le dernier
dossier d'identité (date de création, identifiant pour départager) et l'existence
d'un véhicule actif de ce propriétaire. Seuls l'identifiant et le statut du
dossier sont lus, pas ses photos/métadonnées. L'activation répétée est idempotente.
Les écritures d'authentification, de profil et FCM sont partielles pour ne pas
écraser les colonnes de rôle avec une ancienne copie du compte.

Les recommandations de la compétence PostgreSQL ont guidé les horodatages
`timestamptz`, les transactions courtes et l'ordre de verrouillage. Aucun appel
réseau n'a été ajouté dans la transaction d'activation. La contention réelle
n'a pas été mesurée sur PostgreSQL ; les tests utilisent des dépôts simulés.

## Application mobile

- `utils/accountRole.ts` unifie les décisions. Seul `role: driver` (ou l'ancien
  `both` côté client) indique un compte conducteur. L'identité, les véhicules,
  le trajet courant et le drapeau contradictoire ne changent plus cette décision.
- Cette règle est utilisée dans profil, accueil, recherche, demandes, publication,
  revenus/portefeuille, abonnements et sélection de l'onglet Services.
- `hooks/auth/useRegistrationActions.ts` transmet le choix `role`, plus de
  deuxième indicateur `isDriver`. Le parcours d'inscription conducteur continue
  de recueillir les informations de véhicule et de lancer la vérification.
- `hooks/profile/useProfileOnboarding.ts` enregistre d'abord l'intention via RTK
  Query. Le bouton de vérification d'identité seul reste accessible au passager
  et ne lance pas le parcours conducteur. Une identité déjà approuvée est réutilisée.
- `app/edit-profile.tsx` ne transmet plus de rôle et ne propose plus de bascule
  directe. Son lien ouvre le véritable parcours « Devenir conducteur ».
- `store/api/user/syncAccountRole.ts` exploite les réponses déjà reçues : profil,
  mise à jour, demande d'activation. Aucun nouveau polling ni coordinateur global.
  Le compte et la génération de session sont vérifiés ; une réponse datée plus
  ancienne que le profil courant est ignorée.
- `store/slices/authSlice.ts` dérive le drapeau du rôle, ignore la mise à jour
  d'un autre compte et préserve une activation serveur face à un ancien jeton
  d'inscription. Les autres informations du compte ne sont pas effacées.

Aucun changement de carte, GPS, modal de trajet ou réglage natif de navigation.
La stabilité native et la chauffe n'ont pas été mesurées pendant cette intervention.

## Migration et déploiement

Migration ajoutée, **non exécutée** :
`1780000043000-AddExplicitDriverActivation.ts`, enregistrée dans l'index backend.
Elle ajoute deux colonnes nullables à `users` : `driverOnboardingRequestedAt` et
`driverActivatedAt`. Aucun compte existant n'est promu, rétrogradé ou backfillé.
Le retour arrière de cette migration est volontairement bloqué pour ne pas
effacer les traces : en cas de repli, conserver les colonnes et revoir la version
applicative déployée avec attention (un ancien backend réintroduirait les promotions).

Ordre prévu :

1. Résoudre les erreurs de compilation backend actuellement signalées dans
   `src/payments/pawapay.service.ts`, indépendantes de ces changements.
2. Vérifier toutes les migrations en attente et sauvegarder la base. Le dépôt
   contient aussi les migrations Services et PawaPay : ne pas lancer une commande
   globale de migration sans avoir validé ce lot.
3. Appliquer la migration additive, puis déployer le backend corrigé sur toutes
   les instances. Une ancienne instance encore active pourrait conserver l'ancien comportement.
4. Tester les parcours ci-dessous en recette, puis publier le mobile.

Le nouveau mobile dépend des nouveaux endpoints pour démarrer le parcours
conducteur. Il ne contourne pas leur absence par un changement local de rôle.
Les anciens comptes conducteurs restent tels quels, mais les nouvelles opérations
conducteur exigent bien une identité approuvée et un véhicule actif.

## Comptes historiques : audit, pas de rétrogradation aveugle

L'ancienne migration `1780000028000-EnforceUserDriverRoleConsistency.ts` pouvait
promouvoir les passagers possédant un véhicule ou le drapeau. Elle n'est pas
réécrite : certaines bases l'ont déjà exécutée. Une absence de date d'activation
ne prouve donc pas qu'un conducteur historique est illégitime.

Exemple d'audit agrégé **en lecture seule**, à exécuter après migration dans un
environnement autorisé ; il n'a pas été exécuté ici et ne révèle aucune identité :

```sql
SELECT role,
       COUNT(*) AS comptes,
       COUNT(*) FILTER (
         WHERE "isDriver" IS DISTINCT FROM (role = 'driver')
       ) AS incoherences_drapeau,
       COUNT(*) FILTER (
         WHERE role = 'driver' AND "driverActivatedAt" IS NULL
       ) AS conducteurs_historiques_sans_nouvelle_trace
FROM users
GROUP BY role;
```

Pour les comptes déjà devenus conducteurs par erreur, vérifier individuellement
l'intention, les justificatifs, véhicules et trajets en cours avant toute
régularisation. Ne supprimer ni revenus, ni réservations, ni historique.
Aucune régularisation de production n'a été effectuée.

## Vérifications et limites

- TypeScript mobile : valide ; garde-fous réseau et taille valides
  (933 sources, aucune au-dessus de 400 lignes).
- Dernier passage ciblé mobile après les protections contre les réponses tardives :
  71/71 tests réussis (rôles, profil, onglets, recherche et sessions).
- Suite mobile complète : 948 réussites sur 950. Restent deux comparaisons
  historiques d'empreintes dans `sourceExtractions.test.js` : styles des
  réservations et anciens endpoints PIN. Les nouvelles empreintes d'activation
  et de synchronisation du rôle ont été mises à jour séparément et vérifiées ;
  les différences PIN/styles antérieures n'ont pas été masquées.
- Backend : 153 tests ciblés réussis sur dix suites (inscriptions des trois
  fournisseurs, booléens réels du ValidationPipe, activation, Didit, véhicules,
  trajets, qualifications administratives, PIN, échange OAuth, flux des services
  profil/approbation administrative, anciens PUT et migration additive).
- Compilation globale backend de production : échoue sur les types nullables
  de `pawapay.service.ts`, fichier hors de ce périmètre. La vérification incluant
  tous les tests a également signalé des typages préexistants de fixtures hors lot.
- `git diff --check` : valide dans les deux dépôts.
- Pas de migration réelle, de validation de verrous concurrents sur PostgreSQL,
  de déploiement, d'appel aux fournisseurs d'identité ni d'essai iOS/Android physique.

Recette restante : inscription Passager sur téléphone/Google/Apple ; vérification
d'identité d'un passager sans véhicule ; ajout de véhicule sans intention ;
parcours conducteur avec identité en attente/refusée/approuvée ; confirmation
administrative et Didit ; publication et réservation ensuite ; double clic,
réseau lent, déconnexion/reconnexion pendant la réponse ; historique conducteur
et conducteur voyageant comme passager.
