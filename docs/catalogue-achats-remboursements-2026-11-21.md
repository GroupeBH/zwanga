# Catalogue, achats et remboursements Zwanga

Date : 21 novembre 2026. Périmètre : application mobile, `zwanga-backend`, `zwanga-admin`, catalogue public `zwanga-web`.

## État de la livraison

L’intégration est préparée localement, sans déploiement. Les migrations ont été testées sur des bases temporaires ; après autorisation explicite, seule la migration commerciale `1780000140000-ServiceCommerce` a aussi été appliquée à la base locale de test pour corriger le HTTP 500 du catalogue Android, sans réinitialisation. Aucun produit réel, prix commercial, stock réel ou partenaire financier n’a été créé pendant les essais.

Le catalogue présente des produits réels configurés dans l’admin. Le choix ouvre une fiche avec description, caractéristiques, garantie, prix, formules et pièces à fournir. L’envoi d’un dossier ne signe pas le contrat et ne débite pas le compte. Le client doit accepter l’offre contractuelle validée avant de payer.

Deux limites importantes subsistent :

- Pour les **nouveaux contrats de ce catalogue**, le moteur Zwanga Pro existant prélève automatiquement sur les revenus électroniques et jetons, pas sur les trajets cash. Après un trajet cash, le remboursement proposé ici est volontaire, depuis le solde rechargé. L’extension du prélèvement automatique cash et de son reliquat dû reste à réaliser ; le comportement des anciens crédits n’est pas changé.
- Les essais décrits ci-dessous ne constituent pas une validation native iOS/Android, un test de charge, ni une validation juridique des contrats. Le site permet de consulter les offres ; la souscription et le paiement se font dans l’application, pas sur le site.

## Règles commerciales appliquées

| Sujet | Règle de cette version |
| --- | --- |
| Prix à crédit | Coût d’acquisition + frais configurés + gain souhaité, fixé dans l’admin. Aucun supplément ajouté lors d’un changement de formule. |
| Prix comptant | 80 % du prix total à crédit, soit 20 % d’avantage affiché. Ce n’est pas une remise de 20 % sur un acompte. |
| Protection de marge | Le prix comptant doit couvrir acquisition, frais et marge minimale configurée. Sinon, l’offre est refusée. |
| Formules | Une à douze formules par offre, hebdomadaires ou mensuelles, dans les limites de la politique de financement. |
| Avant remise | Acompte confirmé ; si l’acompte est nul, première échéance payée en avance. Pour le comptant, totalité du prix comptant. |
| Petits paiements | Le conducteur choisit un montant positif disponible dans son portefeuille. Chaque paiement réduit les mêmes échéances, sans créer une seconde dette. |
| Recharge | Ajouter de l’argent au portefeuille n’est pas, à lui seul, un remboursement. Une action de paiement ou une retenue prévue au contrat est nécessaire. |
| Changement de formule | À la fin d’une période échue et intégralement réglée, uniquement pour le solde restant et parmi les formules figées au contrat. La nouvelle fin doit rester couverte par le mandat accepté. |
| Solde anticipé | 10 % de remise sur le **solde restant**, lors d’un règlement intégral, sans échéance impayée et au moins une période avant la fin prévue. |
| Non-cumul | La remise anticipée ne s’ajoute pas au prix comptant. Aucun remboursement de 10 % des sommes déjà payées. |
| Historique | Le prix signé et les anciens échéanciers restent conservés. Les offres précédentes ne sont pas revalorisées rétroactivement. |

Les calculs serveur sont faits en entiers, en centimes de CDF. La précision du portefeuille est de 0,1 FC ; les réductions sont arrondies vers le bas à cette précision. L’éventuel reliquat de division est porté sur la dernière échéance. Le total des échéances reste exactement égal au montant financé.

### Exemple explicatif, pas un tarif Zwanga

Pour un prix à crédit de **100 000 FC**, constitué de 60 000 FC d’acquisition et de 40 000 FC de gain souhaité :

