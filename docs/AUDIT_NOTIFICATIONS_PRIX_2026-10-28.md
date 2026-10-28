# Audit du prix et de la cohérence des notifications conducteur

Audit commencé le 27 octobre et finalisé le 28 octobre 2026, heure de Kinshasa. Périmètre : dernier lot d’affichage du prix et du trajet en texte, après retrait de la carte, et interfaces avec la réception native Android, Notifee JavaScript, APNs/Firebase, Expo et les actions existantes. Ce document ne constitue pas un nouvel audit global du dispatch Redis, des paiements ou de toutes les fonctionnalités de l’application.

## Résultat

Quatre points P2 nécessitent une correction avant de considérer ce lot entièrement cohérent. Aucun correctif de comportement n’est appliqué dans cet audit. Un décalage supplémentaire des boutons, déjà présent avant le dernier lot, est également documenté.

### P2 — Prix absent du résumé plein écran Android

- `native/android/notifications/RideNotificationBundle.java:70` place désormais le montant dans le titre, et conserve seulement le trajet et l’instruction dans le corps (`:79`).
- `native/android/notifications/IncomingRideActivity.java:113` ne lit que `EXTRA_BIG_TEXT`, puis `EXTRA_TEXT`. Son titre est construit séparément et ne reprend pas `EXTRA_TITLE`.
- **Constaté :** sur l’APK de test local, la notification contient `Zwanga · 2 500 FC / place` dans son titre et aucun prix dans son corps. Le style natif est bien `BigTextStyle`, avec deux actions. L’absence du montant dans le résumé plein écran est déduite de la lecture de son code ; ce résumé n’a pas été validé visuellement sur appareil physique.
- **Impact :** le montant est visible dans la notification ordinaire, mais disparaît de l’interface plein écran qui doit aider le conducteur à décider. C’est une régression du déplacement du prix, car l’ancien corps natif comportait ce montant.
- **Correction recommandée :** conserver le montant dans un résumé partagé par la notification et le plein écran, tout en maintenant le masquage des informations privées lorsque le téléphone est verrouillé. Aucun besoin de changer la sonnerie.

### P2 — Date, places et nature de l’événement perdues dans la nouvelle présentation serveur

- `zwanga-backend/src/notifications/ride-card-content.ts:16` remplace le titre par le montant et le corps par le trajet et l’instruction, dès que prix et trajet sont disponibles.
- `ios-driver-push.ts:16` et `android-driver-backup.ts:27` utilisent ce formateur. Il n’exploite ni `rideSeats`, ni `rideDepartureAt` et ne conserve pas les mentions « réservation » ou « programmée » du titre initial.
- **Reproduit :** pour une demande synthétique de deux places le 28 octobre à 10 h, la carte JavaScript affiche `2 places · Départ : 28/10 10:00`. Le message APNs ne présente ni ces places, ni cette heure. Les métadonnées existent toujours dans le payload : c’est la présentation qui les omet.
- **Impact :** le conducteur peut confondre une demande programmée avec une demande immédiate ; le même événement change de contenu lors du passage de la notification au premier plan. Le natif Android omettait déjà l’heure et les places ; ce décalage préexistant mérite la même harmonisation.
- **Correction recommandée :** un contrat de présentation commun conservant nature de l’événement, prix par place, départ/destination, places et horaire utiles, avec troncature bornée.

### P2 — La présentation du prix n’est pas appliquée au transport Expo

- `zwanga-backend/src/notifications/notifications.service.ts:529` transmet toujours `notification.title` et `notification.body` à Expo, sans appeler `rideCardContent`. Le secours FCM sans capacité enregistrée conserve également les anciens textes (`:485`).
- Certaines sources produisent un texte sans montant : réservation dans `transactional-notifications.subscriber.ts:159`, et demande séquentielle dans `sequential-dispatch.service.ts:127`. Le prix se trouve seulement dans les données structurées.
- **Reproduit :** exécution de la véritable méthode `sendExpoPushNotification`, avec son HTTP remplacé par une réponse locale simulée. Les notifications de demande et de réservation ne montrent aucun prix dans le titre/corps, malgré les métadonnées de prix présentes. Aucun appel Expo réel n’est effectué.
- **Impact :** l’affichage dépend du jeton et de la capacité enregistrée. En particulier, un iPhone recevant encore via Expo conserve la notification distante, sans reconstruction locale Notifee pour ajouter le prix.
- **Correction recommandée :** appliquer la même présentation à tous les transports conducteur, en préservant les réponses passager et les notifications sans rapport avec les trajets. Contrôler séparément la taille finale de chaque enveloppe.

### P2 — Le contrôle de compatibilité avec l’ancien mobile ne démarre plus

