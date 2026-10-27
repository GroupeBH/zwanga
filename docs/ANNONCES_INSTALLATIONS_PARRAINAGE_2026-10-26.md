# Annonces aux installations et reprise du parrainage — 26 octobre 2026

## Problèmes constatés et périmètre

Les jetons push étaient enregistrés après authentification : une personne ayant
ouvert Zwanga sans créer de compte n'était pas joignable par ce mécanisme.
L'inscription consommait également l'invitation de parrainage dès la création du
compte, sans attendre l'accusé de rattachement. Un échec réseau pouvait rester en
attente sans nouvelle tentative tant que la connectivité ne changeait pas.

Modifications préparées dans `zwanga`, `zwanga-backend` et `zwanga-admin`.
Aucun déploiement, aucune modification d'une base existante et aucun envoi réel.
Les correctifs de paiement déjà présents dans ces dépôts sont conservés.

## Solution appliquée

### Application mobile

- Choix facultatif « Me prévenir des mises à jour » avant inscription, dans les
  paramètres et sur la page de mise à jour. La demande native d'autorisation est
  déclenchée seulement par l'activation du choix. Le désabonnement est enregistré
  localement puis synchronisé dès que possible, sans nouveau dialogue système.
- Identifiant aléatoire d'installation et secret dans SecureStore, choix durable
  dans AsyncStorage, sans dépendance au compte. Le secret est ajouté au transport
  public et n'est pas passé dans les arguments Redux de la mutation.
- Synchronisation au premier plan, reprise après reconnexion ou rotation du
  jeton, nouvelles tentatives à une minute si nécessaire, actualisation au plus
  une fois par jour après succès. Requêtes annulables, attente bornée et numéro
  de séquence persistant : une ancienne activation arrivée après un désabonnement
  ne peut pas le remplacer côté serveur.
- Une panne temporaire de récupération du jeton ne vaut pas retrait du choix.
  Le retrait réel de l'autorisation du téléphone désactive l'envoi lors de la
  prochaine synchronisation.
- Consultation publique de la version disponible, y compris avec une session
  expirée. Notice dans l'accueil avant connexion si une version plus récente est
  disponible ; aucun bandeau d'erreur réseau ajouté au home.
- Appui sur une annonce vers `/app-update`, accessible sans compte, avec
  déduplication. Le traitement d'arrière-plan ne duplique pas la carte distante.
  Le slot initial Notifee réservé aux alertes de trajets n'est pas consommé.

Fichiers principaux : `services/installationAnnouncements.ts`,
`hooks/useInstallationUpdates.ts`, `hooks/useUpdateNotificationOpen.ts`,
`store/api/installationUpdatesApi.ts`, `store/api/baseApi.ts`,
`store/api/appUpdatesApi.ts`, `components/InstallationUpdatesCoordinator.tsx`,
`components/UpdateAnnouncementsChoice.tsx`, `components/GuestUpdateNotice.tsx`,
`components/ReduxProvider.tsx`, `components/NotificationHandler.tsx`,
`services/backgroundNotificationTask.ts`, `features/auth/AuthWelcome.tsx`,
`app/settings.tsx`, `app/app-update.tsx`.

### Serveur et administration

- Migration `1780000092000-AnonymousUpdateInstallations` : installations et
  campagnes, index d'audience, unicité de l'empreinte du jeton et clés étrangères.
  La migration doit être appliquée avant le déploiement du serveur modifié.
- Enregistrement public limité en fréquence, authentifié par le secret de
  l'installation. Le serveur conserve son empreinte. La gestion des campagnes
  reste réservée aux administrateurs authentifiés.
- Mode automatique : une version **déclarée disponible dans les stores par
  l'administration existante** alimente la file des annonces. Il n'y a ni
  surveillance autonome des stores ni déclenchement sur chaque build de test.
- Mode manuel dans la même page de l'administration : titre, message, version
  cible, comptage préalable, confirmation explicite, historique et arrêt de
  l'envoi. L'identifiant du message est conservé dans la session du navigateur
  pour une reprise sans duplication après réponse perdue et rechargement.
- Audiences : même plateforme, version/build natif inférieur à la publication,
  consentement et jeton présents, installation synchronisée depuis moins de
  90 jours. Une campagne manuelle concerne les installations déjà enregistrées
  lors de sa création et cesse d'être distribuée après sept jours.