- Le comptant coûte **80 000 FC**. La marge minimale configurée doit rester compatible avec ce montant.
- À crédit, un acompte de **10 000 FC** et trois mensualités de **30 000 FC** donnent bien 100 000 FC au total.
- Un versement volontaire de 5 000 FC réduit le reste dû de l’échéance la plus ancienne. Il ne s’ajoute pas au total contractuel.
- S’il reste 60 000 FC et que les conditions de solde anticipé sont réunies, le client règle **54 000 FC**, avec une remise distincte de 6 000 FC.
- Les paiements encaissés et les remises apparaissent séparément dans le détail. Une remise n’est jamais présentée comme un encaissement.

## Parcours dans l’application

1. **Services → Acheter à crédit** ouvre le catalogue ; le titre de la fiche propose aussi le paiement en une fois.
2. Le client filtre les catégories, ouvre un produit et voit le prix comptant, le prix à crédit et l’économie possible.
3. Il choisit le mode et la formule, consulte le montant à payer avant remise et les échéances. Il peut ajouter un commentaire et les justificatifs exigés.
4. Pour un document, il sélectionne son véhicule et son dossier documentaire. Un lien permet de préparer ce dossier.
5. **Vérifier mon choix** affiche les conditions. **Envoyer mon dossier** envoie seulement le dossier.
6. Après examen, **Mes achats et paiements** présente le contrat. L’accord est une case non précochée, suivi d’une confirmation explicite.
7. Le client paie avec son solde Zwanga. La remise du bien est attestée par un agent distinct du bénéficiaire, avec preuve privée et référence de stock pour un équipement.
8. Une fois la remise contrôlée et le contrat activé, il suit les échéances, paie un montant libre, consulte son prix de solde anticipé ou change de formule lorsqu’il y est éligible.

L’accès aux crédits précédents est conservé. Depuis le profil, le chemin de remboursements existant donne aussi accès aux nouveaux achats. Une indisponibilité du serveur ne permet pas d’envoyer un paiement sur des montants affichés comme non actualisés.

Les confirmations sont dans une zone d’action distincte, défilable si les grandes polices l’exigent. Elles n’imposent pas de retrouver un bouton tout en bas de l’historique.

### Conditions propres au véhicule

La fiche rappelle le minimum de neuf mois d’activité réelle, avec un trajet terminé avec passager tous les deux jours. Le serveur réutilise le contrôle existant : prises en charge et déposes enregistrées, passager différent du conducteur, pas d’intervalle supérieur à 48 heures sur la période requise. Il le vérifie à plusieurs étapes, notamment à la constitution, à l’accord et à l’activation.

Ce contrôle exploite des preuves d’activité enregistrées ; il ne certifie pas à lui seul l’absence de trajets de complaisance. Le véhicule reste soumis aux conditions et à l’examen du dossier. Une simple ancienneté de compte ne suffit pas.

### Éligibilité et disponibilité

Cette intégration conserve les contrôles du moteur de financement : compte actif, statut conducteur et KYC approuvé. Le paiement comptant ne contourne pas ces contrôles, même s’il n’expose pas le client aux critères d’endettement propres au crédit. L’accès public au catalogue ne signifie donc pas que tout visiteur peut être financé.

Les catégories conducteur/livreur, téléphone et accessoires sont distinctes. Les documents et véhicules ont aussi leur catégorie. La migration crée des catégories, **pas des offres commerciales actives**. L’admin décide quels produits publier ; aucun matériel « à venir » n’est rendu commandable automatiquement.

## Mode opératoire de l’admin

Route : **Zwanga Pro → Catalogue et tarifs** (`/zwanga-pro/catalogue`). Les droits sont revérifiés côté serveur ; voir un bouton ne confère pas une habilitation.

### Prérequis

- Fournisseur, vendeur et créancier légalement identifiés, actifs et habilités dans Zwanga Pro.
- Politique de financement versionnée : texte contractuel, critères d’éligibilité, acompte minimal, durée maximale, taux et éventuelle retenue fixe.
- Habilitations distinctes pour gestion, analyse, comptabilité et remise/stock.
- Stock identifié pour les biens physiques, y compris IMEI pour les téléphones ; stockage privé et clé de protection des identifiants correctement configurés.
- Validation commerciale et juridique des contrats avant ouverture au public. Ce guide décrit le logiciel, pas une autorisation réglementaire de crédit.

### Créer et publier une offre

