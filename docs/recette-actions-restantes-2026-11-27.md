# Recette complémentaire des actions restantes — 27 novembre 2026

> Suivi ultérieur le même jour : R10 et R11 sont corrigés et retestés. Les observations ci-dessous décrivent la passe de diagnostic antérieure ; les résultats actualisés figurent dans [les correctifs de la recette](correctifs-recette-ecrans-2026-11-27.md). Les autres limites de couverture ne sont pas levées.

## Périmètre et limites

Cette passe prolonge `recette-ecrans-etendue-2026-11-27.csv`. Elle ne reprend pas la certification des 68 routes : avoir ouvert un écran ne signifie pas avoir validé tous ses états et boutons.

Essais sur l'émulateur Android local, binaire de développement existant et JavaScript du projet, API locale. Compte de test déjà connecté, envois réels désactivés, aucun règlement, retrait, appel, SOS, message externe, migration ni déploiement. Aucun correctif fonctionnel mobile/backend n'est appliqué dans cette passe : les nouveaux constats restent à traiter.

## Actions réellement vérifiées

| Parcours | Vérifications supplémentaires | Résultat / frontière |
| --- | --- | --- |
| Historique des paiements | Toucher Tous, Validés, En cours, Échecs ; comparer le résultat courant du cache API aux statuts attendus | Réussite après relance du backend : respectivement 22, 4, 0 et 18 éléments. Première passe interrompue par indisponibilité réseau ; elle ne vaut pas validation des données. |
| Pagination des paiements | GET réels avec pages de 5 éléments, jusqu'au dernier curseur, pour chacun des quatre filtres ; unicité, ordre chronologique et cohérence avec le récapitulatif | 5 pages pour Tous, 1 pour Validés, 1 pour En cours, 4 pour Échecs. Aucun doublon, aucun curseur cyclique, totaux cohérents. Lecture seule ; ce n'est pas un test de règlement. |
| Reçu PDF | Ouvrir un détail, Télécharger PDF, examiner la feuille de partage, annuler ; lire le fichier effectivement généré et rendre sa page | PDF valide, une page lisible, 2 808 octets pour cet exemple. Défaut du partage Android confirmé, décrit ci-dessous. Aucun destinataire choisi. |
| Modification du profil | Ouvrir le choix photo puis Annuler ; enregistrer les champs inchangés, fermer le succès ; comparaison des champs stables par GET avant/après | Succès visible, rôle/catégorie/identité/numéro conservés lors du contrôle comparatif. Deux enregistrements sans modification volontaire. Les URL temporaires de photo sont exclues de la comparaison ; les premiers condensats qui les incluaient ne prouvent pas une modification utilisateur. Aucun nom ni numéro enregistré dans les preuves textuelles. |
| Recherche de flotte | Saisir une recherche synthétique sans correspondance et lancer Rechercher | Réponse API réussie et état vide explicite. Aucune candidature envoyée à une flotte existante. |
| Sécurité | Toucher Voir mes trajets | Navigation réelle vers `/trips`. Aucun appel d'urgence. |
| Signalement | Ouvrir sans cible, choisir Autre et saisir une description synthétique suffisante | Envoi toujours désactivé faute de cible ; aucun signalement créé. Une cible autorisée, son trajet et le traitement d'un signalement restent à tester. |
| Catalogue | Toucher Téléphones, Documents, Équipements conducteur et livreur, Accessoires, Véhicules, puis Tout | Lectures API réussies et état vide cohérent pour les cinq catégories. Aucun produit disponible sur cette base : description réelle, choix de formule et achat natifs non validés ici. |
| Crédit véhicule | Toucher l'encart de conditions du catalogue | Route du produit véhicule et lectures produits/contrats/demandes réussies. Aucun contrat accepté ni remboursement. |
| Dossiers documentaires | Ouvrir Mes dossiers, déclencher Actualiser mes dossiers | GET réussi, dossier synthétique antérieur toujours annulé. Libellé d'accessibilité du bouton à corriger. Pas de nouvelle demande documentaire. |
| QR conducteur | Réouvrir le QR du compte courant | API 404, message d'indisponibilité ; compte serveur `pending_kyc`. Ce n'est pas un QR validé. Aucune approbation ni modification des droits. |
| Véhicules du profil | Ouvrir Ajouter un véhicule, vérifier le bouton Ajouter inactif à vide ; faire défiler, saisir une plaque synthétique incomplète puis fermer | Après un premier arrêt faute de focus confirmé, le rejeu avec défilement permet la saisie ; le formulaire incomplet reste non soumissible et se ferme. Aucun véhicule créé/modifié/supprimé. Tous les autres champs ne sont pas renseignés : ce test n'isole pas à lui seul chaque règle de validation de plaque. |

