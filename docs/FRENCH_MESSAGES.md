# Correction des messages français — 15 septembre 2026

## Périmètre

Les textes définis dans le code mobile et le backend ont été relus et corrigés :

- accents, apostrophes, accords et ponctuation des messages français ;
- réservations, demandes de trajet, véhicules et navigation ;
- confirmations, annulations, jetons, paiements et retraits ;
- notifications de sécurité et messages WhatsApp destinés aux proches ;
- erreurs de connexion, de conversations, de notation et d’envoi d’images ;
- validations explicites des formulaires et descriptions françaises des DTO.

Les messages techniques en anglais repérés dans ces parcours ont été traduits.
Les messages destinés aux passagers et conducteurs parlent de vérification
d’identité, sans renommer les identifiants techniques contenant `KYC`.

## Garanties de fonctionnement

Ces changements portent sur les textes, pas sur les règles métier :

- mêmes codes d’erreur, statuts, routes, clés de stockage et champs API ;
- mêmes montants, conditions d’accès et décisions de paiement ;
- expressions de reconnaissance des erreurs et messages prestataires conservées ;
- aucun correcteur automatique ajouté au traitement des requêtes ou au rendu ;
- aucune dépendance ajoutée, aucune modification de configuration ou de base de données.

Les données saisies par les utilisateurs, les journaux techniques et les messages
déjà enregistrés en base ne sont pas réécrits. La normalisation existante des
messages FlexPay reste compatible avec les variantes accentuées ou non.

## Vérifications

Dans l’application :

```sh
node --test tests/frenchMessages.test.js
node --test tests/*.test.js
node node_modules/typescript/bin/tsc --noEmit --pretty false
node scripts/check-network-boundaries.js
node scripts/check-source-size.cjs
```

Dans `zwanga-backend` :

```sh
node node_modules/jest/bin/jest.js --runInBand --silent
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false -p tsconfig.build.json
```

Les tests de paiement conservent volontairement des réponses prestataires
en anglais ou sans accents en entrée. Seuls les textes attendus en sortie sont
corrigés. Le fichier `src/payments/payment-messages.spec.ts` vérifie également
les deux variantes et la distinction entre attente et confirmation.

## Mise en production

Il faut déployer le backend pour servir ses nouveaux messages et distribuer
une mise à jour mobile compatible pour les textes embarqués dans l’application.
Les modifications locales ne mettent pas automatiquement à jour la production.
