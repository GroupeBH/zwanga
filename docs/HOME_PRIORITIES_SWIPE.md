# Masquage des priorités sur l’accueil

## Comportement

- Balayer une carte vers la gauche ou la droite la masque de l’accueil.
- Cela ne refuse, n’annule et ne supprime jamais une réservation, une demande ou un trajet.
- Aucun bouton « Annuler » ni bandeau ne reste après le balayage.
- Les cartes concernées sont les réservations reçues, les trajets du conducteur bientôt au départ, les demandes proches et la demande personnelle.
- La sélection passe au candidat suivant selon le classement existant. Les listes et marqueurs de la carte ne sont pas filtrés par ce masquage.
- Le raccourci du trajet en cours et la reprise de navigation ne sont pas concernés.
- Un simple toucher conserve l’ouverture du détail. Une action accessible « Masquer cette priorité sur l’accueil » est aussi disponible aux lecteurs d’écran.

## État et durée

`homePriorityDismissalsSlice` conserve uniquement des identifiants de cartes dans Redux Toolkit, avec une limite de 200 entrées par compte. Aucun objet métier n’y est dupliqué.

Cet état n’est pas persisté : il reste pendant la session, y compris entre deux visites de l’accueil, puis disparaît au redémarrage de l’application, à la déconnexion ou au changement de compte. Aucune mutation serveur n’est envoyée pour masquer une carte.

Les clés de `homePriorityKeys` sont stables au rafraîchissement : elles n’utilisent pas `updatedAt`. Un départ reprogrammé, un changement de statut de la demande personnelle ou une variation de son nombre d’offres peuvent produire une nouvelle priorité. La durée de dix minutes des demandes proches reste gérée par le mécanisme existant et n’est pas redémarrée par le masquage.

Pour les réservations reçues, une fois toutes les réservations en attente connues d’un trajet masquées, le hook peut sélectionner un autre trajet et utiliser la requête RTK Query de réservations existante pour celui-ci.

## Gestes et performances

`SwipeableHomePriority` réutilise Gesture Handler et Reanimated déjà présents dans l’application :

- reconnaissance horizontale, avec abandon si le mouvement commence verticalement ;
- seuil de distance proportionnel à la largeur de la carte, ou balayage rapide suffisamment engagé ;
- translation et opacité exécutées sur le thread UI, sans dispatch Redux à chaque image ;
- un seul passage vers JavaScript à la fin réussie de l’animation pour masquer la carte ;
- animations annulées et callbacks tardifs ignorés à la sortie de l’écran, au passage en arrière-plan et au démontage ;
- nettoyage avant détachement de la vue native, via `useLayoutEffect` ;
- identifiant de cycle de vie vérifié sur les threads JS et UI : un retour rapide sur l’accueil ne réactive ni une ancienne confirmation ni un ancien événement de geste ;
- une animation de masquage en cours ne peut pas être interrompue par un deuxième balayage ;
- valeurs non finies ignorées, déplacement borné et largeur de carte validée avant toute animation ;
- geste limité à un doigt, annulation explicite du toucher natif iOS pendant un balayage, vue cible non aplatie ;
- aucun nouveau polling, intervalle, SDK ou appel HTTP direct.

## Vérifications

`npm run test:home` exécute les tests de l’accueil, dont le masquage, l’absence de bouton résiduel, l’isolation des comptes, les références de listes/cartes inchangées, les seuils du geste et le cycle de vie de l’animation. Cela inclut 100 sorties/retours rapides simulés, les événements natifs tardifs, les valeurs invalides, ainsi que la compilation des worklets avec la configuration Babel de production de l’application. La compilation TypeScript est vérifiée séparément.

Les tests unitaires simulent le moteur natif. Vérifier sur iOS et Android avant publication :

1. Toucher la carte ouvre son détail ; un petit mouvement la remet en place.
2. Un balayage à gauche ou à droite masque la carte, sans bouton ni bandeau résiduel.
3. Changer d’onglet, revenir ou rafraîchir ne la fait pas réapparaître spontanément.
4. Quitter l’écran pendant le geste ne provoque ni blocage ni masquage tardif au retour.
5. Déplacer la carte géographique hors des cartes de priorité fonctionne toujours.
6. Après démarrage d’un trajet précédemment masqué, son accès à la navigation reste disponible.
7. Pendant le geste, verrouiller/déverrouiller le téléphone ou ouvrir le centre de contrôle, puis revenir. Essayer aussi un balayage suivi immédiatement d’un changement d’onglet, plusieurs balayages rapides et un geste à deux doigts.

Ces vérifications automatisées ne constituent pas un test natif sur iPhone et ne garantissent pas l’absence de crash iOS. Valider sur une version Release/TestFlight, avec surveillance des journaux Crashlytics, avant déploiement public.

La suite globale conserve un échec préexistant de référence dans `tests/sourceExtractions.test.js` concernant `updatePin`/`updatePinWithOtp`. Ces API n’ont pas été modifiées pour cette fonctionnalité.
