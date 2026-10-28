# Audit du relais des demandes — 27 octobre 2026

Suivi : les correctifs préparés après cet audit sont décrits dans
[le rapport des correctifs](CORRECTIFS_RELAIS_DEMANDES_2026-10-27.md).
Les constats ci-dessous décrivent l'état avant correction.

## Périmètre et résultat

Audit du relais séquentiel récemment ajouté dans `zwanga-backend`, de sa file
Redis, des réponses conducteur, de l'acceptation programmée et de leur cohérence
avec l'interface mobile. Aucun correctif métier ni déploiement effectué pendant
cet audit. Le journal référence ce rapport ; les fichiers applicatifs sont conservés.

Le relais nominal fonctionne sur les services locaux testés. **Trois problèmes de
fiabilité restent à corriger avant de considérer ce flux prêt pour la production.**
Deux limites de délai et d'interface s'ajoutent à ces problèmes. Les propositions
ci-dessous sont des correctifs recommandés, pas des solutions déjà appliquées.

## Constats par priorité

### P1 — Un Redis silencieux peut immobiliser le traitement des échéances

- Sources backend : `src/common/utils/redis-command-deadline.ts:5`,
  `src/trip-requests/dispatch/request-driver-queue.ts:36` et
  `src/trip-requests/dispatch/sequential-dispatch.service.ts:125`.
- Le wrapper de délais protège notamment `get`, `set` et `eval`, mais pas les
  nouvelles commandes `zScore`, `zAdd`, `zRangeByScore`, `zRem`.
- `deadlines()` attend `queue.due()` **avant** le secours SQL, avec `ticking=true`.
  Une promesse Redis qui reste en attente bloque donc aussi ce secours ; les
  déclenchements suivants quittent immédiatement la méthode. Une erreur Redis
  explicite est gérée, mais ce cas de connexion silencieuse ne l'est pas.
- Reproduction : quatre commandes simulées restent en attente après 60 secondes
  virtuelles malgré un délai configuré à 2 secondes. Un cinquième test confirme
  qu'aucune requête SQL de secours n'est lancée et qu'un second cycle ne travaille
  pas tant que la première lecture Redis n'est pas libérée.
- Recommandation : protéger toutes les nouvelles commandes, conserver la reprise
  de connexion existante et vérifier que le secours SQL peut progresser après un
  dépassement de délai. Ne pas rejouer aveuglément une écriture dont le résultat
  est inconnu.

### P1 — Une acceptation interrompue peut empêcher tout relais ultérieur

- Sources backend : `src/trip-requests/dispatch/sequential-dispatch.service.ts:32`
  et `:70`, `src/trips/save-request-trip.ts:55`,
  `src/trip-requests/trip-requests.service.ts:1781`, `:1813`, `:1840`, `:1853`.
- Le trajet privé est enregistré avant la réservation puis avant l'attribution
  définitive de la demande. Entre ces étapes, le relais détecte ce trajet et
  repousse son travail de cinq secondes, sans expirer l'invitation.
- Si le processus s'arrête à ce moment, ou si une étape ultérieure échoue sans
  compensation, cette attente n'a pas de limite propre. Elle peut durer jusqu'à
  l'expiration de la demande. Le rattrapage des conducteurs déjà sélectionnés ne
  couvre pas une demande dont `selectedDriverId` et `tripId` sont encore nuls.
- Reproduction SQL locale : trajet provisoire sans réservation, invitation échue
  depuis cinq minutes, trois passages du traitement. L'invitation reste `pending`,
  aucun autre conducteur n'est sollicité et la demande reste non attribuée.
- Recommandation : état explicite d'acceptation en cours avec échéance de reprise ;
  reprendre la finalisation si une réservation existe, ou libérer sans danger un
  trajet réellement vide. Préserver les verrous et l'interdiction de double attribution.

### P1 — Une contre-proposition est assimilée à une absence de réponse

- Sources backend : `src/trip-requests/trip-requests.service.ts:1203`, `:1422`,
  `src/trip-requests/dispatch/sequential-dispatch.service.ts:24`, `:71` et
  `src/trip-requests/dispatch/sequential-policy.ts:20`.
- Le conducteur peut envoyer une offre alternative. La demande devient
  `offers_received`, mais l'invitation conserve son échéance initiale. Le relais
  traite ce statut comme toujours ouvert et passe au conducteur suivant.
- L'offre alternative reste pourtant `pending`. Lorsque le passager l'accepte,
  le contrôle de l'invitation expirée refuse l'opération. Le conducteur a bien
  répondu ; le résultat affiché n'est plus cohérent avec ce qui reste autorisé.
- Reproduction locale à partir de l'état SQL produit par une contre-proposition :
  relais au suivant, offre alternative toujours en attente, garde d'acceptation
  refusant l'ancien conducteur. Ce test n'exécute pas le parcours HTTP complet de
  création puis d'acceptation de la contre-proposition.
- Recommandation : distinguer l'attente de réponse du conducteur de l'attente de
  décision du passager, avec des échéances propres et des offres explicitement
  retirées lorsqu'elles ne sont plus acceptables.

### P2 — Les 40 secondes incluent le transport et le chargement

- Sources backend : `src/trip-requests/dispatch/sequential-dispatch.service.ts:97`,
  `:104`, `:115`, `src/notifications/notifications.service.ts:583`, `:834` et
  `src/trip-requests/dispatch/dispatch.service.ts:56`.
