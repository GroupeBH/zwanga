# Services et formules de crédit — 17 novembre 2026

## Périmètre et décisions

Mobile Zwanga et `zwanga-backend`, autorisés sans déploiement. L’accueil Services était un annuaire long et ne mettait pas les actions du conducteur en évidence. Les deux maquettes fournies servent de référence visuelle : premier dossier et crédit en cours.

Décisions explicites : téléphone disponible ; autres équipements à venir ; véhicule réservé à un conducteur ayant au moins neuf mois d’activité réelle, avec un trajet avec passager tous les deux jours. Les mensualités sont choisies parmi les formules de chaque offre. Le demandeur peut commenter son dossier et doit comprendre le coût total, les frais, les pourcentages et le contrat avant de donner son accord.

## Mobile : modifications appliquées

- `features/pro-services/ServicesScreen.tsx`, `ServicesDashboard.tsx`, `ServicesDashboard.styles.ts`, `servicesDashboardModel.ts` : accueil compact, blanc et bleu nuit, priorité orange, flotte avec badge Pro. Bloc de préparation des documents pour un nouveau conducteur ; offre reçue ou échéance réelle pour un crédit en cours ; accès aux dossiers, crédits, acquisition et flotte. Livraison, scolaire et santé sont regroupés dans « Bientôt sur Zwanga », sans action simulant une disponibilité.
- `ServiceLayout.tsx` : variante compacte et actions d’en-tête, sans modifier les espacements par défaut des autres formulaires. Recherche locale de service, historique séparé dans `app/services/history.tsx`, enregistré dans le groupe authentifié de `components/ProtectedAppStack.tsx`. Pagination et actualisation des dossiers conservées.
- Pas de date d’assurance, de nombre de documents validés ni d’échéance inventés. Le dossier existant concerne l’acquisition de documents : l’accueil ne prétend pas constituer un nouvel écran KYC. « À traiter » privilégie une offre à accepter, sinon le premier crédit actif de la liste existante ; ce n’est pas un classement de toutes les dettes par urgence.
- `app/services/credit/index.tsx` : téléphone sélectionnable selon la disponibilité serveur ; casques, GPS, matériel de livraison et autres équipements « À venir ». Véhicule sélectionnable uniquement si le serveur déclare explicitement l’éligibilité. Une ancienne API sans ce champ ne permet pas de contourner le contrôle. Un ancien contrat reste accessible même si les nouvelles acquisitions du même équipement sont fermées.
- `CreditHowItWorks.tsx` : explications courtes accessibles à la demande. Déclaration de besoin non engageante ; offre chiffrée et contrat ; accord puis remise du bien avant prélèvement. Pour le cash, prélèvement sur le solde, reliquat non payé restant dû. Une recharge seule ne rembourse pas automatiquement le crédit : le remboursement volontaire nécessite son action et sa confirmation.
- `CreditRequestComment.tsx`, `store/api/assetCreditApi.ts` : commentaire initial et modification de ce commentaire tant que le dossier est soumis, avec limite de 1 000 caractères. Ce champ est une note modifiable, pas une conversation avec historique. Verrou contre les doubles appuis et abandon des réponses UI après changement de compte, fermeture ou passage en arrière-plan.
- `CreditPlanChoice.tsx`, `app/services/credit/[id].tsx` : choix explicite de durée, montant mensuel, dernier versement différent si nécessaire, frais et coût total issus de l’API. Changer de formule efface le consentement précédent. Aucune acceptation sans formule valide lorsqu’une offre en propose plusieurs.

Les formules ajoutées modifient uniquement la durée : **même prix total, mêmes frais fixes et même pourcentage de revenu pour toutes les durées d’une offre**. Aucun intérêt composé, taux supplémentaire ou pénalité n’est introduit. Les mécanismes existants d’estimation par revenus, d’échéancier, de cumul des pourcentages, de commission et de remboursements restent utilisés.

## Backend : règles et persistance

