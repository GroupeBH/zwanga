# Audit performance, fiabilité et stabilité — 19 novembre 2026

## Conclusion

Le code mobile comporte des protections utiles contre les requêtes répétées, les anciennes sessions et les traitements GPS coûteux. Cela ne suffit pas à certifier la stabilité de la version à livrer : la recette native reste ouverte et le contrôle global lancé pendant cette intervention n'a pas fourni de bilan complet.

Deux défauts de fiabilité ont été reproduits sur le code réel avec des dépendances simulées : double envoi de validation d'un devis de service, et temporisation GPS d'un trajet précédent conservée pour le suivant. Une invalidation trop large des caches Services constitue un risque supplémentaire de consommation réseau. Ces trois points sont **documentés, pas corrigés** dans cette intervention.

La modification fonctionnelle appliquée à la demande de l'utilisateur concerne uniquement la consultation des équipements à crédit : chaque catégorie ouvre maintenant sa fiche avant l'envoi du choix.

## Périmètre et méthode

- Lecture du mobile : accueil et coordination des activités, navigation, calcul de proximité sur itinéraire, localisation de fond, réseau/authentification, file d'événements, services et crédits, code Android de sonnerie et configuration native.
- Lecture ciblée du contrat du catalogue dans le backend voisin ; pas d'audit intégral ni de modification du backend, des portails, d'AWS ou de la base.
- Contrôles statiques, tests JavaScript, test du transport Android sur JVM avec doublures, benchmark Node sur trace synthétique et aperçus RN-Web avec données fictives.
- Vérifications locales en lecture seule : identification du binaire Android installé et disponibilité HTTP du backend de test. Aucune nouvelle commande, notification, transaction, inscription ou demande de crédit réelle.
- Aucun secret ni donnée personnelle n'a été utilisé dans les preuves ci-dessous. Les changements étrangers à ce périmètre sont conservés.

## Constats à traiter

### A1 — P1 : validation native de la version à livrer encore ouverte

L'émulateur disponible porte toujours le binaire **1.0.18 (176)**. Ce n'est pas une validation du nouveau code natif. La précédente recette avait observé un ANR de focus pendant la séquence réglages/grandes polices ; voir [la recette précédente](recette-dernieres-modifications-2026-11-19.md). Aucun nouvel ANR n'a été reproduit ou attribué à une cause durant cet audit.

Les deux lectures locales de disponibilité du backend de test ont échoué. Il n'y a donc pas eu de recette connectée complète du nouveau parcours crédit, ni de mesure de disponibilité de production. Les délais de ces tentatives ne sont pas présentés comme des latences serveur.

