# Correctifs du contre-audit de performance — 25 septembre 2026

## Périmètre

Application des quatre recommandations de
[l'audit complémentaire](PERFORMANCE_FOLLOWUP_2026_09_25.md), sans modification des
prix, paiements, rôles, seuils d'embarquement/dépose ou contrats backend.
Aucune dépendance ajoutée par ces correctifs. Aucun déploiement effectué.

## 1. Lecture ponctuelle de la position bornée et dédupliquée

**Problème.** Sans position récente, une réponse GPS native tardive pouvait garder
« Ma position » en chargement indéfiniment. Une simple limite d'attente ne devait
pas multiplier les requêtes natives à chaque nouvelle tentative.

**Solution appliquée.** `services/currentLocationRequest.ts` borne la recherche
de position fraîche à 10 secondes, et chaque lecture de position en cache à
2 secondes. Le repli déjà existant est conservé : cache récent de deux minutes
(précision demandée 250 m ou 100 m selon le profil), puis acquisition GPS, puis
cache de secours de quinze minutes avec précision demandée de 1 000 m. Au maximum,
ces trois étapes d'acquisition attendent 14 secondes, hors autorisations et
vérification de disponibilité du service système.

`hooks/useUserLocation.ts` partage l'opération sur un double appui et ignore les
résultats après démontage, changement de suivi/écran ou passage en arrière-plan
pendant l'acquisition. Coordonnées invalides rejetées avant publication dans Redux.
Les timers et listeners de cette attente sont retirés à sa fin.

**Limite native explicite.** L'appel Expo `getCurrentPositionAsync` n'expose pas
d'annulation native. Le correctif annule l'attente de l'interface, pas cet appel
système. Tant qu'il reste en attente, les tentatives de même précision partagent
la même opération native. Les consommateurs expirés sont retirés d'un ensemble
de listeners pour ne pas retenir leurs écrans jusqu'à une réponse tardive.
Le suivi continu du trajet n'est pas arrêté par l'expiration de cette lecture.

**Tests.** `tests/userLocationLifecycle.test.js` : double appui, nouvelle tentative
après timeout sans nouvel appel natif, réponse tardive ignorée, repli hors ligne,
cache natif sans réponse, démontage, arrière-plan et sortie d'écran. Les tests
existants de permissions, changement de profil et veille/reprise sont conservés.

## 2. Réduction des opérations du GPS passager

**Problème.** Chaque callback relisait deux fois la session sur disque et vérifiait
deux API natives même lorsque le trajet et le profil n'avaient pas changé.

**Solution appliquée.**

- `services/background/passengerTaskLifecycle.ts` conserve une session en mémoire
  pendant au plus 30 secondes. Lecture, sauvegarde et suppression partagent une
  file sérialisée ; une écriture ou suppression met immédiatement le cache à jour.
  Les changements de session/démarrages et arrêts forcent une lecture de contrôle.
- `services/background/passengerGpsProfile.ts` conserve le résultat de contrôle
  natif pendant 30 secondes pour un profil identique. Les changements de profil
  et démarrages explicites forcent ce contrôle ; une tâche effectivement absente
  est redémarrée. Ce n'est pas un nouveau timer permanent : le contrôle périodique
  s'effectue lors des callbacks/appels de suivi.
- `components/ActiveRideLocationCoordinator.tsx` revérifie le suivi passager au
  retour au premier plan même si les données de réservation sont inchangées.
  Le passage en arrière-plan ne coupe pas le suivi natif d'un trajet actif.
- `services/passengerBackgroundLocationTask.ts` intercepte aussi une erreur de
  tâche inattendue. Une indisponibilité temporaire du stockage ne prouve pas une
  fin de trajet : elle suspend ce traitement et permet une nouvelle tentative.
  Un enregistrement lisible mais corrompu reste traité comme une session invalide.

**Conservé.** Précision et fréquence des positions, profils économe/précis,
préarmement, horodatages de dépose, fin du transport avec paiement encore dû,
protection contre les callbacks d'une ancienne réservation, arrêt à la déconnexion
et une seule validation pour une réservation de plusieurs places.

**Mesure simulée, non native.** Après démarrage, 100 callbacks actifs dans la même
fenêtre de cache ne font plus aucune lecture du stockage ni vérification native
supplémentaire, contre 200 lectures et 200 vérifications dans l'audit. Les
100 positions restent publiées au flux partagé. À l'expiration des 30 secondes,
un callback relit la session et revérifie la tâche. Cela ne mesure ni CPU ni batterie.

**Tests.** `tests/passengerGpsProfile.test.js` et
`tests/activeRideCoordinatorReliability.test.js` : perte de tâche, reprise,
concurrence arrêt/démarrage, changement de réservation, ancien format de session,
cache expiré, suppression, erreur temporaire et corruption du stockage.

## 3. Rafraîchissements d'identité sans abonnement permanent

**Problème.** Les lectures impératives après synchronisation d'identité conservaient
leurs abonnements RTK Query. Les invalidations étaient également répétées.

**Solution appliquée.** Dans `store/api/userApi.ts`, les parcours d'envoi et de
synchronisation partagent le même rafraîchissement d'authentification. Les tags
profil/statut sont invalidés après sa tentative, puis les deux lectures sont
lancées avec `subscribe: false`. Les invalidations de succès redondantes ont été
retirées. Une erreur de renouvellement du token n'empêche pas la lecture du statut.

**Conservé.** Lecture effective sans écran ouvert ; actualisation des consommateurs
déjà abonnés ; statut d'identité et profil relus ; mutations et payloads inchangés.
Le changement ne crée aucun nouveau parcours d'activation conducteur.

**Tests.** `tests/identityQueryLifecycle.test.js` utilise le store et middleware RTK
réels avec le transport simulé. Dix synchronisations laissent zéro abonnement
impératif contre vingt auparavant. Avec les deux écrans abonnés, une synchronisation
rafraîchit chaque lecture une fois sans supprimer les abonnements des écrans.
Renouvellement du token et lectures en erreur également testés.

## 4. Polling des retraits uniquement lorsqu'il reste quelque chose à suivre

**Problème.** L'écran des jetons interrogeait l'historique toutes les 30 secondes,
même lorsque l'historique était vide ou tous les retraits terminés.

**Solution appliquée.** `hooks/wallet/useWalletWithdrawal.ts` maintient le polling
pour un retrait non terminal (dont `pending`, `initiated`, `review`) ou une intention
locale incertaine du compte actuel. Il l'arrête pour un historique vide ou composé
uniquement de `succeeded`, `failed`, `cancelled`. Les premières lectures, retours
sur l'écran, invalidations après mutation et vérifications manuelles restent actifs.
La section repliée continue donc de suivre les opérations qui en ont besoin.

**Conservé.** Montants, numéro Mobile Money, éligibilité, blocages, clés d'idempotence,
absence de second retrait automatique et reprise d'une réponse perdue. Aucun statut
de paiement n'est déduit d'un timeout. `tests/walletWithdrawal.test.js` couvre les
statuts, le changement de visibilité et l'intention incertaine sans entrée serveur.

## Références de tests historiques

Le mock de contact dans `tests/tripListCards.test.js` utilise désormais
`setContactBookingId`, conformément au composant réel. L'assertion vérifie toujours
la réservation ciblée et l'annulation avant embarquement.

Dans `tests/fixtures/sourceExtractions.json`, seules les références identifiées
comme modifiées ont été révisées : huit regroupements de styles déjà compactés
(réservations, demandes, recherche, mes trajets, détail/gestion de trajet, jetons),
parcours PIN déjà remplacé et callbacks d'identité changés dans cette intervention.
Les tests comportementaux des cartes compactes et du parcours PIN restent exécutés ;
aucun style applicatif ni parcours PIN n'a été changé pour satisfaire les empreintes.
Les autres empreintes et assertions n'ont pas été supprimées.

## Validation et limites

Les résultats de la validation finale sont consignés dans
`docs/CHANGEMENTS_TECHNIQUES.md`. Les tests du GPS, permissions et stockage utilisent
des API natives simulées ; ceux d'identité utilisent RTK réel et réseau simulé.
Aucune mesure de chauffe, mémoire ou crash sur appareil physique pendant cette
intervention. Prévoir un essai release iOS et Android avec trajet prolongé,
veille/reprise, plusieurs réservations, panne réseau, paiement, puis fin du trajet.
