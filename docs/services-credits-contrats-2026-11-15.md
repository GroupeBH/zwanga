# Services et crédit par contrat — 15 novembre 2026

## Périmètre effectivement préparé

Services présente trois rubriques : documents, acquisition à crédit, services aux entreprises. Les flottes ouvrent le registre existant. Livraison, transport scolaire (Zwanga Schools) et santé (Zwanga Health) restent des présentations non cliquables avec « À venir » : cette intervention ne construit pas leurs opérations métier.

Téléphone, casque, traceur GPS, équipement de livraison, autre équipement et véhicule utilisent un seul flux : choix du bien → offre du personnel habilité → accord du conducteur → remise enregistrée → remboursement sur les trajets ou montant volontaire depuis le solde rechargé. Les conditions particulières du bien sont décrites dans chaque contrat, sans garantie ni service accessoire attribué automatiquement.

## Conditions financières confirmées

- Nouvelles offres `asset-credit-v2` : taux explicite en points de base (1 = 0,01 %). Aucun taux véhicule inventé ou sélectionné automatiquement dans le portail. Chaque contrat conserve son taux ; les taux s'additionnent sur le revenu brut du trajet.
- La commission habituelle de 5 % est distincte. Exemple de lecture : crédit téléphone 5 % + véhicule 15 % + commission 5 % = 25 %, tant que les deux crédits sont actifs et non soldés. Le capital restant borne le débit effectif.
- Le total présenté avant acceptation inclut les contrats acceptés/en remboursement, même si certains biens ne sont pas encore remis ; les prélèvements attendent la remise effective. Le serveur compare le total accepté au total courant sous verrou, et refuse un cumul crédits supérieur à 95 %. Deux acceptations simultanées ne contournent pas ce contrôle.
- Les anciens contrats v1 ne changent pas rétroactivement : ils partagent toujours un budget de remboursement de 5 %. Les nouveaux v2 s'ajoutent à cette enveloppe. Aucun consentement historique n'est réécrit.
- Cash : le remboursement est prélevé sur la part rechargée disponible, hors réserve de commission ; la part non débitée reste due. Les récompenses ne financent pas les crédits. Recharger ne rembourse pas automatiquement : un remboursement volontaire exige montant et confirmation.
- Aucun prélèvement avant accord et remise, aucun remboursement supérieur au capital. Retour au seul taux de commission quand tous les crédits sont soldés.

## Mécanisme et protections

Backend : `asset-credit.dto.ts`, contrôleur et service, migration `1780000129000-ContractAssetCreditRates.ts`, `sql/contract-asset-collections.ts`, inscription dans l'index. La migration ajoute `repaymentBps`, des sources et allocations par trajet/contrat, et ouvre le produit véhicule. Les anciennes migrations ne sont pas modifiées. Le calcul historique est repris en limitant strictement son enveloppe et ses corrections aux contrats v1.

Pour chaque trajet, la liste des crédits v2 éligibles et leurs taux sont figés. Les réévaluations utilisent les cibles et montants déjà collectés : pas de deuxième débit sur un même événement, pas de financement d'un contrat remis plus tard. Les écritures conservent la correction électronique, le remboursement cash réel et la variation du dû. Même si une correction historique rouvre un ancien crédit et fait dépasser le cumul nominal, le prélèvement effectif ne dépasse jamais le revenu net disponible ; priorité à l'enveloppe v1 puis aux v2 par ancienneté de remise.

Le montant volontaire conserve son UUID persistant côté mobile. Les taux/totaux sont affichés avant accord ; un changement des conditions retire la coche de consentement. Le backend refuse une acceptation v2 sans le total attendu, ce qui empêche une ancienne version mobile d'accepter silencieusement une nouvelle politique.

Portail : `app/(espace)/credits/page.tsx` et `lib/api/asset-credit.ts`, taux obligatoire, libellés communs matériel/véhicules et conditions spécifiques libres. Droits de préparation/remise inchangés. Le catalogue serveur décide de l'ouverture, y compris après mise en pause.

## Livraison ultérieure et limites

Aucun déploiement ni migration de la base habituelle/production exécuté. Prévoir le schéma et le backend avant portail/mobile, avec une fenêtre coordonnée : un ancien backend ne sait pas utiliser les nouveaux champs, et un ancien portail ne fournit pas le taux obligatoire. Les offres historiques restent accessibles et compatibles avec v1. Le rollback est refusé si des contrats v2 ou dossiers véhicules doivent être conservés ; préférer une pause du produit.

La correction à la baisse d'un trajet cash reste soumise à rapprochement opérateur, sans remboursement automatique. Un financement véhicule ne transfère pas la propriété, ne crée pas de véhicule inscrit et ne donne pas de droits de conduite/affectation. Ces procédures ne sont pas implicites dans l'acquisition.

Limite conservée du portail : l'UUID de création d'offre est stable en mémoire pendant une réponse incertaine, mais pas après rechargement complet de la page ; consulter les contrats avant de recréer l'offre. Aucun automatisme juridique, recouvrement forcé, intérêts, assurance ou pénalité ajouté.

## Vérifications

Les tests utilisent des données fictives, des composants natifs simulés ou PostgreSQL local jetable. Les tests HTTP Nest injectent l'identité et exercent DTO/rôles/service/SQL, pas l'authentification JWT réelle. Les aperçus React Native Web ne sont ni des essais tactiles ni des compilations Android/iOS.

- Mobile : contrôle release complet code 0, 3 845 réussis / 0 échec / 1 ignoré (Ruby/iOS) ; TypeScript, ESLint, frontières réseau, taille et parité des sources natives passent. La parité n'est pas une compilation native.
- Backend : `asset-credit.postgres.spec.ts` + `driver-finance-postgres.spec.ts`, 156 réussis / 3 diagnostics optionnels de déploiement ignorés, bases jetables ; TypeScript global réussi. Les six catégories traversent le même parcours HTTP jusqu'au remboursement. Cumul, capital, coexistence v1/v2, faux total, concurrence, corrections, migration prudente et commission cash couverts.
- Portail : 90 tests Vitest dans 13 fichiers, TypeScript réussi ; mocks d'API, distincts des tests SQL réels.
- 12 aperçus Services/crédit contrôlés : zéro débordement horizontal, actions accessibles avec défilement au besoin. Six entrées Services visibles sur 390 × 844 standard ; petit écran et texte 160 % nécessitent de défiler.
