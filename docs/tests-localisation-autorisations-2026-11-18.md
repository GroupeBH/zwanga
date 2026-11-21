# Recette locale — localisation et autorisations — 18 novembre 2026

## Périmètre et environnement

Vérification des dernières corrections de « Ma position », de la conservation du lieu choisi et de la récupération des autorisations. Ce document ne constitue pas une validation de toutes les fonctionnalités de Zwanga.

- Application réellement manipulée sur `emulator-5554`, Android 16 / API 36. JavaScript du workspace chargé par le serveur Metro existant ; modules du sélecteur et de récupération vérifiés dans le runtime.
- Binaire installé : **1.0.18, versionCode 176**. Pas de recompilation ni réinstallation. Ces essais ne valident pas les éventuels changements natifs absents de ce binaire.
- Connexion HTTP locale au port **5200**, vérifiée dans le runtime authentifié. Compte réservé aux essais et envois SMS/push/paiements réels désactivés, selon confirmation explicite de l'utilisateur. Aucune intervention AWS.
- GPS synthétique : deux points de test distincts, départ approximatif `-4.30, 15.31`, arrivée `-4.32, 15.305`. L'émulateur ne fournissait pas initialement de fix récent ; un watcher natif de préparation, limité à vingt secondes, et une injection par la console de l'émulateur ont été nécessaires. Il ne s'agit pas d'une mesure de rapidité ou de précision du GPS physique.

## Résultats constatés

| Scénario | Résultat réel |
| --- | --- |
| Accueil → Commander un trajet → Ma position | Le point GPS est sélectionné et le bouton de confirmation devient utilisable. Le géocodage peut se terminer après la sélection sans supprimer les coordonnées. |
| Confirmation de l'arrivée puis choix du départ | L'arrivée reste affichée dans le sélecteur de départ. Les deux lieux sont ensuite présents dans le formulaire, avec itinéraire et estimations. |
| GPS global coupé | Le message de réactivation et « Activer ma localisation » apparaissent. Le choix précédent reste conservé. |
| Réglages ouverts puis retour sans activation | Le GPS reste détecté comme coupé. Aucun accord n'est déduit de l'ouverture des réglages ; la destination est conservée. |
| GPS activé dans les réglages puis retour | La lecture native indique le service activé et la recherche de position reprend. Le premier essai expire faute de fix récent dans l'émulateur ; après préparation du signal, un nouvel appui récupère le point. La rapidité d'une reprise GPS sans préparation reste à mesurer sur appareil. |
| Formulaire → API → détail de la commande | Une commande fictive a été créée dans l'interface puis relue par `getTripRequestById`, statut `fulfilled` / `pending`. Les coordonnées reçues correspondent aux deux points synthétiques à moins d'un mètre, et la référence de test est enregistrée. Le détail affiche le départ et la destination. |
| Annulation de cette commande | Annulation depuis le détail et confirmation dans le modal. Une nouvelle lecture de la même commande renvoie `cancelled`. Aucune autre commande n'a été annulée. |
| Plein écran Android retiré dans les réglages | Au retour, le pont natif retourne `allowed: false` et l'interrupteur de l'écran « Alertes conducteur » est désactivé. L'interface propose de réautoriser l'option. Notifications et consentement Zwanga ne sont pas confondus avec ce droit Android. |
| Réactivation depuis Zwanga | Appui sur l'interrupteur, explication, confirmation puis ouverture des réglages Android. Après activation et retour : `allowed: true`, interrupteur activé et texte d'autorisation affiché. |
| Autorisation de localisation arrière-plan | Lecture native et affichage « Autorisé sur ce téléphone » vérifiés avec le droit déjà accordé. **Le cycle retrait → nouvelle demande « Toujours », la livraison continue en veille et les restrictions constructeurs ne sont pas validés par cet essai.** |

La commande de test a été créée à **16:26:38 UTC**. Les captures locales se trouvent dans `.expo/global-e2e-ui-20261103/`, sous le préfixe `location-20261118-` : `selected-gps`, `confirmed-gps`, `reactivate-action`, `settings-no-grant`, `final-form`, `created-detail`, `cancelled`, `permissions-baseline`, `fullscreen-denied-ui`, `fullscreen-restored`. Certaines animations empêchent UIAutomator de fournir une hiérarchie : ces captures sont des images uniquement, sans réutilisation d'un ancien XML. Les captures restent des artefacts locaux, pas des pièces publiques à publier.

## Anomalies et limites observées

