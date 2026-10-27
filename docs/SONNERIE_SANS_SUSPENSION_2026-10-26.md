# Demandes ignorées ou refusées : suppression de la suspension des sonneries

Date : 26 octobre 2026. Périmètre : backend des demandes proches et tests de
compatibilité du mobile. Cette décision remplace la règle antérieure de pause
pendant 24 heures après quatre demandes ignorées ou refusées.

## Problème constaté

Deux contrôles excluaient un conducteur dont `mutedUntil` était dans le futur :
la sélection des destinataires et la préparation de chaque envoi/reprise.
Retirer uniquement le compteur n'aurait pas rendu éligibles les conducteurs
déjà suspendus. Cette règle peut expliquer une absence d'alerte malgré la
proximité ; aucune trace d'un téléphone signalé ne permet de l'affirmer pour
tous les cas rapportés.

## Solution appliquée

Dans le dépôt voisin `zwanga-backend` :

- `src/trip-requests/dispatch/nearby-driver-policy.ts` : la sélection des
  conducteurs ne consulte plus la suspension historique, pour les demandes
  immédiates comme pour les demandes planifiées.
- `src/notifications/nearby-request-cooldown.ts` : aucun refus ou événement
  ignoré ne déclenche désormais de suspension générale. Une ancienne suspension
  est effacée sous verrou au prochain traitement de ce conducteur. Les résultats
  des événements restent enregistrés pour le suivi, sans accumuler de pénalités.
- Les champs de réponse `missedCount: 0` et `mutedUntil: null` sont conservés
  pour les applications déjà installées. Les tables et l'ancien nom de fonction
  restent compatibles ; aucune migration supplémentaire ni remise à zéro
  globale des données n'est nécessaire.
- `src/notifications/notifications.service.ts` : le motif de suppression devient
  `NEARBY_REQUEST_INVALID_OR_HANDLED`, et le journal de réconciliation décrit les
  événements, sans faire référence à une suspension.

Tests concernés : `nearby-request-cooldown.postgres.spec.ts`,
`nearby-request-cooldown.spec.ts` et
`src/trip-requests/dispatch/dispatch-postgres.spec.ts` dans le backend ;
`tests/nearbyRequestRefusal.test.js` dans l'application.

## Comportements conservés

Refuser une demande arrête son traitement pour ce conducteur. Cette même
demande ne recommence pas à sonner à cause d'une reprise, d'un second transport
ou d'une deuxième notification. Elle reste disponible pour d'autres conducteurs
selon le flux de distribution existant. Une nouvelle demande peut sonner sans
attendre 24 heures, même après plus de quatre refus ou absences de réponse.

Les réservations, l'exclusion de l'auteur de sa propre demande, le rayon de
5 km, la fraîcheur de la position, les critères du compte/véhicule, les
trajets incompatibles et les autorisations restent inchangés. Les échéances
des invitations, les accusés de réception par destinataire et les protections
contre les doubles actions sont conservés.

Les transactions gardent l'ordre de verrouillage conducteur puis événements,
sans envoi réseau sous verrou. La réconciliation reste bornée à 100 événements
et 100 conducteurs par passage. La neutralisation d'une ancienne suspension
nécessite une écriture seulement lorsque des valeurs historiques subsistent.

## Vérifications et limites

- **139 tests backend réussis, cinq suites, code de sortie 0**, dont
  PostgreSQL/PostGIS éphémères : six demandes réellement acquittées puis ignorées,
  six refus successifs, mélange des deux cas, deux familles de notification,
  anciennes suspensions de 24 heures encore actives, décisions concurrentes,
  exclusion de l'auteur et sélection réelle de conducteurs.
- **Cinq tests mobiles du refus réussis** : identité authentifiée, absence
  d'action après déconnexion, absence de décision différée hors ligne, reprise
  explicite et libération des ressources réseau.
- **TypeScript de production backend valide.** Le contrôle global mobile
  précédent reste applicable : aucun fichier mobile n'a changé pour cette
  suppression de règle.
- **ESLint ciblé valide** sur la politique de sélection, le traitement des
  événements et les deux suites dédiées. Les résultats SQL et doubles des tests
  existants ont été typés, sans désactiver les règles. Après cette mise en forme
  et ce typage, les 13 tests unitaires de la frontière d'envoi ont été relancés
  avec succès ; les assertions et requêtes PostgreSQL restent celles du passage
  des 139 tests. `git diff --check` valide dans les deux dépôts.
- Un premier essai PostgreSQL dans le bac à sable a échoué pendant le lancement
  des processus locaux (`initdb`/`pg_ctl`), avant les assertions métier. L'essai
  avec les permissions locales nécessaires a passé les 139 tests. Les comptes
  sont synthétiques et les bases isolées ; aucune connexion à la production,
  aucun push réel.

La mise en service nécessite de déployer le backend corrigé. Pour cette seule
suppression de contrainte, aucune réinstallation ni mise à jour mobile n'est
requise. Pendant un déploiement progressif, un ancien worker peut encore
appliquer la règle tant qu'il n'a pas été remplacé. Aucune intervention en base
de production n'a été effectuée. Les essais ne garantissent pas la réception
sur un téléphone réel lorsque le système, le réseau ou les permissions
empêchent une alerte.
