# Recette locale des changements — 28 octobre 2026

## Périmètre et conclusion

Demande : vérifier les modifications récentes sans casser les parcours existants.
La campagne couvre les changements présents dans l’arbre de travail : lectures
de l’accueil/détail, carte des véhicules, adresses partagées, annonces de paiement
passager/conducteur et explication du portefeuille. Elle relance aussi les
parcours serveur de demandes, réservations et paiements ainsi que les alertes
natives Android.

**Les vérifications exécutées passent. Ce n’est pas une validation intégrale
de l’application sur téléphones physiques.** Les chaînes locales ci-dessous
sont distinctes ; elles ne constituent pas une session unique allant de la vraie
connexion mobile jusqu’à Firebase et à un paiement opérateur.

## Résultats effectivement obtenus

| Vérification | Résultat | Ce qui a réellement été exécuté |
| --- | --- | --- |
| Gate mobile `scripts/check-release.cjs` | 2 892 réussis, 0 échec, 1 ignoré | Tests JS, TypeScript, ESLint global, frontières réseau, tailles, compatibilités URI/Metro, parité des sources natives |
| Nouveaux parcours `recentChangesHttpJourney.test.js` | 7 réussis, 0 échec | Formulaires/hooks réels, RTK Query et serveur HTTP loopback ; API métier simulée, cycle React et synthétiseur simulés |
| Demandes/relais et trajets partagés backend | 75 réussis, 0 échec, 1 ignoré | PostgreSQL/PostGIS et Redis temporaires ; deux parcours transversaux avec le client d’actions mobile, HTTP Nest, ordonnanceur et faux fournisseur push |
| Paiements et portefeuille backend | 74 réussis, 0 échec | 12 tests PostgreSQL sur paiements mixtes/repli cash et 62 tests unitaires des services portefeuille/retrait |
| Matrice native Android | 17 scénarios réussis | Code Java de production compilé dans le banc isolé `com.zwanga.audit`, émulateur Android API 36 |
| Service audio Android | 10 scénarios réussis | Lecteur/service natifs, focus audio et affichage SystemUI observés dans le même banc |

Les 7 nouveaux parcours ont été ajoutés **après** la passe globale : ne pas
les présenter comme faisant partie de cette exécution des 2 892 tests. Ils sont
désormais découverts automatiquement par le gate. Les contrôles de lint des
fichiers ajoutés, frontières réseau, taille et `git diff --check` sont également
relancés avec succès. Aucun code fonctionnel de production n’a été modifié pour
faire passer cette campagne.

Le test mobile ignoré exige Ruby pour vérifier une politique de cibles iOS.
Le test backend ignoré est le benchmark opt-in multi-réplicas
`DISPATCH_TEST_LOAD=1`, non activé ici. Ce ne sont pas des succès implicites.

## Parcours récents

### Position sélectionnée, publication et demande

Le nouveau test traverse le vrai formulaire de publication simple/récurrente,
la résolution partagée, l’endpoint RTK de géocodage et la mutation HTTP. Il
vérifie l’adresse lisible envoyée, les coordonnées inchangées, le prix, les
places et l’absence de double publication après deux appuis. La lecture du
trajet simple avec le mapper réel conserve ensuite le lieu lisible, sans
« Ma position ».

Côté demande, le formulaire, la résolution et la mutation RTK sont également
enchaînés. Deux cas sont exécutés : géocodeur disponible et erreur HTTP 503.
L’échec conserve le point sur la carte avec un libellé neutre ; aucun faux lieu
n’est inventé. La création ne se répète pas et la navigation vise le détail de
la demande créée. Le géocodeur et la persistance de cette nouvelle fixture sont
simulés en mémoire : aucun appel Google, GPS réel ou stockage métier durable.

### Paiement et portefeuille vocal

Le résumé du portefeuille traverse HTTP, le mapper RTK, le hook d’écran, le
registre partagé et le moteur d’annonces. Les assertions contrôlent le solde
effectif, la politique serveur interdisant le retrait des jetons, l’absence de
répétition pour un même solde et l’arrêt à la sortie de l’écran.

Les annonces passager et conducteur traversent leurs vrais modèles, le hook
visible et le moteur vocal avec un montant réduit de 800 FC. Elles lisent ce
montant confirmé et s’arrêtent lorsque l’application quitte le premier plan.
Le reçu utilisé dans ces deux tests est une donnée synthétique, pas le résultat
d’une transaction financière effectuée dans ce test.

