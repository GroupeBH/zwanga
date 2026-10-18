# Mise au repos de Profil et Recherche

## Périmètre — 22 septembre 2026

Cette première étape réduit le travail des écrans masqués sans modifier la
navigation native. Elle s'applique à Android et à iOS.

`detachInactiveScreens`, `freezeOnBlur`, la Stack racine et le correctif Android
`drawing-order` sont inchangés. La carte de l'accueil est déjà démontée à la perte
du focus ; sa stratégie de montage n'est pas modifiée ici.

## Lectures d'affichage

`features/performance/screenReadPolicy.ts` centralise les options RTK Query :

- `skip` lorsque l'écran n'est plus actif (focus de navigation **et** application
  au premier plan, via `useScreenIsActive`).
- Aucun polling ni rafraîchissement général sur reconnexion/retour de l'app pour
  ces abonnements d'affichage.
- Au retour, réutilisation du cache ; relecture si la dernière réponse date d'au
  moins 30 secondes, ou si le cache est absent/invalide. Ce seuil n'est pas un timer.

Cela retire les abonnements appartenant à l'écran, pas ceux des autres écrans ou
services qui utilisent la même donnée. Une lecture déjà en cours peut terminer ;
aucune mutation métier n'est annulée à la perte de focus. Le cache partagé n'est
pas vidé et sa politique d'expiration reste inchangée.

### Profil

Dix lectures d'affichage utilisent cette politique : résumé du profil,
vérification d'identité, véhicules, parrainage, demandes, offres, plans
d'abonnement, solde conducteur, avis et note moyenne.

Les données précédemment reçues sont conservées par RTK Query pendant la pause.
Après une longue absence, un cache expiré peut nécessiter un chargement normal au
retour. Les formulaires et leurs états locaux restent montés.

Les deux dépendances de suivi d'abonnement (`getPremiumOverview` et
`getPaymentHistory`) restent abonnées pour un conducteur, sans nouveau polling.
Elles ne sont volontairement pas traitées comme de simples données d'affichage :
une confirmation opérateur peut arriver hors de Profil.

`useProfileRefresh.ts` fournit les rafraîchissements explicites du profil, de
l'identité, des véhicules, du parrainage et du solde. Ils passent exclusivement
par les endpoints RTK Query avec `subscribe: false, forceRefetch: true`. Un retour
du SDK d'identité ou la fin d'une mutation peut donc relire la donnée même après
la suspension de l'abonnement de l'écran, sans erreur « requête non démarrée » et
sans laisser un nouvel abonnement permanent.

Le retour de l'application sans référence de paiement en cours ne lance plus
systématiquement trois lectures depuis le profil masqué, et ce dernier ne conserve
pas d'écouteur AppState de paiement dans ce cas. Un profil visible conserve son
rafraîchissement d'abonnement au retour de veille. Le rapprochement d'un
paiement existant, les retours du navigateur et la restauration des références
sont conservés. Le parcours automatique « devenir conducteur » attend que le
profil soit actif avant de présenter son interface.

### Recherche

- Profil utilisateur, trajets et demandes : abonnements suspendus hors écran.
- Le sélecteur des coordonnées ne lit le GPS que pour les demandes triées par
  proximité, avec l'écran actif. Le sélecteur de la liste de trajets n'observe plus
  ses mises à jour hors écran.
- Filtrage et tri suspendus ; une seule photographie de la dernière liste reste
  affichée dans le composant monté, pour ne pas vider la liste lors du départ.
  Elle n'est pas réutilisée pour un autre utilisateur.
- Le délai de saisie est annulé hors écran ; les champs, le nombre de places et
  le tri restent conservés. Le texte en attente est appliqué au retour.
- La recherche géographique conserve sa protection existante contre les réponses
  tardives et son annulation à la perte du focus.

## Ce qui n'est pas suspendu

Les coordinateurs globaux de localisation d'un trajet actif, de paiement,
de notifications et de synchronisation hors connexion restent inchangés.
La messagerie et les écrans de navigation conducteur/passager ne sont pas gelés.
Aucun réglage Firebase ni aucune dépendance native n'est modifié.

## Vérifications

`npm run test:screen-idle` couvre notamment les abonnements hors écran, la reprise,
les callbacks identité/véhicules après départ, le rapprochement d'un paiement
existant, les filtres de recherche, le brouillon et la stabilité de la liste
pendant 50 mises à jour masquées. Les tests de hooks simulent le cycle de vie ; ils
ne remplacent pas une validation native.

Avant généralisation, comparer avec la version précédente sur appareils réels,
en build release :

1. Ouvrir les cinq onglets, puis effectuer 50 allers-retours Profil/Recherche/
   Accueil ; vérifier carte, défilement, filtres et nombre de places.
2. Passer en veille/revenir après 10 secondes puis plusieurs minutes, avec réseau
   lent ou coupé. Vérifier absence de rafraîchissement en boucle et reprise.
3. Valider une photo, un véhicule, l'identité et un abonnement ; quitter l'écran
   pendant une réponse lente et vérifier le résultat au retour, sans double action.
4. Faire un trajet de 30–60 minutes : suivi, notifications, paiement à proximité,
   dépose et actions hors connexion doivent continuer indépendamment des onglets.
5. Comparer CPU au repos, mémoire native/JS, fluidité et retours Crashlytics.

Le détachement natif puis le gel sélectif seront des essais séparés après cette
validation. Dans les versions installées, le gel des onglets repose sur la branche
native activée par `detachInactiveScreens` : activer seulement `freezeOnBlur` avec
le détachement Android désactivé ne constitue pas un test effectif du gel.

### Résultats locaux

- Suite ciblée finale : 44 tests réussis.
- Suite mobile complète : 661 réussites sur 663. Les deux échecs dans
  `sourceExtractions.test.js` sont des différences de snapshots préexistantes :
  styles des réservations et endpoints du code PIN utilisateur. Les sources et
  références concernées sont identiques à HEAD ; elles ne sont pas modifiées ici.
- Lint des modules modifiés et contrôle des frontières réseau : réussis.
- Tous les modules applicatifs modifiés sont sous 400 lignes. Le contrôle global
  signale encore `app/wallet.tsx` à 414 lignes, inchangé dans cette intervention.
- Pas de mesure CPU/mémoire ni de test prolongé sur appareil réel dans cette
  intervention : aucune garantie d'absence de crash n'est déduite des tests JS.