1. Créer ou renommer une catégorie. Une catégorie peut être masquée ; sa nature ne change pas après création.
2. Créer le produit : référence, nom, description, marque/modèle si téléphone, image HTTPS éventuelle, caractéristiques, garantie, pièces exigées et délai indicatif.
3. Associer les parties et la politique de financement existantes. Aucun compte fournisseur réel n’est inventé par le formulaire.
4. Saisir coût, frais, gain souhaité, marge minimale comptant, acompte et formules.
5. Vérifier l’aperçu des deux prix. Le serveur recalcule les montants et rejette une marge ou une formule incompatible.
6. Enregistrer : le produit reste **désactivé pour contrôle**. L’activer explicitement après validation.
7. Examiner la fiche publique et son récapitulatif dans le mobile avant d’accepter des dossiers réels.

Une modification des tarifs ou de la fiche incrémente sa révision et la désactive jusqu’au prochain contrôle. Un ancien récapitulatif d’achat devient invalide, mais un contrat déjà figé garde ses propres conditions. En cas de modification concurrente, recharger la version récente avant de réenregistrer.

### Examiner, encaisser et remettre

L’admin retrouve le prix **du choix du client**, comptant ou crédit, et non systématiquement le prix catalogue à crédit. Il examine les justificatifs et rend une décision motivée. Le client accepte ensuite le contrat et, pour un crédit, le mandat présenté.

Une recharge ou une promesse de paiement ne permet pas de marquer le produit comme remis. Le serveur exige le paiement confirmé, une preuve privée appartenant à l’agent et le stock adéquat. Une tentative de remise avant paiement est refusée.

Un retour ou un refus de remise ne simule pas un remboursement financier : les flux existants suspendent la collecte concernée et demandent une revue financière. Les remboursements au client doivent être traités par les procédures autorisées, pas par suppression de dette ou modification manuelle de l’historique.

## Site public

`/equipements` affiche les catégories et produits publiés. `/equipements/[id]` présente le détail, les prix, les formules, pièces et conditions. Le lien **Choisir ma formule dans Zwanga** ouvre la fiche correspondante dans l’application.

Ces pages lisent uniquement les routes publiques, sans cookie d’authentification ni jeton utilisateur. La panne de l’API donne un message d’indisponibilité ; aucun prix de remplacement n’est fabriqué. L’URL de base est celle déjà prévue par la configuration publique du site. Aucune valeur de configuration n’est reproduite dans ce guide.

## Architecture et protections

### Fichiers principaux

| Dépôt | Fichiers / périmètre |
| --- | --- |
| Mobile | `app/services/catalogue.tsx`, `app/services/catalogue/[id].tsx`, `app/services/purchases.tsx`, `app/services/purchases/[id].tsx` |
| Mobile | `features/pro-services/CommerceProductScreen.tsx`, `CommerceContractScreen.tsx`, `commerceModel.ts`, `store/api/commerceApi.ts`, `types/commerce.ts` |
| Mobile | Liens dans `ServicesScreen.tsx`, `app/services/credit/index.tsx` et `repayments.tsx` ; anciens contrats conservés |
| Backend | `src/financing/commerce/` : prix, devis, catégories, configuration, solde anticipé et changement de formule |
| Backend | Adaptations ciblées de `catalogue`, `applications`, `contracts`, `repayments/credit-wallet-payments.service.ts`, `fulfilment/credit-delivery.service.ts`, types et module financier |
| Backend | Migration `1780000140000-ServiceCommerce.ts`, registre des migrations, fixture de test |
| Admin | `app/(admin)/zwanga-pro/catalogue/page.tsx`, `lib/features/assetCredits/commerceApi.ts`, récapitulatifs de `zwanga-pro/page.tsx` et types `proCreditApi.ts` |
| Web | `lib/commerce.ts`, `app/equipements/`, lien de navigation et sitemap |

### Routes

- Publiques : `GET /zwanga-pro/commerce/categories`, `/products`, `/products/:id`.
- Devis authentifié : `GET /zwanga-pro/commerce/products/:id/quote`.
- Admin : lecture/écriture des catégories et configuration des produits sous `/zwanga-pro/commerce/admin/`; création et activation des produits réutilisent les routes `/zwanga-pro/admin/` existantes.
- Dossier et contrat : routes existantes `/zwanga-pro/applications`, `/mine`, `/mine/:id/accept`, `/mine/:id/wallet-payments`.
- Solde et formule : `GET/POST /zwanga-pro/commerce/mine/:id/settlement` et `/plans`.