Fichiers principaux : `src/asset-credit/asset-credit-products.ts`, `asset-credit.controller.ts`, `asset-credit.dto.ts`, `asset-credit.service.ts`, `repayment-plans.ts`, `vehicle-credit-eligibility.ts`, ainsi que `src/database/migrations/1780000133000-AssetRepaymentPlans.ts` et l’index des migrations.

### Disponibilité et activité véhicule

- Les nouvelles demandes et offres d’équipements futurs sont refusées côté serveur, indépendamment d’un ancien indicateur d’activation. Téléphone et véhicule restent soumis aux indicateurs serveur existants.
- Le véhicule exige une continuité sur les neuf derniers mois calendaires : **aucun intervalle supérieur à 48 heures**, y compris entre le dernier trajet et la vérification. Le point antérieur au début de période permet de vérifier aussi la première borne. Les jours de fin de mois sont ajustés au calendrier UTC.
- Seuls les trajets terminés avec une réservation terminée, un passager différent du conducteur, une prise en charge et une dépose enregistrées, avec dates cohérentes et non futures, sont retenus. Publier un trajet vide ou posséder un compte ancien ne suffit pas.
- Vérification au catalogue, à la création du dossier, à l’émission d’une nouvelle offre et à son acceptation. Pas de révocation automatique d’un contrat déjà accepté ou actif ; activation et remboursement conservent leurs règles précédentes.
- C’est une vérification de l’activité **enregistrée**, pas une certification anti-collusion ni une preuve physique indépendante. L’absence d’historique probant rend le conducteur inéligible ; aucune reconstitution ni correction des anciennes données n’est effectuée.
- Requête paramétrée limitée au conducteur, utilisant les index existants conducteur/trajet et réservation/trajet. Aucun test de charge sur les volumes de production n’a été effectué.

### Formules et commentaires

- Une offre peut déclarer jusqu’à six `repaymentPlans` : identifiant stable unique et durée entière de 1 à 120 mois, compatibles avec la précision monétaire et le total. Prix, frais et échéancier mensuel doivent être renseignés. L’API produit les prévisualisations avec le même calcul que l’échéancier définitif.
- `selectedPlanId` et le nombre de mensualités sont enregistrés atomiquement lors de l’accord. Une formule inconnue, manquante ou différente d’un choix déjà accepté est refusée. Les répétitions identiques sont idempotentes.
- La migration ajoute la liste JSONB et l’identifiant choisi. Le déclencheur conserve l’immutabilité des coûts et du contrat ; il n’autorise le choix de durée qu’à la transition offre → acceptation. Les offres sans choix gardent leur échéancier existant.
- Migration transactionnelle, délai d’attente de verrou de cinq secondes, durée maximale des instructions de trente secondes. Le retour arrière destructif est refusé : les choix contractuels doivent être conservés, avec correction par migration suivante si nécessaire.
- `PATCH /asset-credits/requests/:id/comment` vérifie l’identité, l’appartenance, le statut soumis et la longueur. Le dossier ne peut plus être modifié après émission d’une offre. Une tentative sur un dossier tiers ne modifie rien et retourne un conflit.

## Précautions et compatibilité

- Aucun changement dans les notifications, sonneries, actions conducteur, audio, GPS ou navigation d’un trajet.
- Conservation de l’accès Services pour les passagers et des restrictions d’acquisition aux conducteurs. Le contrôle KYC existant avant acceptation et remise est préservé.
- Pas de débit pour consulter une offre, choisir une formule ou envoyer un commentaire. Le bouton « Payer » de l’accueil ouvre le contrat : le remboursement conserve sa confirmation et son identifiant persistant contre les doubles débits après un délai réseau.
- Les nouveaux choix de durée nécessitent une application mise à jour. Les anciens contrats sans formules continuent de fonctionner. Le contrôle serveur refuse une acceptation de contrat à plusieurs formules sans choix explicite.
- Les portails admin/partenaire ne sont pas modifiés dans ce lot. L’API d’émission accepte les formules, mais **les offres existantes ne sont pas transformées automatiquement**. L’opérateur devra configurer les formules via cet endpoint, ou une évolution dédiée de son interface. Les clauses saisies dans l’offre doivent correspondre aux options proposées ; cette modification ne constitue pas une validation juridique des contrats.
- Ordre de mise en service à prévoir : migration, backend compatible, puis mobile ; ne pas activer des offres à plusieurs formules pour des utilisateurs dont l’application n’est pas encore compatible.