1. **Clés React dupliquées** : avertissement `Encountered two children with the same key` présent dès l'accueil, avant les essais du sélecteur, et réapparu pendant le parcours. Le bandeau de développement recouvre parfois des actions ; certains essais de clic ont ainsi ouvert LogBox au lieu du bouton sous-jacent. Un relevé final compte 57 occurrences regroupées, sans pile de composant exploitable. Le contrôle ponctuel des tableaux de premier niveau du cache API n'a pas révélé de doublon ; cela n'identifie pas la cause et n'exclut pas une composition UI fautive. À diagnostiquer séparément, sans masquer globalement les avertissements.
2. **Texte tarifaire incohérent** : le formulaire de commande affiche encore « minimum … /place », alors que le détail indique un prix pour le trajet. Source repérée : `features/trip-request/pricingDescription.ts`. Constat d'affichage uniquement : aucun calcul ni prix contractuel n'a été modifié dans cette recette.
3. **Historique ANR** : le buffer Android contient deux événements de démarrage `failed to complete startup`, à **14:15:34** et **14:18:17 UTC**. Leur cause n'est pas déterminée ici. Aucun événement `am_anr` ou `am_crash` pour Zwanga n'a été trouvé après le point de contrôle horodaté **15:47:19 UTC**, jusqu'au contrôle final de cette recette. Cela ne certifie pas l'absence de crashs ou d'ANR en production.
4. Les transitions système, le clavier de l'émulateur et le bandeau LogBox ont nécessité des reprises du scénario. Un retour Android a quitté le formulaire au lieu de simplement fermer le clavier ; les essais interrompus ne sont pas comptés comme créations réussies. Une seule commande fictive a été finalement créée et annulée. Un appel de test à `Keyboard.dismiss()` a servi à fermer le clavier, sans modifier les données du formulaire.
5. Pas d'iPhone, pas de build Release récent, pas de notification réelle envoyée, pas de téléphone verrouillé recevant une commande. La présence du droit plein écran n'est pas une preuve de délivrance ou de sonnerie Notifee.

## Vérifications automatisées de cette recette

Commande :

```text
node --test tests/locationPicker.test.js tests/locationPickerMapPress.test.js tests/locationRecovery.test.js tests/homeLocationRecovery.test.js tests/nearbyDriverPermission.test.js tests/fullScreenPermissionReliability.test.js
```

**76 tests réussis, aucun échec, aucun ignoré.** Ces tests JavaScript utilisent des interfaces natives simulées : ils complètent, sans remplacer, les manipulations Android ci-dessus. ESLint ciblé et `node --check` réussis sur les deux outils d'audit concernés. Le contrôle intégral de 4 047 tests réussis du [correctif initial](localisation-autorisations-2026-11-18.md) n'a pas été relancé dans cette recette.

## Outillage modifié et état final

- `scripts/audits/verify-location-runtime.cjs` : lecture bornée des permissions natives et des statuts de requêtes, réservée à un runtime de développement connecté à une API locale sur 5200 ; aucune identité ni aucun jeton renvoyé. Le mode explicite `prepare-gps` prépare un watcher de test pendant vingt secondes, avec libération également si l'enregistrement natif arrive tardivement.
- `scripts/audits/tap-local-ui.cjs` : possibilité de cibler explicitement les seuls packages Android de réglages/permissions autorisés, en plus de Zwanga. Sélection unique, active, dans une hiérarchie fraîche ; les échecs d'identification restent bloquants pour ce clic. Cette vérification ne garantit pas qu'une surcouche de développement ne recouvre pas la cible : contrôle visuel nécessaire.
- Aucun fichier produit mobile/backend, configuration `.env`, schéma de base, version ou service de production modifié par cette recette.
- Commande fictive annulée, compte initial conservé, retour à l'accueil. GPS global réactivé ; permissions premier plan/arrière-plan, consentement et notifications conservés ; mode Android plein écran rétabli à sa valeur initiale `default`, droit effectif accordé. Le point GPS synthétique reste celui de l'essai dans l'émulateur.
- Watcher temporaire terminé, données temporaires de diagnostic supprimées du runtime, serveur Metro de l'utilisateur conservé. La base n'a pas été réinitialisée. La commande annulée reste dans l'historique local de test.

## Avant diffusion

Rejouer sur Android physique et iPhone, avec le nouveau binaire : permission initialement refusée puis accordée, GPS coupé/rétabli, délai prolongé dans les réglages, localisation arrière-plan en veille, changements de compte, réception réelle d'une alerte et arrêt de sonnerie à l'acceptation. Diagnostiquer les clés dupliquées et l'historique de démarrage ANR avant de conclure à une stabilité native complète.