Le préfixe API habituel s’ajoute à ces chemins. Les dossiers et contrats restent réservés au propriétaire ou à l’opérateur habilité. Les montants internes d’acquisition et de marge ne sont pas renvoyés dans la fiche publique ni dans le contrat du client.

### Cohérence des paiements

- Calcul serveur exact, devis lié à la révision du produit, empreinte du contrat et acceptation explicite.
- Identifiant de mutation pour rejouer une opération sans répéter le débit ; réutiliser cet identifiant avec un autre contenu est refusé.
- Ordre de verrouillage commun aux opérations concernées : conducteur, portefeuille lorsqu’il est débité, verrou crédit, contrat. Transactions courtes avec délais de verrou/requête.
- Paiement avant activation comptabilisé comme avance ; transfert comptable lors de l’activation, sans encaissement doublé.
- Remise anticipée enregistrée comme écriture commerciale distincte et unique, jamais comme argent reçu. Principal et anciennes conditions immuables.
- Historique des échéanciers conservé par version ; un changement de durée ne recrée pas une fenêtre de remise au-delà de la fin initiale.
- Garde contre les doubles clics, réponses d’un ancien compte et écrans inactifs dans le mobile ; erreurs visibles et relecture des montants.
- Pagination des listes, pas de nouveau polling global. Invalidation ciblée des achats et du portefeuille.
- Les notifications passent par l’outbox existante, sans appel externe dans la transaction. Aucune modification de la sonnerie, de Notifee, de la navigation de trajet ou du GPS.

Attention aux données comptables : dans le détail API, `paidMinor` représente l’argent effectivement affecté au principal, `discountMinor` la remise et `creditedMinor` l’extinction totale de dette. L’acompte reste séparé. Dans les listes et agrégats historiques, `paidMinor` conserve sa signification de dette réglée, remise comprise ; l’admin l’intitule donc « Réglé (paiements + remises) ». Ne pas l’utiliser comme chiffre d’affaires encaissé.

## Vérification et mise en service

Les résultats et limites sont consignés dans [le rapport de recette](recette-commerce-2026-11-21.md). Il distingue les tests unitaires, les intégrations HTTP réelles avec base temporaire, les interactions de composants simulées et les aperçus RN-Web.

Ordre de mise en service à faire valider séparément :

1. Examiner les différences et les contrats, sauvegarder la base cible et vérifier les migrations préalables du module Zwanga Pro.
2. Appliquer la migration et publier le backend compatible avant les interfaces. **Ce n’est pas fait par cette intervention.**
3. Configurer parties, politiques, droits, pièces privées, stock et offres en état désactivé.
4. Publier admin, site et mobile compatibles, puis effectuer la recette sur de vrais appareils et un environnement de préproduction.
5. Vérifier achats comptants/crédit, livraison, réconciliation, réouverture après coupure réseau et consultation depuis un autre compte.
6. Activer quelques offres contrôlées, surveiller erreurs et rapprochements avant d’élargir.

En cas de problème, masquer les produits/catégories pour arrêter les nouveaux dossiers. Ne pas effacer les contrats, écritures ou échéanciers. La migration est volontairement non destructrice au retour arrière ; le rollback applicatif doit respecter les nouvelles écritures commerciales.

### Recette manuelle encore requise

- Android et iOS physiques : clavier, petites tailles, grandes polices, VoiceOver/TalkBack, reprise après veille, changement de compte.
- Admin dans le navigateur réel : saisie, correction après erreur, modification simultanée, activation, lecture des pièces, remise et retour.
- Upload réel dans le stockage privé et ouverture des pièces par les seuls opérateurs habilités ; aucune donnée personnelle réelle nécessaire à la recette.
- Site déployé de test : URL d’API publique, affichage des images approuvées, catégories, indisponibilité et lien profond vers l’application installée.
- Transport push réel, écran ouvert depuis une notification et reprise native ; aucun de ces succès n’est déduit des tests JavaScript.
- Compatibilité des migrations sur une copie représentative de la base, réconciliation des anciens et nouveaux contrats, charge et reprise du worker.
- Extension encore nécessaire du remboursement automatique des nouveaux crédits sur trajets cash et gestion de son reliquat, avant de promettre cette couverture.