## Nouveaux constats

### R10 — Le partage Android n'envoie pas le PDF en pièce jointe

- Reproduction native : Télécharger PDF ouvre une feuille intitulée « Sharing text » avec un URI `content://` dans le texte, pas une pièce jointe PDF. Partage annulé, sans ouvrir d'application destinataire.
- Le fichier local est bien généré et lisible. Le problème est donc distinct d'une erreur du générateur ou des réponses tardives corrigées précédemment.
- Cause confirmée dans `hooks/payment-history/usePaymentReceiptDownload.ts` : la branche Android place l'URI dans `message`, laisse `url` absent et appelle le partage texte React Native.
- Piste non appliquée : utiliser le partage natif de fichiers avec type PDF et permission de lecture, conserver les gardes de session et de sélection. Recetter Android/iOS avec un destinataire de test, sans exposer de paiement réel.

### R11 — Intitulé accessible du bouton d'actualisation perdu

- Dans la hiérarchie Android, le contrôle tactile « Actualiser mes dossiers » porte `content-desc="busy"`, tandis que le texte lisible est un enfant non tactile. Le bouton est activé et son action fonctionne.
- `features/pro-services/ServiceLayout.tsx` fournit le rôle et les états, mais pas de libellé explicite à `ServiceButton`.
- Piste non appliquée : donner un nom accessible explicite indépendant de l'état de chargement et tester avec TalkBack/VoiceOver. Aucun essai de lecteur d'écran physique n'est revendiqué.
- Deux arrêts de l'automatisation sont conservés comme tels. Le dernier essai cible le texte frais et son unique parent tactile activé ; le contournement du banc est limité à cette action de lecture seule.

### Limites opérationnelles, sans attribution de cause non démontrée

- Le backend est devenu indisponible pendant la première passe de filtres. L'utilisateur l'a relancé ; les lectures et les quatre filtres ont ensuite été rejoués avec succès. Sans ses journaux de processus, on ne peut pas attribuer l'arrêt à un bouton précis.
- Un premier contrôle de démarrage, fondé sur un délai fixe, a vu une session encore non restaurée, sans crash/ANR observé. Un contrôle ultérieur retrouve la session et les lectures, sans reconnexion. Le banc attend désormais, dans une limite de 45 secondes, session + lecture du profil. Ne pas présenter le premier contrôle comme une perte de session avérée.
- Rejeu terminé : trois redémarrages à froid et trois retours d'arrière-plan réussis, session retrouvée, application visible, aucun nouvel événement crash/ANR dans les journaux observés. Les trois attentes de disponibilité ont mesuré 16,9 s, 16,6 s et 17,3 s après le lancement ADB. Ces durées incluent Metro et la machine de développement : elles ne mesurent ni le démarrage d'un binaire de production ni la stabilité prolongée en veille. Preuve : `.expo/recheck-startup-20261103-remaining-ready-20261127/results.json`. Le premier essai à délai fixe reste conservé séparément.

## Tests automatisés et outils