- Mise en file par lots de 100, avec clé d'événement unique. Réutilisation de la
  file durable existante, sans appel réseau sous verrou transactionnel. Le jeton,
  le consentement, la disponibilité et la validité de la campagne sont revérifiés
  avant chaque tentative. Les installations enregistrées sont exclues de l'ancien
  circuit par compte pour éviter les doublons et respecter le désabonnement.
- Notifications ordinaires, sans sonnerie de trajet, expiration transport d'un
  jour. Les jetons invalides sont désactivés sur erreur directe ou reçu Expo,
  seulement si le jeton ayant échoué est encore le jeton courant.

Fichiers backend : `src/app-updates/installation-update*.ts`,
`src/app-updates/installation-updates*.ts`, `app-updates.module.ts`,
`app-update-dispatch.service.ts`, `src/notifications/notifications.service.ts`,
la nouvelle migration et `src/database/migrations/index.ts`.
Fichiers admin : `app/(admin)/app-updates/page.tsx`, `UpdateCampaigns.tsx`,
`updateCampaignIntent.ts`, `lib/features/appUpdates/appUpdatesApi.ts`.
Le commutateur serveur existant `APP_UPDATES_ENABLED` est conservé ; aucune
configuration d'environnement n'a été consultée ou modifiée pour ces changements.

### Parrainage

`hooks/auth/useRegistrationActions.ts` ne consomme plus l'invitation sur le seul
succès de création de compte. `components/ReferralAttributionHandler.tsx` conserve
la responsabilité du rattachement et de sa confirmation. Une panne transitoire
est réessayée au premier plan toutes les minutes, en plus des reprises sur retour
dans l'application et reconnexion déjà présentes.

Conservés : capture du lien avant validation réseau, priorité à la première
invitation valide, durée de validité locale de 30 jours, isolation par compte,
validation serveur, rattachement idempotent et règles financières existantes.
Un refus métier définitif est distingué d'une panne réseau. Le flux de connexion
ne dépend pas du succès de ces tâches secondaires.

## Vérifications et limites

- Contrôle global mobile `node scripts/check-release.cjs` réussi : cohérence des
  sources natives, TypeScript, ESLint, frontières réseau, taille des sources,
  **2 732 tests réussis**, zéro échec, un test Ruby ignoré sous Windows.
- Backend : **64 tests distincts réussis**, incluant les tests d'annonces
  existantes, validation des entrées, livraison sans compte, révocation,
  reçus Expo et transactions/concurrence sur PostgreSQL local éphémère.
  Compilation TypeScript de production réussie. Ces essais n'utilisent pas
  les données de production et les fournisseurs push sont simulés.
- Administration : TypeScript valide et deux tests de conservation de l'intention
  d'envoi après rechargement/réponse perdue réussis.
- Parrainage : tests de réponse perdue après rattachement, reprise après
  redémarrage, retry sans changement de réseau, arrêt hors premier plan et
  absence de consommation prématurée lors de l'inscription.
- Aucun essai de livraison sur iPhone/Android physique, aucun build natif ni
  mesure de batterie/chauffe. Les tests JavaScript ne prouvent pas la réception
  d'une notification par un appareil réel. Aucun changement natif pour ce lot.

Une installation d'une ancienne version qui n'a jamais transmis de jeton n'est
pas joignable rétroactivement : la personne doit ouvrir une version intégrant ce
flux et accepter les annonces. Un refus permet seulement d'afficher la notice
dans l'application ; aucun SMS ou courriel n'est envoyé. Un appareil hors ligne,
désinstallé ou bloqué par ses réglages peut ne pas recevoir le push. L'historique
admin mesure la préparation et l'acceptation par le fournisseur, pas la lecture.
La file empêche les doubles créations ; une réponse du fournisseur perdue après
acceptation ne permet pas de garantir une livraison « exactement une fois ».

Un désabonnement hors ligne prend effet côté serveur après synchronisation.
Une réinstallation ou la perte des données locales peut perdre le choix et le
lien de parrainage. La réception initiale d'un lien différé dépend aussi du SDK
et du système : la persistance protège un lien **déjà reçu** par Zwanga.

Références : [autorisation de notification Apple](https://developer.apple.com/documentation/UserNotifications/asking-permission-to-use-notifications),
[gestion des jetons Firebase](https://firebase.google.com/docs/cloud-messaging/manage-tokens).
