# Modification des horaires : contrôle des conflits — 29 octobre 2026

## Problème et périmètre

Le dernier [audit avant déploiement](AUDIT_AVANT_DEPLOIEMENT_2026-10-29.md) a reproduit un contournement du planning : `TripsService.update()` enregistrait un nouveau départ sans vérifier les commandes déjà acceptées. Le contrôle existait à la publication et à l'acceptation, mais pas à la modification.

Correction backend uniquement. Les modifications préexistantes des deux dépôts sont conservées. Aucun changement mobile/natif, de contrat HTTP, de migration ou de configuration ; aucun déploiement ni accès aux données de production.

## Solution appliquée

- `../zwanga-backend/src/trips/trips.service.ts` conserve un instantané avant modification et confie l'écriture finale à `saveTripDetailsUpdate()`.
- Nouveau `src/trips/save-trip-details-update.ts` : transaction `READ COMMITTED`, verrou conducteur `FOR NO KEY UPDATE` commun aux acceptations, puis verrou du trajet et relecture de l'état courant. Aucun verrou de demande supplémentaire et aucun géocodage, cache ou envoi de notification pendant la transaction.
- Seuls les champs de détail réellement modifiés sont appliqués à la ligne relue. Une ancienne modification de description ne rétablit plus l'ancien départ et n'écrase pas les positions ou places mises à jour entre-temps. Un changement concurrent du même champ, du statut ou de l'affectation renvoie `TRIP_CHANGED` plutôt que d'écraser silencieusement la modification. Un recalcul de capacité fondé sur un compteur de places devenu ancien est aussi refusé.
- `src/trip-requests/dispatch/driver-schedule-policy.ts` ajoute `assertTripUpdateSchedule()`, fondé sur le prédicat déjà utilisé pour les affectations. Il est exécuté avant sauvegarde si le départ change ou si le statut redevient actif/à venir. Un chevauchement renvoie HTTP 409, code `DRIVER_SCHEDULE_CONFLICT`, avec le message « Vous avez déjà une course à cette heure. Choisissez un autre horaire. »
- Le trajet modifié et sa propre demande sont exclus du calcul. Les références de demande historiques non UUID ne sont pas envoyées à un cast UUID. Les trajets privés/issus de demandes sont comparés à tous les engagements ; pour un trajet public, la politique publique/publique préexistante est conservée, mais les commandes sont protégées.
- Quand le départ change, une durée estimée valide est conservée en décalant l'arrivée estimée. Garder l'ancienne heure d'arrivée aurait artificiellement raccourci le trajet en déplaçant le départ plus tard. Sans durée valide, le repli conservateur existant s'applique : deux heures, avec la marge de transfert de 30 minutes. Il s'agit d'une hypothèse de planification, pas d'une mesure d'itinéraire.

## Précautions et comportements conservés

Les horaires compatibles restent modifiables. Aucun refus supplémentaire fondé sur une autre publication publique n'est introduit. Prix déjà convenu pour une commande, validation du véhicule/capacité, contrôle des passagers à bord et notifications aux passagers acceptés gardent leur chemin existant. Cache et notifications ne sont exécutés qu'après succès de l'enregistrement ; un conflit n'envoie pas de notification de modification.

Cette correction vise le chemin de modification des détails et sa concurrence avec publication/acceptation. Elle ne constitue pas une réécriture de tous les workflows du trajet. La garantie entre répliques suppose qu'elles exécutent toutes le correctif et la politique de verrouillage associée.

## Vérifications réellement réalisées

- **73 tests unitaires réussis, aucun échec**, dans `save-trip-details-update.spec.ts`, `trips.service.spec.ts`, `trip-publication-photo.spec.ts` et `save-request-trip.spec.ts`. Dépôts simulés pour ces tests. L'ancien bloc de tests du service conserve ses assertions sur validation/notifications, et le nouvel écrivain transactionnel est testé séparément.
- **113 tests réussis, aucun échec ni test ignoré**, dans `dispatch-postgres.spec.ts`, avec PostgreSQL/PostGIS jetable local. Cette suite comprend ses cas de politique existants et **13 nouveaux scénarios sur base réelle** dans `test/trip-update-schedule-postgres.ts` : conflit avec commande sélectionnée ou course privée liée, édition compatible, durée estimée, propre demande exclue, comparaison privé/public, politique public/public inchangée, édition/acceptation concurrentes compatibles et incompatibles, acceptation après édition, réactivation d'un trajet terminé, modification descriptive ancienne et places modifiées entre-temps.
- Ces scénarios exécutent le véritable `TripsService.update()` et/ou son écrivain transactionnel. Le scénario d'acceptation concurrente prend le verrou de demande, exécute la véritable politique d'affectation et écrit la sélection dans une transaction réelle ; ce n'est pas un appel HTTP complet de l'application ni un push réel.
- **TypeScript backend de production réussi**, après le dernier changement, avec `tsc --noEmit --incremental false -p tsconfig.build.json`.
- **ESLint ciblé sur les deux modules de production** et contrôles `git diff --check` réussis ; les avertissements de fins de ligne n'indiquent pas un échec. Aucun formatage global des fichiers historiques du service.
- Campagne initiale : 72 tests unitaires et 112 tests de la suite PostgreSQL réussis ; ajout du cas de réactivation puis relance finale à 73/113. Les nombres ne sont pas cumulés.

Les diagnostics et journaux restent ignorés sous `.expo/run-schedule-fix-20261029.cjs` et `.expo/schedule-fix-*-20261029.log`. Le lanceur transmet un environnement minimal, sans lire `.env`, et les fournisseurs sont simulés. Le skill PostgreSQL a guidé la transaction courte, la cohérence de l'ordre des verrous et les essais sur base jetable.

## Limites restantes

Aucun essai sur téléphone, profilage natif ou paiement réel n'a été réalisé dans cette intervention. Les réserves iOS/Android de l'audit précédent demeurent : contrôle des archives finales et recette physique avant publication. Aucune disparition de crash, chauffe ou restriction de notification n'est annoncée. Aucune migration n'est requise pour ce correctif ; il reste à déployer le backend selon le processus habituel.
