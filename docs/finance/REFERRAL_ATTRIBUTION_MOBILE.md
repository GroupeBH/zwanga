# Attribution mobile du parrainage ChottuLink

Date : 27 août 2026  
Périmètre : application Expo/React Native

## Règles garanties

Une invitation rattache un nouveau compte ou un compte existant sans parrain. Un compte déjà rattaché ne change jamais de parrain. Le rattachement d'un compte existant ne rémunère aucun paiement antérieur à `referredAt`.

Un utilisateur déjà connecté qui ouvre un lien :

- reste connecté ;
- ne navigue pas vers `/auth` ;
- ne perd aucun token de session ;
- envoie uniquement la demande authentifiée `POST /referrals/me/attribution` ;
- reçoit une confirmation ou conserve l'invitation pour une nouvelle tentative.

## Variables EAS

Les noms sources ne portent pas le préfixe Expo :

```text
CHOTTULINK_MOBILE_API_KEY
CHOTTULINK_DOMAIN=zwanga-app.chottu.link
```

`app.config.js` les lit pendant la construction et les copie dans `expo.extra`. Toute valeur disponible dans le binaire mobile doit être considérée comme publique, même si sa visibilité EAS est `sensitive`.

## Cycle du lien

1. Le SDK résout le lien direct ou différé.
2. L'app valide le fournisseur et le format du jeton.
3. L'API publique confirme le parrain.
4. Le premier lien valide est conservé trente jours.
5. Sans session, l'app ouvre l'authentification et présente inscription et connexion.
6. Avec session, aucune navigation d'authentification n'est effectuée.
7. Après inscription ou rattachement authentifié réussi, l'attribution est consommée.

Les événements natifs identiques reçus plusieurs fois dans une fenêtre de dix secondes sont ignorés. Si un second parrain est présenté alors qu'une première invitation reste valide, le premier lien reste prioritaire et l'utilisateur en est informé.

## Politique d'erreur

| Situation | Traitement mobile |
| --- | --- |
| 400, 409 ou 422 | refus métier définitif, invitation consommée |
| 404 sur la route authentifiée | invitation conservée pour couvrir un déploiement progressif |
| 401 ou 403 | invitation conservée, session traitée séparément par l'authentification |
| erreur réseau, délai ou 5xx | invitation conservée et nouvelle tentative au retour au premier plan |

Une erreur de rattachement n'appelle jamais la déconnexion. Le backend reste l'autorité pour empêcher l'auto-parrainage et le changement de parrain.

## App Links

Android utilise `com.zwanga` et `https://zwanga-app.chottu.link`. iOS utilise `QQ8LD26P99.com.biso.zwanga`. Les fichiers publics `assetlinks.json` et `apple-app-site-association` doivent rester disponibles en HTTPS.

L'empreinte Android publiée doit correspondre au certificat App Signing de Google Play. Les builds internes signés par un autre certificat nécessitent également cette empreinte pour obtenir un App Link vérifié.

## Validation

```powershell
npm run validate:referrals
npm run test:referrals
npx tsc --noEmit
npx eslint components/ReferralAttributionHandler.tsx utils/referralAttributionPolicy.js tests/referralAttributionPolicy.test.js scripts/validate-referral-config.js --no-cache
```

## Recette sur appareil réel

1. ouvrir un lien pendant qu'un compte sans parrain est déjà connecté ;
2. vérifier que l'écran courant et la session restent actifs ;
3. vérifier la confirmation du rattachement ;
4. ouvrir un lien avec un compte possédant déjà un autre parrain ;
5. vérifier le refus sans déconnexion ;
6. couper le réseau, ouvrir un lien, puis réactiver le réseau et remettre l'app au premier plan ;
7. vérifier la nouvelle tentative automatique ;
8. ouvrir deux liens différents avant consommation et vérifier le message « Première invitation conservée » ;
9. tester un nouveau compte et un compte existant avec téléphone, Google et Apple ;
10. vérifier le lien depuis une version Google Play signée en production.