Avant livraison : installer un binaire candidat signé de manière compatible, puis vérifier Android et iPhone physiques, grandes polices, retour des réglages, interruptions par appel, GPS/voix en veille et sonneries. En cas d'ANR, collecter la pile et une trace système ; ne pas déduire sa cause du seul écran figé. Les références Android expliquent cette distinction dans [le diagnostic des ANR](https://developer.android.com/topic/performance/anrs/diagnose-and-fix-anrs). Les performances doivent aussi être mesurées en release, pas déduites d'un dev build : [guide React Native](https://reactnative.dev/docs/performance).

### A2 — P2 confirmé : validation d'un devis de service envoyée deux fois

Emplacement : `app/services/[id].tsx`, fonction `action` vers les lignes 45–54 et bouton d'acceptation vers 180–184.

La garde utilise l'état `isLoading` de la mutation, mis à jour au rendu suivant, sans verrou immédiat. Le bouton reste également utilisable avec un ancien devis lorsque la lecture échoue, et sa désactivation n'intègre pas l'inactivité de l'écran.

Reproduction avec le composant réel et API simulée :

- deux appels au gestionnaire avant le rendu suivant produisent **deux mutations** ;
- après une erreur de lecture sur un devis conservé en cache, l'acceptation reste activée ;
- après perte d'activité de l'écran, l'acceptation reste activée dans cette simulation.

Conséquence : requêtes dupliquées et risque de retour d'interface incohérent. **Aucun double débit n'est démontré** : les protections transactionnelles du serveur ne sont pas évaluées par cette simulation.

Correctif proposé : verrou synchrone, garde de session/écran comme sur les écrans portefeuille, désactivation après une erreur de lecture et réconciliation d'un résultat ambigu avant nouvelle tentative. Non appliqué ici.

### A3 — P2 confirmé : temporisation GPS partagée entre trajets

Emplacement : `services/driverBackgroundLocationTask.ts`, variables globales vers 28–31, garde vers 64 et échec vers 124–144. Motif similaire dans `services/passengerBackgroundLocationTask.ts`, variable vers 34 et garde vers 154.

La temporisation de 30 secondes après erreur réseau n'est pas rattachée à l'identité du trajet. Reproduction avec le callback conducteur réel et dépendances simulées : trajet A → réponse 503 ; passage au trajet B ; réception immédiate d'un point valide → **une requête pour A, aucune pour B pendant la temporisation**.

Conséquence : première position serveur du nouveau trajet retardée jusqu'à expiration de la temporisation précédente. Cela ne démontre pas un arrêt du GPS natif ou de la carte locale. Le cas passager est un constat de code similaire, pas une seconde reproduction indépendante.

Correctif proposé : rattacher envoi en cours, horodatages et temporisation au compte/session et trajet/réservation ; empêcher une réponse tardive de l'ancien trajet de modifier la nouvelle portée. Préserver les limitations de fréquence et la protection contre les tempêtes de tentatives. Non appliqué ici.

### A4 — P2, risque de performance : invalidation commune à tous les services

Emplacements : `store/api/proServicesApi.ts`, `store/api/assetCreditApi.ts` et `store/api/fleetRegistryApi.ts`, usages de `ProServices`.

Les documents, crédits et flottes partagent le même tag général. Une mutation aussi limitée qu'un commentaire de dossier de crédit peut invalider des lectures d'autres services. Les abonnements actifs peuvent repartir en lecture ; des caches sans abonnement peuvent être retirés puis relus à la prochaine visite. Cela ne signifie pas que tous les écrans inactifs envoient des requêtes simultanément.

Le couplage est confirmé dans le code ; son coût réseau et son effet sur les temps d'affichage n'ont pas été mesurés sur appareil.

Correctif proposé : tags par famille et identifiant, avec conservation explicite des invalidations croisées nécessaires, notamment portefeuille après remboursement. Non appliqué ici.

### A5 — Ambiguïté du catalogue crédit : navigation corrigée, données produit encore limitées

Le catalogue backend expose des catégories, libellés, disponibilités et conditions d'éligibilité. Il ne fournit pas de catalogue de références commerciales avec photo, modèle, mémoire ou accessoires. La nouvelle fiche explique cette limite et renvoie à l'offre personnalisée ; elle ne fabrique aucune caractéristique.

Pour présenter plus tard un téléphone précis avant l'envoi du choix, il faudra enrichir les données et leur gestion avec de vraies références produit. Cette extension backend/admin n'est pas effectuée ici.

## Protections existantes et performance mesurée

- Réseau centralisé dans RTK Query ; contrôles de session avant/après attente, rafraîchissement de jeton mutualisé et récupération bornée. Les contrôles de frontières réseau ne trouvent pas d'appel HTTP applicatif direct hors du circuit prévu.
- Coordination des activités et lectures conditionnées à l'activité de l'application ; accueil préparé sous le loader, sans réintroduire les rappels facultatifs supprimés. Les temporisations d'accueil ne constituent pas une mesure du temps complet de démarrage.
- File d'événements de trajet persistante : clés d'idempotence, portée de compte, travail disque sérialisé, concurrence réseau limitée et états d'échec conservés.
- Traitement audio Android sur thread dédié avec nettoyage et délais bornés ; les sources et politiques de prebuild concordent. Ce contrôle ne compile ni n'exécute le binaire livré.
- Calcul d'itinéraire : `node scripts/benchmark-driver-route.cjs`, **8 000 points et 500 positions synthétiques**. Ancien parcours : **7 999 000 projections de segments, 4 309 ms** ; calcul indexé : **18 992 projections, 51 ms, construction incluse**. Mesure Node sur le poste pendant les contrôles, pas FPS, temps réel Android/iOS, consommation batterie ou température. La réduction du travail algorithmique est établie ; aucun gain natif chiffré n'est revendiqué.
- Aucune fuite mémoire, disparition de crash ou amélioration de chauffe n'est certifiée par cette inspection.

## Fiche équipement appliquée

Fichiers concernés :

- `app/services/credit/index.tsx` : catalogue de lignes ouvrant chacune une fiche, y compris les catégories à venir ; accès aux offres, contrats et remboursements conservé.
- `app/services/credit/product/[kind].tsx` : route protégée, catégorie validée et composant réinitialisé au changement de compte/catégorie.
- `components/ProtectedAppStack.tsx` : déclaration de cette route.
- `features/pro-services/CreditProductScreen.tsx` : usage du bien, informations à préciser, conditions, offre existante et commentaire facultatif avant envoi. Une seule action principale ; disposition adaptée aux grandes polices.
- `features/pro-services/creditProductDetails.ts` : descriptions par catégorie et statuts lisibles, sans caractéristiques inventées.
- `features/pro-services/CreditHowItWorks.tsx` : explication réutilisée, libellé adapté au véhicule au lieu de parler systématiquement d'un téléphone.
- `tests/assetCreditCatalogue.test.js` : navigation et protections du parcours.

Précautions :

- Ouvrir une fiche ne crée aucun dossier, accord de crédit ou débit. Le choix est envoyé seulement sur action explicite avec le contrat API existant.
- Les catégories à venir restent consultables mais non commandables. Le véhicule exige toujours une éligibilité explicite du serveur ; les neuf mois d'activité avec passager tous les deux jours ne sont pas contournés.
- Les coûts et échéances réellement disponibles proviennent de l'offre existante, avec accès aux formules et au contrat. Aucun montant ou échéancier par défaut n'est inventé.
- Verrou anti-double appui, garde de session et d'activité, désactivation en cas d'erreur de lecture, dossier déjà soumis ou offre existante. Lectures suspendues hors activité/hors ligne et traitement des réponses tardives conservés.
- Les alertes, canaux sonores, flux de paiement, pourcentages, backend et configuration d'environnement ne changent pas.

## Vérifications et limites

| Contrôle de cette intervention | Résultat et limite |
| --- | --- |
| Suite crédit ciblée, sept fichiers | **40 tests réussis**, aucun échec/ignoré ; composants et logique avec dépendances simulées, pas un achat réel |
| Transport d'admission Android, test JVM isolé | **1 test réussi** ; doublures JVM, pas un téléphone |
| Aperçus fiche RN-Web | **5 configurations contrôlées** : téléphone 320/390 px, texte simulé à 200 %, casque et véhicule ; pas de débordement horizontal, cibles visibles d'au moins 44 px ; correction de la coupure du titre à grande police |
| TypeScript et ESLint | `tsc --noEmit` et ESLint sur les fichiers modifiés réussis, code 0 ; aucun diagnostic TypeScript |
| Frontières réseau et taille des sources après modification | Réussis : **1 417 sources**, aucun fichier dépassant la limite de 400 lignes du contrôle |
| Contrôle global `check-release.cjs` | Étapes préalables réussies ; journal de tests arrêté au résultat 2 430 sans bilan TAP final : **pas de validation globale** |
| Recette API et appareils | Non effectuée sur la version candidate : backend local indisponible et émulateur avec ancien binaire ; aucun essai iPhone physique |

La grande suite a croisé la modification du catalogue en cours : quatre anciennes attentes du catalogue y ont échoué, remplacées puis validées dans la suite ciblée actuelle. Le test de transport Android y avait aussi dépassé le délai du sous-processus JVM ; sa relance isolée réussit. Cela ne permet pas de convertir le lancement global incomplet en succès. Il faut relancer le contrôle global sur un arbre stabilisé et le contrôle d'intégration avec PostgreSQL jetable avant livraison.

Les aperçus RN-Web produisent un avertissement de dépréciation `pointerEvents` ; leurs assertions et captures sont disponibles, mais le wrapper PowerShell redirigeant stderr a renvoyé un code 1. Ils sont décrits comme contrôles de rendu, pas comme compilation native réussie.

Preuves locales ignorées par Git : `.expo/audit-performance-2026-11-19-release.log`, `.expo/audit-reliability-observations.json`, `.expo/audit-route-benchmark.json`, `.expo/audit-credit-details-tests.log`, `.expo/audit-native-ring-retest.log`, `.expo/credit-product-preview/report.json` et ses captures. Les reproductions sont exécutées par `.expo/audit-reliability-probe.cjs` avec I/O simulées.

## Ordre de suite recommandé

1. Corriger A2 et A3 avec tests de changement de compte, de trajet, de panne et de réponse tardive.
2. Réduire les invalidations A4 sans perdre les mises à jour du portefeuille ni des dossiers.
3. Relancer le contrôle global sur sources stables et les intégrations isolées ; installer le binaire candidat sans effacer les données existantes sans accord.
4. Faire la recette physique Android/iPhone : veille, reprise, GPS désactivé/réactivé, appels, alertes, retour de réglages et grandes polices, puis mesurer le démarrage et la navigation en release.

Aucun déploiement n'est réalisé ou validé par ce document.