- 59 tentatives d'action native, dont 55 atteignent leur assertion visuelle/de navigation et 4 arrêts du banc conservés. Ce ne sont ni 59 boutons distincts, ni 55 fonctionnalités intégralement validées : le décompte inclut les retours, défilements et reprises. Les quatre arrêts sont un libellé de sécurité corrigé dans la consigne du test, deux sélections du bouton de dossiers mal nommé et un focus de champ non confirmé ; chacun a ensuite été repris. Les premières lectures interrompues par la panne ne sont pas comptées comme des validations API malgré la présence du titre à l'écran.
- 66 tests JavaScript réussis, aucun échec ni test ignoré, dans `profileModules`, `profileServerStatusUI`, `profilePhotoSelection`, `fleetApplications`, `fleetPayments`, `proServiceCatalogue`. Exécution à deux workers, connexions réseau externes interdites. Les permissions, transactions et certains composants sont simulés dans ces suites : ce ne sont pas 66 manipulations natives.
- Contrôles syntaxiques et ESLint des trois scripts d'audit réussis ; contrôle des tailles de sources réussi ; matrice conservant 68 chemins uniques. Aucune modification de code applicatif, de schéma ou de configuration.
- `scripts/audits/remaining-screen-readback.cjs` : corroboration en lecture seule des filtres/pagination, comparaison de profil par condensat, récupération privée du reçu généré. Les jetons restent en mémoire. Les promesses Hermes sont observées explicitement, sans assimiler un objet Promise à un résultat.
- `scripts/audits/native-action-check.cjs` : seule extension, sélection contrôlée du bouton de lecture dont le nom accessible manque.
- `scripts/audits/recheck-local-startup.cjs` : suffixe de preuve distinct et attente de session bornée, afin de préserver les preuves antérieures et de ne pas conclure sur un délai arbitraire.

Preuves locales ignorées par Git : `.expo/native-actions-2026-11-27.json` (identifiants `rest-*`), `.expo/remaining-screen-readback-2026-11-27.json`, captures `rest-*`. Le PDF et son rendu privés ne doivent pas être ajoutés au dépôt ou diffusés.

Au retour final, la route d'accueil est retrouvée, mais ses lectures affichent de nouveau des erreurs réseau et la sonde HTTP `/health` ne répond plus. Cela ne remet pas en cause les assertions connectées antérieures ; cela empêche de certifier un accueil connecté disponible en fin de passe. La cause de cette seconde indisponibilité n'est pas déterminée. Les deux enregistrements du profil sont les seules écritures métier déclenchées ici ; aucun nouveau ticket, dossier, crédit, réservation ou trajet n'a été créé.

## Travail restant, dans l'ordre utile

1. Corriger et retester R10 ; rendre les boutons des services correctement identifiables (R11).
2. Préparer un jeu de données natif dédié : conducteur autorisé, deux passagers de test, produit actif et contrat de test, affectation de flotte. Les états absents du compte courant ne doivent pas être obtenus en contournant le KYC ou en modifiant arbitrairement un crédit existant.
3. Rejouer sur deux sessions le cycle complet : demande immédiate, négociation, changement de conducteur, réservation publiée, embarquement, dépose, encaissement simulé et clôture. Les preuves isolées précédentes ne remplacent pas cette interaction native.
4. Compléter inscription/OTP/récupération et changement de code sur des comptes jetables, photos après permission/refus, envoi/édition/suppression de messages et reçus, candidatures/retraits et contrats actifs.
5. L'onglet Assistance liste le suivi, mais ses lignes ne permettent pas d'ouvrir la conversation, répondre ou clôturer, bien que ces API existent. Amélioration possible : rendre ces actions accessibles avec protection contre les doubles envois et une pagination de conversation.
6. Qualifier sur appareils physiques Android/iOS : grandes polices, clavier, permissions, GPS/voix en veille, notifications réelles, réseau intermittent, performances d'une version de livraison et consommation batterie. Aucun de ces points n'est certifié par cette passe d'émulateur.

Conclusion : couverture étendue, mais pas de déclaration « tous les écrans et toutes les fonctionnalités validés ».