- `scripts/check-backend-mobile-ringing.cjs:21` limite explicitement les modules backend autorisés. Le nouveau `ride-card-content.ts`, désormais importé par deux formateurs, n’est pas dans cette liste.
- **Reproduit :** la commande documentée avec le commit `0ffc1910343a95356a45ab1124dec1e2e797ed9d` échoue immédiatement avec `Module outside contract scope: src/notifications/ride-card-content.ts`, avant les assertions de compatibilité.
- **Diagnostic complémentaire :** exécution en mémoire du même script en ajoutant uniquement ce module à la liste autorisée, sans modifier le fichier : les 20 contrôles de contrats passent. L’échec est donc celui du banc de vérification, pas une preuve d’incompatibilité du protocole.
- **Correction recommandée :** mettre à jour la liste autorisée et ajouter les nouvelles assertions de présentation. Le commit testé reste une référence de source ; l’identité exacte du binaire Play Store 176 n’est pas attestée par cet audit.

## Écart préexistant des actions

`driverNotificationActions` affiche « Refuser » puis « Voir la demande » pour une commande partagée. `RideNotificationBundle.java:88` affiche « Voir et accepter » puis « Refuser » pour toutes les demandes proches, sans tenir compte de `sharedTrip`. L’action native pointe bien vers `driver-review-nearby`, donc elle ouvre la demande et ne l’accepte pas automatiquement. Il s’agit d’un écart de libellé et d’ordre, susceptible de dérouter le conducteur au déverrouillage ; il n’a pas été introduit par le dernier changement de prix.

## Vérifications et points conservés

- **55 tests mobiles réussis** : actions, déduplication, propriétaire, refus, expiration, reprise sonore et réception de notification. Une partie exécute du Java sur JVM ; cela ne constitue pas un essai natif Android complet.
- **50 tests backend réussis** : présentation, données de prix/parole, contrats Android/APNs et gestion de livraison. Les erreurs fournisseur intentionnelles des tests ne correspondent pas à des appels réels.
- **54 combinaisons supplémentaires**, donc 108 enveloppes Android/iOS produites à partir des vrais formateurs : trois événements, six états du prix et trois familles d’adresses, dont de longues chaînes Unicode. Maximum observé : **2 796 octets Android**, **2 567 octets iOS** selon les compteurs actuels des fonctions. Toutes ces fixtures restent sous les plafonds internes de 4 000/3 800 octets. Cela ne couvre pas toutes les données possibles en production.
- Identifiants du conducteur et échéances conservés dans ces enveloppes ; son APNs inchangé ; zéro connu distingué d’un montant absent ou invalide. Le tarif reste **par place**, et le budget d’une demande n’est pas présenté comme le gain net du chauffeur ou le total effectivement débité au passager.
- **Une injection native locale** exécutée sur l’émulateur dans `com.zwanga.audit` : prix dans le titre, itinéraire dans le corps, style texte et deux actions confirmés. Pas de requête serveur ou de push Firebase. Une seconde exécution native a été empêchée par l’expiration du délai de revue automatique des permissions ; les 54 combinaisons finales ont été réexécutées en JavaScript sans accès à l’émulateur.
- **20 contrôles de compatibilité supplémentaires réussis dans le diagnostic en mémoire** décrit ci-dessus. Le script officiel demeure à corriger.
- Aucun endpoint de carte, téléchargement d’image, permission ou attente réseau supplémentaire dans le dernier lot. Les changements de présentation n’ajoutent pas de requête HTTP à la réception d’une notification.
- Mesure indicative sur le poste de développement : 1 000 appels au formateur JavaScript après échauffement ont pris environ 342 à 543 ms lors de deux exécutions, soit 0,34 à 0,54 ms par appel en moyenne. Cette mesure ne prédit ni la latence du push, ni la consommation d’un téléphone, ni celle d’Hermes.
- Parité des sources natives vérifiée ; ESLint du script d’audit passé. Pas de nouvelle compilation native pendant cet audit : utilisation de l’APK isolé compilé lors de l’implémentation précédente.

## Reproduction et fichiers ajoutés

`scripts/audits/audit-driver-card-text.cjs` charge les véritables fonctions TypeScript sans initialiser le serveur ou lire `.env`. Il exécute les cas synthétiques, compare les présentations et mesure le formateur. Ses résultats sont locaux dans `.expo/driver-card-audit-20261027`.

```powershell
node scripts/audits/audit-driver-card-text.cjs
```

L’option `--native` nécessite `RIDE_AUDIT_ADB`, un `RIDE_AUDIT_SERIAL` de type émulateur, et l’APK d’audit installé. Elle publie seulement une notification synthétique dans cette application de test et la supprime en fin d’essai.

Seuls le script d’audit, ce rapport et sa référence dans `docs/CHANGEMENTS_TECHNIQUES.md` sont ajoutés pour cette demande. Aucun correctif applicatif, modification de base, envoi réel ou déploiement. Pas de test sur téléphone physique ou de rendu natif iOS ; aucune conclusion sur l’absence de crashs, la chauffe ou la réception garantie sur tous les appareils.
