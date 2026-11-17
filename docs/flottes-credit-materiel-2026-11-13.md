# Flottes et crédit matériel — 13 novembre 2026

> Suivi du 15 novembre : le flux est désormais préparé aussi pour les casques, traceurs GPS, matériels de livraison et autres équipements, avec catalogue serveur et offres correspondantes dans le portail. Les véhicules restent à venir. Voir l'entrée « Conducteurs interurbains et acquisition de matériel à crédit » du [journal technique](CHANGEMENTS_TECHNIQUES.md). Le présent document conserve les résultats historiques des 13 et 14 novembre, sans activation en production.

## Périmètre et décisions validées

Préparation locale du mobile, de `zwanga-backend` et de `zwanga-partner`. Aucun déploiement, aucune migration sur une base existante, aucun prélèvement ni message réel.

Le conducteur peut demander un téléphone à crédit, consulter une offre, accepter ses conditions et suivre son remboursement. La règle standard validée est **5 % de commission + 5 % de remboursement matériel**, puis seulement la commission quand le crédit est soldé. Les éventuels régimes de commission déjà présents ne sont pas réécrits.

- Un trajet cash ne rembourse le matériel que par un débit effectivement réussi du solde rechargé. La part non prélevée reste due.
- Les jetons de fidélité et les sommes réservées ne sont pas consommés par ce nouveau prélèvement. Un portefeuille bloqué ne peut pas être débité.
- Une recharge seule ne rembourse rien. Le conducteur choisit et confirme son remboursement volontaire.
- Les 5 % de remboursement sont globaux, même avec plusieurs contrats ; allocation par ancienneté et plafonnement au capital restant. Aucun intérêt ni frais supplémentaire automatique.
- Les types téléphone, véhicule et équipement existent dans le modèle ; seul le téléphone est ouvert. Les autres financements ne sont pas commercialisés automatiquement.

## Suivi du 14 novembre

Les résultats ci-dessous décrivent l'étape du 13 novembre. Depuis, les conditions propriétaire ont été confirmées : montant fixe périodique et versements externes déclarés puis confirmés. Cette suite est documentée dans [versements propriétaires](flottes-versements-proprietaires-2026-11-14.md), avec pagination des affectations/versements et nouveaux résultats de validation. Le blocage TypeScript des anciennes fixtures backend est levé. Les autres limites non explicitement traitées restent ouvertes.

## Crédit réellement implémenté

### Backend et comptabilité

`src/asset-credit/` expose les candidatures, offres, consentements, activation après remise, historique et remboursement volontaire. Les routes conducteur sont liées à l’identité authentifiée, sans identifiant conducteur fourni pour dépenser. L’administration consulte avec ADMIN ; émission d’offre et remise nécessitent SUPER_ADMIN. DTO validés, UUID et limites de fréquence.

La migration `1780000124000-AssetCredits.ts` ajoute produits, candidatures, contrats, événements, mouvements et clés d’idempotence. Le contrat conserve les conditions acceptées et la version de la politique. Acceptation et remise exigent un KYC approuvé. La remise demande une référence de contrôle et une référence du matériel ; un même matériel ne peut pas être financé deux fois, même après solde, pour préserver une possible correction du premier contrat.

`sql/asset-credit-collections.ts` exécute l’allocation dans la transaction financière : verrou du portefeuille avant verrou de crédit pour le cash, sérialisation par conducteur, précision de 0,1 FC correspondant au centième de jeton existant. Montants du crédit stockés en unités mineures CDF. Les mouvements comptables distinguent remboursement, dette non prélevée et correction.

`driver_earnings.assetRepaymentAmount` garde la retenue distincte de la commission. Le net historique stocké conserve son sens ; les réponses client et soldes disponibles soustraient la retenue une seule fois (`earning-credit.ts`, `DriverSettlementsService`). Le mobile affiche explicitement la part matériel déjà déduite. Aucun prélèvement rétroactif sur les gains antérieurs à la remise.

Une mutation de remboursement volontaire rejouée avec le même UUID et le même contenu renvoie son résultat sans second débit. Les modifications électroniques à la baisse annulent la part matériel effectivement collectée ; elles peuvent rouvrir un crédit soldé. Une correction à la baisse d’un cash déjà traité est volontairement refusée avec `ASSET_CASH_RECONCILIATION_REQUIRED` : une réconciliation opérateur reste nécessaire, aucun remboursement cash n’est inventé.

