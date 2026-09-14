# Découpage du profil — 12 septembre 2026

## Périmètre

`app/(tabs)/profile.tsx` assemble les sections et branche les modals. Le rendu existant est conservé : photo, tableau de bord, parrainage, accès au portefeuille/revenus, avis, véhicules, code PIN, identité et abonnement Pro.

Les blocs déjà désactivés par `false && …` ont été retirés, ainsi que leurs calculs devenus inutiles. Ils restent récupérables dans la version Git précédente ; aucune action visible n'a été supprimée. L'écran de paiement dédié `app/subscriptions/payment.tsx` n'est pas modifié dans ce lot.

## Répartition

| Modules | Responsabilité |
| --- | --- |
| `components/profile/` | Sections d'affichage et modals à props typées. `ProfileReviewItem` est partagé entre l'aperçu des avis et leur liste complète. La capture photo existante est conservée. |
| `features/profile/*.styles.ts` | Styles séparés par section, valeurs et disposition conservées. |
| `useProfileData` | Lectures RTK Query, compteurs et rafraîchissement du profil ; sources serveur non recopiées dans un nouveau slice. |
| `useProfileVehicles` | Brouillon local du modal, création/modification/suppression, confirmation et récupération après erreur réseau incertaine. |
| `useProfilePin` | Saisie temporaire, OTP, validation et changement de PIN par les mutations existantes. |
| `useProfileOnboarding` | Vérification d'identité et activation du rôle conducteur. |
| `useProfileController` | Assemblage des hooks, tutoriel, photo, menus et navigation. |
| `useProfileSubscriptionState` / `View` | État transitoire du parcours, suivi visuel et adaptation au clavier. |
| `useProfileSubscriptionStorage` | Référence de paiement persistée, associée au compte et vérifiée par rapport à l'historique. |
| `useProfileSubscriptionMonitor` / `Lifecycle` | Vérification de la référence, suivi borné, reprise et nettoyage des effets. |
| `useProfileSubscriptionCard` / `Recovery` / `Checkout` | Retour carte, récupération d'une tentative existante, validation et lancement du paiement. |

## États et réseau

- L'utilisateur authentifié reste dans Redux Toolkit ; le profil, les véhicules, avis, paiements et abonnements restent dans le cache RTK Query. Aucun nouveau store concurrent ni appel HTTP direct n'est ajouté.
- Les états d'interface, PIN et OTP restent locaux. Les PIN/OTP ne sont pas copiés dans un slice global ; les contrats réseau existants restent inchangés.
- La référence de paiement conserve son stockage et son expiration existants. Une erreur réseau incertaine déclenche une recherche de la tentative existante, pas un nouvel envoi automatique.
- Les dépendances des hooks extraits incluent les setters/refs stables reçus en paramètres. Le rafraîchissement de l'abonnement garde une identité stable pendant la restauration d'une référence, pour ne pas annuler son propre effet.

Le découpage ne supprime pas le suivi d'abonnement historiquement présent dans le profil. Le rapprochement de ce suivi avec celui de l'écran de paiement dédié est un chantier distinct : il nécessite de vérifier les parcours après fermeture du paiement avant de retirer un propriétaire du suivi.

## Vérifications

```sh
npm run test:profile
npm run test:trip-request
npm run test:performance
npm run test:referrals
npm run check:network
npx tsc --noEmit
```

Les tests utilisent le code TypeScript réel et simulent les API et les effets natifs. Ils couvrent notamment l'isolation des références de paiement, leur expiration, le rafraîchissement passager/conducteur, les véhicules, le PIN/OTP, l'arrêt du suivi au démontage et la récupération sans second paiement.

Résultats locaux : 12 tests du profil et 33 tests existants réussis ; TypeScript et ESLint ciblé sans erreur ni avertissement ; frontières HTTP valides ; exports Expo/Hermes Android/iOS avec source maps réussis. Une comparaison syntaxique des 229 définitions de styles extraites ne relève aucun changement de valeur par rapport au profil précédent.

À vérifier sur téléphone : ouverture/fermeture des modals, clavier Android/iOS, prise de photo, confirmation de suppression, PIN oublié, KYC passager/conducteur, retour carte et reprise Mobile Money. Les tests locaux et l'export des bundles ne constituent pas une validation sur appareil réel.