Le gate couvre aussi les cas mixtes jetons/cash, montants incertains, bonus,
réserves, restrictions de retrait, changement de compte, écran masqué,
déduplication et priorité des instructions GPS. **Expo Speech est simulé** :
aucun de ces tests n’atteste l’audibilité ou la qualité de la voix sur appareil.
Le moteur exclut actuellement les émulateurs via `Device.isDevice` ; ce garde
n’a pas été désactivé dans l’application.

### Performance et reprise

Les tests existants relancés contrôlent l’arrêt des lectures hors écran,
les intervalles de secours selon l’état du socket, les changements de compte,
les décisions pendant actualisation et le regroupement des marqueurs denses.
Ce sont des contrôles de comportement JS ; aucun FPS, mémoire, batterie ou
échauffement physique n’a été mesuré dans cette campagne.

## Chaîne locale mobile → backend → relais

Le runner existant du backend démarre PostgreSQL/PostGIS et Redis isolés, puis
les contrôleurs/services Nest et un récepteur HTTP remplaçant Firebase. Le
client importe les parseurs, endpoints et actions mobiles réels. L’identité
HTTP est injectée par une garde de test ; il ne teste pas le login JWT réel.

Les deux parcours transversaux vérifient notamment :

- création puis premier destinataire ; exclusion de l’auteur et d’un conducteur
  hors périmètre ; reçu d’affichage accepté seulement pour le destinataire ;
- refus avec passage au conducteur suivant et refus rejoué sans saut de file ;
- deux expirations successives de 40 secondes, avec le vrai temps écoulé et
  le cron Nest, y compris après la durée initiale de vie de la file Redis ;
- acceptation finale, un seul appel métier malgré un double appui, demande
  masquée aux anciens destinataires et absence de nouveaux envois ensuite.

Mesures locales de cette passe : **242 ms et 150 ms** entre la création HTTP et
la première réception par le faux fournisseur ; **40 869 ms et 41 184 ms** pour
les deux relais à échéance de 40 secondes. Ces mesures ne sont pas les délais
de livraison d’un push réel ni une estimation de la production.

Les reçus de ces parcours utilisent la simulation JavaScript : l’émulateur
n’est pas branché dans cette même chaîne backend. Les essais natifs suivants
injectent leurs propres événements synthétiques.

## Paiements avec PostgreSQL temporaire

Les suites mixtes/repli cash vérifient les écritures réellement persistées,
le débit unique malgré des appels concurrents, le rollback en cas d’échec
comptable, la préservation d’une subvention déjà créditée, les montants
obsolètes, le propriétaire et l’état de la réservation.

Le repli cash vérifie aussi une recharge confirmée tardivement, qui crédite
une seule fois le portefeuille sans être dépensée sur le trajet passé en
espèces, et la concurrence entre capture de jetons et choix du cash.
Prestataires de paiement, notifications externes et identité utilisateur
restent simulés. Aucun argent réel ni donnée de production.

## Android : visibilité, son et transitions

Le banc utilise les sources Java canoniques du projet et sa ressource sonore.
Il est compilé hors ligne et installé uniquement sous `com.zwanga.audit` ; les
données de l’application `com.zwanga` ne sont pas effacées. Compilation réussie.

La matrice de 17 scénarios couvre notamment le prix/destination/actions, les
doublons, le repli si Notifee échoue, une réservation arrivée tardivement,
l’auteur non alerté, les offres expirées, la reprise WorkManager, le réveil de
l’écran et les cas plein écran accordé/refusé. Avec seul consentement local et
permission Android refusée, seule la carte apparaît. Avec la permission système,
l’activité plein écran est réellement observée au premier plan de l’émulateur.
Téléphone déverrouillé, elle ne vole pas le premier plan.

Les 10 scénarios audio couvrent une publication tardive sans prolonger le délai,
la bannière encore observable après 8 secondes, une notification concurrente
audible, les pertes temporaires/atténuation du focus et leur reprise, la perte
permanente du focus, veille/déverrouillage, entrée et transfert vers le lecteur
de premier plan, suppression après décision et échéance métier.

Le transfert du lecteur de premier plan est commandé par le banc : ce n’est
pas une ouverture réelle du détail React Native suivie d’un appui utilisateur.
Le démarrage du service est permis par l’activité du banc ; l’exemption FCM de
démarrage en arrière-plan n’est pas testée. Les assertions observent l’état du
lecteur natif, pas le son entendu par une personne sur un téléphone physique.