### Mobile

- `ServicesScreen.tsx` : entrée Téléphone à crédit ; `app/services/credit/index.tsx` : candidature et contrats.
- `app/services/credit/[id].tsx` : restant, réellement remboursé, dû cash inclus dans le restant, contrat, accord explicite, remboursement choisi et historique.
- `store/api/assetCreditApi.ts`, `assetCreditModel.ts`, `types/earnings.ts`, `DriverEarningRow.tsx` : contrats réseau et affichage des montants.
- L’intention de remboursement est enregistrée avant le POST, par compte et contrat. En cas de réponse perdue ou fermeture, la même opération est reprise. Le formulaire ne propose pas un nouveau débit tant que l’opération est incertaine. Une transition de session, d’écran ou d’arrière-plan pendant l’enregistrement local empêche un nouveau POST ; une réponse tardive ne modifie pas le nouvel écran.
- Les nouvelles routes crédit/flotte sont déclarées dans `ProtectedAppStack.tsx`. Pas de nouveau module natif, modal système, audio ou polling ; lectures suspendues hors écran actif.

### Portail

`app/(espace)/credits/page.tsx`, `lib/api/asset-credit.ts` et le lien administratif de `app-shell.tsx` exposent candidatures, émission d’offre, contrôle de remise, contrats et mouvements. Toutes les opérations passent par le proxy backend authentifié, jamais par les données simulées du portail. Les valeurs contractuelles sont saisies par un opérateur habilité ; le logiciel ne valide pas juridiquement un contrat.

## Flottes réellement implémentées

Il s’agit d’un **registre opérationnel et d’affectations consenties**, pas encore d’une gestion financière complète du propriétaire.

- Mobile `app/services/fleet.tsx`, `fleetRegistryApi.ts` : création d’un espace propriétaire individuel via le parcours partenaire existant, état des espaces, invitations et conditions, acceptation/refus, affectations actives et historique.
- Backend `partners/fleet-registry.*` et migration `1780000125000-FleetRegistry.ts` : registre, contrôle des véhicules, proposition d’affectation, réponse du conducteur, clôture et pause des nouvelles affectations. Contrôles d’appartenance à l’organisation et de rôle ; lecture seule pour les profils non gestionnaires et organisations suspendues.
- Portail `components/fleet-registry.tsx`, `lib/api/fleet-registry.ts`, page `flottes-controle` : tableau des véhicules, ajout, validation par un administrateur Zwanga, affectation avec conditions, clôture confirmée. La capacité serveur `fleet.registry` sélectionne ces vues réelles. Le proxy ne complète plus ces organisations avec des permissions ou résultats financiers simulés.
- Un véhicule doit être contrôlé, correspondre à un véhicule actif de Zwanga et être déjà utilisable par le conducteur dans le modèle existant. Une affectation n’en transfère pas la propriété, n’accorde pas de nouveaux droits de conduite et ne modifie pas le dispatch.
- Un conducteur et un véhicule ne peuvent pas avoir deux affectations ouvertes. Consentement explicite et KYC valide à l’acceptation. La clôture d’une affectation active est refusée si des trajets à venir/en cours utilisent encore ce véhicule.
- « Suspendre les affectations » ne désactive pas le véhicule dans le système de courses. Ce libellé remplace « Hors service », qui aurait été trompeur.
- L’entrée Flottes du mobile mène maintenant à ce service de compte, distinct de l’ancien catalogue de dossiers de financement ; Documents et les autres offres conservent leur fonctionnement.

## Vérifications mesurées