## Vérifications et limites

- Tests ciblés mobile : sélection/consentement, montant exact, idempotence, interruptions de session, commentaire, catalogue, accès des rôles et dashboard. Deux derniers lots : 24 et 35 tests réussis, avec recouvrement ; ne pas additionner ces nombres comme des tests distincts.
- Backend : suite PostgreSQL réelle isolée, coûts et formules ; **40 tests réussis**, y compris la borne exacte de 48 heures. La fixture de cette borne utilise explicitement UTC pour ne pas dépendre du fuseau Windows ; le délai de préparation de la base a été porté de 5 à 20 secondes après un dépassement pendant des tests parallèles. Ces durées de préparation ne mesurent pas la latence de l’API.
- Intégration `tests/integration/assetCreditBackendE2E.test.cjs` et `tests/helpers/assetCreditBackendFixture.cjs` : **8 scénarios réussis** avec véritables endpoints mobiles RTK Query, HTTP, JWT, DTO, migrations et PostgreSQL jetable. Comprend éligibilité, commentaire propriétaire, choix de formule, coûts, acceptation, remise, remboursement, idempotence, anciens équipements et reprise d’une réponse réseau perdue. Les composants React Native sont simulés dans Node : ce n’est pas une interaction sur téléphone.
- Tests visuels via `scripts/preview-services.cjs`, composants réels rendus avec React Native Web et données synthétiques : nouveau conducteur et crédit actif à 390 × 844 tiennent sans défilement ; à 320 × 568 et texte à 200 %, le défilement reste possible, aucune largeur ne déborde, les actions sont atteignables. Une première mise en page à texte agrandi a révélé un bouton mal placé : passage en colonne et nouvelle vérification réussie. Six scénarios contrôlés, y compris hors ligne et écran autonome.
- TypeScript mobile/backend et ESLint ciblé sans avertissement réussis. Taille des sources contrôlée : 1 399 fichiers, aucun au-dessus de 400 lignes. Le test supplémentaire de l’historique vérifie pagination, retour aux dossiers récents, actualisation et suspension des lectures.
- Premier contrôle release intégral : 4 025 tests, 4 023 réussis, un échec (route historique non enregistrée dans la protection), un ignoré (Ruby absent sous Windows). Protection corrigée et quatre tests d’authentification ciblés réussis.
- **Contrôle release intégral final réussi**, commande `node scripts/check-release.cjs`, code de sortie 0 : 4 028 tests, **4 027 réussis, aucun échec, un ignoré** (politique Ruby, à vérifier sur macOS/Ruby). Les nouveaux tests du commentaire et de l’historique sont inclus. Compatibilité URI/Metro, parité des sources natives, TypeScript, ESLint, frontières réseau et taille des sources passent également. La parité de sources n’est pas une compilation native. Log local ignoré par Git : `.expo/services-credit-release-20261117-final.log`.
- Les premiers essais d’intégration ont identifié le mauvais traitement du résultat SQL des commentaires (succès affiché même sans ligne modifiée) et une simulation React Native manquante dans un test. Correction et nouvelle recette complète réussies. Aucun dossier étranger n’avait été modifié.
- Aucune migration sur la base habituelle ou AWS, aucun SMS, push, paiement, crédit réel ou déploiement. Les processus de tests PostgreSQL/HTTP sont temporaires et limités à la boucle locale. Pas d’essai physique Android/iPhone, pas de build natif ni de validation juridique. La disparition de crashs, la chauffe et la disponibilité en production ne sont pas certifiées par ces tests.