Le rendu logiciel `-PauditSoftwareRendering=true`, déjà disponible dans le banc,
a été utilisé pour isoler les blocages graphiques gfxstream connus de l’émulateur.
Aucun changement du rendu de production. Les avertissements ADB « Activity not
started » indiquent une réutilisation de l’activité ; les assertions et codes
de sortie de ces deux passes sont réussis. Aucune garantie universelle de
bannière persistante ou d’absence de crash sur Samsung/iPhone n’en découle.

## Outillage ajouté et précautions

- `tests/recentChangesHttpJourney.test.js` : les 7 nouveaux parcours décrits
  ci-dessus ; réseau loopback et réponses synthétiques, arrêt du serveur et
  remise à zéro du cache après chaque cas.
- `tests/helpers/localOnlyNetwork.cjs` : préchargement réservé aux tests,
  refusant les connexions TCP hors `127.0.0.1`/`::1` et les sockets de chemin.
- `scripts/audits/test-local-payment-paths.cjs` : lance les quatre suites de
  paiement/portefeuille du dépôt voisin avec un environnement minimal, sans
  charger les secrets du projet, et le garde réseau ci-dessus.

Le premier essai des nouveaux parcours échouait sur les deux publications car
Node tentait de charger un sélecteur de date natif. Les frontières natives ont
été simulées explicitement, sans remplacer les modèles de coordonnées ni les
formulaires. Les assertions passent alors. Une attente de 60 secondes provenait
du timer de secours de `fetchBaseQuery` sous Node : la fixture HTTP utilise
désormais un délai local de 2 secondes ; les délais de paiement de production
et les politiques de cache ne sont pas modifiés. Passe finale : 7 succès en
environ 3,5 secondes. Le petit traceur temporaire créé pour ce diagnostic a été
retiré ; ses résultats restent dans le journal local de diagnostic.

Un premier lancement Gradle tentait d’obtenir la distribution malgré le mode
hors ligne : reprise avec la distribution 8.14.3 déjà en cache, puis succès.
Les premières tentatives échouées ne sont pas comptées parmi les succès.

## Relancer

Depuis la racine mobile, avec Node 24 et les dépendances déjà installées :

```powershell
node scripts/check-release.cjs
node --test tests/recentChangesHttpJourney.test.js
# Chemin local de l'installation PostgreSQL/PostGIS, pas une URL de base.
$env:MIXED_CASH_TEST_POSTGRES_BIN = 'C:/Program Files/PostgreSQL/18/bin'
node scripts/audits/test-local-payment-paths.cjs
```

La chaîne de relais se relance avec `test/run-sequential-dispatch.cjs` dans
`zwanga-backend`, les deux suites `sequential-dispatch.postgres.spec.ts` et
`shared-trip-postgres.spec.ts`, `DISPATCH_TEST_POSTGRES_BIN` renseigné et
`RIDE_AUDIT_MOBILE_ROOT` pointant vers le dépôt mobile. Elle exige Redis local
via WSL et les binaires PostgreSQL/PostGIS, jamais une base partagée.

Les scripts Android sont `scripts/audits/test-native-ride-delivery.cjs` et
`scripts/audits/test-ride-audio-service.cjs`. Ils doivent s’exécuter **en série**
sur un émulateur dédié avec le banc compilé/installé, les variables
`RIDE_AUDIT_ADB`, `RIDE_AUDIT_SERIAL` et un répertoire `RIDE_AUDIT_OUTPUT` local.
La passe audio de cette campagne est complète : `RIDE_AUDIT_AUDIO_ONLY` non activé.

## Traces et limites restantes

Journaux locaux, non versionnés :

- `.expo/all-changes-e2e-release-20261028.log`
- `.expo/all-changes-e2e-http-final-20261028.log`
- `.expo/all-changes-e2e-backend-20261028.log`
- `.expo/all-changes-e2e-payments-final-20261028.log`
- `.expo/all-changes-e2e-native-build-cached-20261028.log`
- `.expo/all-changes-e2e-native-20261028/native-matrix.json`
- `.expo/all-changes-e2e-audio-20261028/results.json`
- `.expo/all-changes-e2e-audio-20261028/systemui-after-8s.txt`

Restent à exécuter avant de parler de validation complète : parcours tactiles
de la vraie application avec le JavaScript actuel et comptes locaux, voix réelle
sur Android/iPhone, appareil Samsung physique verrouillé/déverrouillé, réception
FCM/APNs réelle, géolocalisation réelle en veille, build iOS/macOS et sandbox du
prestataire de paiement. Ni push réel ni connexion/paiement en production n’ont
été déclenchés. Aucun déploiement, migration de production, modification de règle
financière, fusion Git ou changement de permission de l’application réelle.