- PostgreSQL 17 isolé : **17 tests réussis** crédit/flotte, migrations et fonctions SQL réelles, débit cash partiel, dette, reprise idempotente, concurrence, limites de capital, inversion électronique, permissions, KYC et affectations. Le scénario HTTP crédit utilise Nest, validation DTO, contrôle de rôle et base réelle, avec identité de test injectée : ce n’est pas un test de connexion JWT de production.
- Suite financière cash historique avec coexistence crédit : **125 tests réussis, 3 ignorés**. Commission habituelle et remboursement matériel sont testés ensemble sur les migrations réelles du banc financier. Les clusters contiennent uniquement des fixtures et sont arrêtés/nettoyés par le banc.
- Trois suites financières de service existantes : **35 tests réussis**.
- Portail : **100 tests Vitest réussis** ; TypeScript sans émission ni cache incrémental réussi. Les tests du proxy et du portail utilisent des doubles réseau ; ils ne remplacent pas les tests PostgreSQL.
- Mobile : **40 tests ciblés réussis** crédit/services/finance, **20 tests réussis** crédit/onglets/protection des routes, et **3 tests flotte réussis** (accord, refus, inactivité et contrat API). Certaines suites ciblées se recoupent : ne pas additionner ces nombres. Un cas vérifie les transitions pendant la persistance d’un remboursement.
- Première passe mobile globale : 3 807 réussites, 2 échecs, 1 ignoré. Les échecs ont révélé une route Services non déclarée sous la protection de session et un double de navigation manquant dans un test ; les deux ont été corrigés et leurs suites repassées.
- **Passe finale complète `node scripts/check-release.cjs` réussie (code 0)** : 3 810 tests réussis, 1 ignoré, environ 617 s pour la suite JavaScript ; TypeScript, ESLint, frontières réseau, taille de sources et vérification de parité des sources natives réussis. Les trois tests `fleetRegistry.test.js`, ajoutés après l’énumération de cette passe, ont été exécutés séparément avec succès. La parité des sources ne compile pas Android/iOS. Une nouvelle passe PostgreSQL finale des 17 tests réussit après la protection du retour arrière pour les candidatures.
- Aperçus des composants réels via React Native Web (`scripts/preview-credit.cjs`), fixtures sans API : 390 × 844, 320 × 568 et texte à 160 %. Aucun débordement horizontal mesuré, actions accessibles ; le contrat actif est repliable. Captures dans `.expo/credit-preview/`, pas des captures Android/iOS.
- Compilation TypeScript de production backend réussie. Le contrôle TypeScript incluant tous les anciens tests reste bloqué par trois erreurs préexistantes dans `accepted-request-outbox.spec.ts` et `driver-category.spec.ts` ; elles ne sont pas masquées ni corrigées dans ce chantier.

## Limites et préparation d’une livraison

1. Rien n’est déployé. Appliquer et vérifier les migrations backend dans un environnement de recette avant de publier mobile/portail. Sauvegarde et plan de réconciliation requis : les migrations refusent un retour arrière automatique dès que des contrats/véhicules existent.
2. Aucun essai physique Android/iOS, aucune compilation native, aucune validation de push/SMS ni fournisseur financier externe. Aucun engagement d’absence de crash natif ou de tenue en charge déduit de ces tests.
3. Flottes : les règles de revenu propriétaire (forfait, périodicité, pourcentage, frais) restent à préciser. Pas de loyers automatiques, partage de revenus, transferts de propriété, nouveau droit de conduire un véhicule tiers, télémétrie propriétaire ou gestion de maintenance complète. Le registre ne prétend pas remplacer ces fonctions.
4. Contrats : validation juridique/opérationnelle et justificatifs de remise vérifiés hors logiciel et référencés ici. Pas de signature électronique certifiée, inventaire matériel, assurance, recouvrement automatique ou refinancement.
5. Listes bornées à 100 éléments ; une pagination complète et un export de rapprochement restent à préparer. Totaux de capital/remboursement/dette viennent du contrat, jamais d’une somme de la dernière page.
6. Offres et invitations visibles à l’ouverture/actualisation des Services ; pas de nouvelles notifications push. Le fonctionnement des alertes de commandes existantes n’a pas été modifié.
7. La création d’espace propriétaire réutilise l’API partenaire existante, sans idempotence persistante nouvelle. Après un résultat réseau incertain, vérifier les espaces existants avant une nouvelle création. L’émission d’offre du portail conserve son UUID pendant la saisie, mais pas après rechargement de la page ; consulter la liste avant de recréer une offre.

Les guides PostgreSQL et UI ont orienté les verrous courts, contraintes, permissions, séparation des mouvements comptables et présentation compacte. Ils ne remplacent ni validation réglementaire ni essais sur appareil.
