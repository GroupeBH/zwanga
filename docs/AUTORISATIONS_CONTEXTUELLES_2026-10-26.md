# Autorisations plein écran et localisation — 26 octobre 2026

## Périmètre et constats

Signalement : la proposition plein écran n'a pas été vue sur Android ni iPhone ;
la confirmation de localisation iOS apparaît parfois après avoir quitté Zwanga.
L'appareil, le profil exact du binaire installé et le moment de la confirmation
ne sont pas connus. Aucun de ces signalements n'a été reproduit sur téléphone
pendant cette intervention.

L'inspection du code établit que :

- `eas.json` active le plein écran Android uniquement dans `ride-alerts-test`.
  Le module natif retourne `null` lorsque cette capacité est désactivée dans le
  binaire ; l'application ne propose alors pas une autorisation inutilisable.
- Le sélecteur d'autorisation attendait aussi la lecture de localisation pour
  proposer le plein écran. Un échec de cette lecture bloquait les deux étapes.
- L'historique enregistrait une proposition avant son affichage. Une transition
  d'application ou une alerte prioritaire pouvait empêcher l'affichage tout en
  consommant le délai de rappel de 24 heures.
- Plusieurs chaînes asynchrones de localisation vérifiaient le premier plan au
  début seulement, ou uniquement le focus de navigation. Une lecture native ou
  une explication en attente pouvait aboutir à un appel système après la sortie.

Ces chemins de course sont reproduits avec les modules JavaScript réels et des
entrées/sorties natives simulées. Ils ne prouvent pas que la fenêtre observée par
l'utilisateur avait précisément cette origine : iOS peut lui-même différer la
confirmation « Toujours » et l'afficher hors application.

## Solutions appliquées

- `hooks/notifications/useDriverPermissionPrompt.ts` : chaque permission est
  éligible indépendamment ; la lecture de localisation ne bloque plus le plein
  écran. Le rappel est enregistré sur `onShow`, après la présentation réelle
  par `RideModal`. Une étape sélectionnée puis masquée reste disponible.
- `components/DriverPermissionsCoordinator.tsx`,
  `components/permissions/DriverFullScreenApproval.tsx`,
  `components/location/BackgroundLocationApproval.tsx` : transmission du signal
  de présentation. Le texte iOS explique la confirmation éventuellement différée.
- `features/permissions/driverPermissionRepository.ts` : contrat documenté de
  l'écriture après présentation. Format de stockage inchangé, sans migration.
- `hooks/notifications/useDriverFullScreenPermission.ts` : une erreur de lecture
  native est réessayée une seule fois après 2 secondes, avec le délai natif
  existant de 1,5 seconde. Pas de boucle ni de nouvelle requête réseau.
  Une capacité absente du build n'est pas traitée comme une erreur transitoire.
  Les actions revérifient l'état natif actif juste avant l'appel.
- `services/locationPermissionWait.ts` : garde de premier plan au moment de
  l'appel système. Verrou conservé jusqu'à la réponse native, même si la vue
  appelante est démontée. Les flux automatiques de trajet peuvent attendre la
  fin d'une autre demande, puis revérifient l'état actif ; un second clic manuel
  ne lance pas une demande concurrente.
- `hooks/profile/useNearbyLocationPermission.ts` : protection des demandes et
  de l'ouverture des réglages après les lectures asynchrones ; message de retour
  dans Zwanga en cas de report. Une permission déjà affichée peut finir sans être
  interrompue artificiellement.
- `hooks/driver-navigation/useDriverLocationTracking.ts` : les demandes suivent
  aussi l'état actif, avec contrôle après l'explication ; reprise au retour.
  Seul l'abonnement de navigation au premier plan est retiré en arrière-plan,
  pas le suivi natif d'un trajet en cours.
- `services/driverBackgroundLocationTask.ts` et
  `services/passengerBackgroundLocationTask.ts` : passage par la même garde
  avant toute nouvelle demande. Un report n'est pas enregistré comme un refus.

## Comportements conservés

Première visite silencieuse ; proposition après première publication réussie ou
retour ultérieur de 15 secondes ; priorité aux trajets, réservations et autres
interfaces actives ; fermeture « Plus tard » ; rappel de 24 heures après une
présentation ; contrôle du compte et de la session ; consentement par action
explicite. Aucun démarrage de réglages depuis une notification en veille.

La cadence des positions hors trajet et pendant le trajet n'est pas modifiée.
Le refus reste possible et le suivi déjà autorisé peut continuer en arrière-plan.
Les profils EAS, manifestes, sources natives et réglages de production ne sont
pas modifiés. Les correctifs de reprise de sonnerie déjà présents sont conservés.

Si l'écriture locale de l'historique échoue après présentation, la garde en
mémoire évite une boucle immédiate ; la persistance du rappel après redémarrage
ne peut pas être garantie dans cette situation. Les anciens rappels déjà
enregistrés gardent leur échéance : pas de remise à zéro qui solliciterait à
nouveau tous les conducteurs.

## Plateformes et recette

Android 14+ utilise un accès spécial ouvert après consentement, et non la même
fenêtre qu'une permission de localisation. Voir la
[documentation Android](https://source.android.com/docs/core/permissions/fsi-limits).
Pour les essais avec le profil déjà prévu :

```sh
eas build --platform android --profile ride-alerts-test
```

Vérifier dans ce build : notifications autorisées, conducteur identifié, écran
calme après publication ou après un retour de 15 secondes ; « Autoriser » doit
ouvrir l'accès plein écran Android. Refus et retour doivent rester possibles.
Contrôler ensuite une alerte locale écran verrouillé, permission accordée puis
refusée. Aucun build ni envoi distant n'a été lancé ici.

Sur iPhone, cette autorisation Android ne s'applique pas ; les demandes Zwanga
restent des notifications iOS. La confirmation de localisation peut être différée
par le système, notamment après une autorisation provisoire, comme l'explique
[Apple](https://developer.apple.com/documentation/corelocation/cllocationmanager/requestalwaysauthorization()).
L'application ne peut pas imposer le moment d'un rappel système. Vérifier sur
iPhone neuf et installation mise à jour : accès temporaire, accès pendant
l'utilisation, passage en arrière-plan pendant les lectures, retour et refus.

## Vérifications

Tests ciblés : sélection indépendante des autorisations, signal d'affichage,
historique, reprise, erreurs natives et limite de relance, bascule d'application
pendant une lecture/explication, concurrence de demandes, suivi conducteur et
passager. Modules TypeScript exécutés avec simulateurs d'entrées/sorties, sans
rendu natif ni attribution réelle de permissions.

Le premier contrôle global a détecté six échecs dans
`tests/rideFullScreenPreference.test.js` : sa simulation React Native ne fournissait
pas `AppState`. Elle suit maintenant l'état actif du scénario, sans retirer les
assertions de consentement, de compte ou de refus. Le contrôle global final
`node scripts/check-release.cjs` réussit avec le code 0 : 2 708 tests réussis,
zéro échec, un test Ruby ignoré sur Windows ; TypeScript, ESLint, frontières
réseau, taille des sources et parité native valides. `git diff --check` réussit.

Validation physique Android/iOS, rendu des fenêtres système et comportement des
constructeurs restent à réaliser. Aucun résultat de test JavaScript ne certifie
le réveil d'un écran ou la disparition de plantages natifs.