- Le délai commence lors de l'insertion SQL, avant l'envoi effectif. Les accusés
  `received`/`displayed` ne déplacent pas cette échéance. Une notification affichée
  30 secondes plus tard laisse au plus 10 secondes, chargement de l'application compris.
  Si elle arrive après l'échéance, elle est devenue périmée sans que le conducteur
  ait nécessairement vu quoi que ce soit.
- Pour une acceptation programmée, les validations et la préparation du trajet
  précèdent aussi le contrôle final sous verrou. Un clic avant l'échéance ne
  signifie donc pas forcément que l'acceptation est enregistrée avant l'échéance.
- Ce comportement est confirmé par le code et par l'essai de délai sans aucun
  accusé de réception ; aucune latence réelle Firebase/APNs n'a été mesurée ici.
- Recommandation : décider explicitement si les 40 secondes couvrent toute la
  tentative de contact ou une fenêtre de réponse après présentation. Dans le
  second cas, séparer un délai maximal de livraison et un délai de réponse,
  sans dépendre indéfiniment d'un accusé mobile absent. Réserver une acceptation
  valide avant les opérations longues, avec une reprise bornée.

### P2 — Le nouveau délai n'est pas expliqué dans la fiche programmée

- Source mobile : `features/request-detail/RequestDriverDecision.tsx:57`.
- Les boutons permettent de choisir le véhicule et les options, mais cette fiche
  n'affiche pas le temps restant de l'invitation séquentielle. Le conducteur peut
  donc préparer sa réponse sans savoir qu'il perd son accès après quelques secondes.
  Ce constat concerne la fiche de commande programmée, pas tous les écrans natifs.
- Recommandation : exposer l'échéance serveur à cette fiche, afficher le temps
  restant et un état clair lorsque la demande a été transmise au suivant.

## Détection exacte des 40 secondes

1. Le serveur sélectionne un conducteur éligible, crée une invitation `pending`
   et sa notification dans la même transaction SQL.
2. `expiresAt = min(heure SQL de création + 40 secondes, fin de la demande)`.
   La constante est `REQUEST_RESPONSE_MS = 40_000` dans `sequential-policy.ts:4`.
3. Redis conserve cette échéance dans `ride-requests:deadlines` et les identifiants
   des prochains conducteurs dans la liste propre à la demande.
4. Le cron `@Cron('* * * * * *')` demande un traitement chaque seconde. Il lit les
   échéances Redis puis les invitations SQL `pending` dont `expiresAt <= now()`.
5. Sous verrou, le service revérifie la demande. Sans acceptation, sans refus déjà
   traité et hors cas bloquant décrit plus haut, il marque l'invitation `expired`,
   désactive sa notification serveur, puis prépare celle du conducteur suivant.
6. Un refus authentifié appelle directement ce traitement : il n'attend pas la fin
   des 40 secondes. Une acceptation valide ferme le relais et protège l'attribution.

**Il n'existe pas de webhook externe détectant le silence.** Le callback HTTP
reçoit un refus authentifié ; l'absence de réponse provient du traitement serveur.
Ouvrir l'application, voir la notification ou toucher l'écran ne vaut pas
acceptation. Le serveur constate « aucune décision enregistrée avant l'échéance »,
pas « le conducteur a volontairement ignoré une notification qu'il a vue ».

La sélection est recalculée à chaque relais : Redis conserve une fenêtre de
candidats ordonnés par proximité, reconstruite à partir de SQL si nécessaire.
Un conducteur déjà invité à cette même demande n'est pas sollicité à nouveau.
Les demandes ciblant une personne précise restent privées ; elles ne sont pas
automatiquement ouvertes aux autres après un refus ou un silence.

## Vérifications réalisées

Environnement : Node 24.22.1, PostgreSQL/PostGIS jetable, Redis local isolé sur un
port réservé aux essais. Aucun accès aux valeurs de `.env`, aucun appel de
notification réel, aucune modification des bases existantes ni d'AWS.

- **14 scénarios d'intégration existants relancés avec succès** : invitation unique,
  refus, doublon, concurrence, acceptation, annulation, perte de l'échéance Redis,
  panne explicite, contrôle des accès et callback HTTP.
- **Un essai avec 40 secondes réellement écoulées**, sans avancer artificiellement
  l'horloge ni l'échéance SQL : relais observé à **40 578 ms** depuis le début de
  l'essai, soit **518 ms après l'échéance SQL**. Le test appelait la méthode du cron
  environ chaque seconde ; il ne valide pas le planificateur Nest complet en charge.
- **Deux reproductions SQL** : acceptation provisoire interrompue et offre alternative
  périmée toujours affichable comme en attente.
- **Cinq reproductions unitaires** avec temps virtuel : quatre commandes Redis non
  protégées et un cycle de cron bloqué avant le secours SQL.

Les **22 vérifications atteignent leurs assertions**. Sept d'entre elles démontrent
des défauts présents : ce résultat n'est donc pas un feu vert de mise en production.
Les deux fichiers de test temporaires ont été retirés après exécution ; les suites
existantes et le code métier n'ont pas été modifiés par cet audit.

Limites : pas d'essai de charge, pas de push réel, pas de téléphone physique,
pas de validation de réveil d'écran ni de sonnerie iOS/Android. Les bons résultats
SQL ne certifient pas la réception ni l'audibilité d'une notification. La file reste
une modification locale nécessitant sa migration et son déploiement ; l'audit ne
prouve pas que cette version est celle actuellement exécutée en production.
