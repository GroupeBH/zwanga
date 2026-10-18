# Retrait des jetons achetés

18 septembre 2026 — backend requis : migration `1780000038000` et activation explicite de `WALLET_WITHDRAWALS_ENABLED` après validation.

L'écran Jetons distingue le solde utilisable, la part achetée retirable, les jetons non retirables et les retraits réservés. Fidélité et bonus sont consommés en premier pour payer/partager, et restent non retirables même après transfert. Les jetons achetés reçus par transfert conservent leur éligibilité.

Le bouton « Retirer en argent » demande un nombre de jetons et un numéro Mobile Money, montre la conversion et demande confirmation. Le KYC est contrôlé côté serveur. Les revenus conducteur et les récompenses/commissions de parrainage gardent leurs écrans dédiés, accessibles depuis le portefeuille.

## Fiabilité

- UUID et destination sauvegardés **avant** le POST, stockage isolé par utilisateur et par type de retrait.
- Reprise de la même demande après redémarrage ou erreur réseau, sans nouveau versement.
- Une erreur ambiguë conserve la demande ; seul un refus explicite avant réservation autorise son abandon local.
- Montant reçu calculé côté backend ; aucun paramètre du client ne rend la fidélité retirable.
- Historique des 50 derniers retraits reçu, dix derniers affichés, bouton de vérification. Une initiation n'est pas un succès.
- Ancien backend : absence de métadonnées de retrait, fonctionnalité masquée. Nouveau backend désactivé : information visible, bouton indisponible.
- Modal monté à la racine de l'écran, hors du ScrollView et de son arbre d'accessibilité masqué, avec le composant de formulaire existant.

## Historique

Les soldes historiques sont ventilés de façon conservatrice côté serveur. Un achat sans preuve prestataire ou un ancien transfert sans origine peut rester utilisable mais non retirable jusqu'à un rapprochement audité. Ne pas assimiler tout le solde non retirable à de la fidélité.

## Vérification

`node --test tests/walletWithdrawal.test.js`

Couvre double confirmation, reprise réseau/stockage, isolation utilisateur, maintien du montant/destinataire, refus de retirer la fidélité et compatibilité API. Valider aussi sur Android/iOS et avec le prestataire en staging avant publication/activation. Aucun payout réel n'a été réalisé par ces tests.
