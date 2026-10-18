# Attribution mobile du parrainage ChottuLink

Date : 27 août 2026 — mise à jour le 7 octobre 2026
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
3. L'invitation est enregistrée localement **avant** la requête publique de validation,
   dans `zwanga.unresolved-referral-attribution.v1`. Ce stockage séparé n'est pas
   considéré comme un parrainage validé par le formulaire d'inscription.
4. L'API publique confirme le parrain, puis l'invitation est transférée vers le
   stockage validé existant. La durée maximale locale reste trente jours depuis
   la capture initiale : une nouvelle tentative ne renouvelle pas cette date.
5. Sans session, l'app ouvre l'authentification et présente inscription et connexion.
6. Avec session, aucune navigation d'authentification n'est effectuée.
7. Après inscription ou rattachement authentifié réussi, l'attribution est consommée.

Les événements natifs identiques reçus plusieurs fois dans une fenêtre de dix secondes sont ignorés. Si un second parrain est présenté alors qu'une première invitation reste valide, le premier lien reste prioritaire et l'utilisateur en est informé.

### Reprise après perte réseau

`ReferralAttributionHandler` observe l'état réseau RTK Query déjà alimenté par
`nativeQueryListeners`, ainsi que l'activité de l'application. Il reprend les
invitations à valider ou à rattacher au démarrage, au retour au premier plan,
au passage hors ligne → en ligne et lors de l'authentification. Les requêtes ne
partent que lorsque l'app est active et que le réseau n'est pas déclaré hors ligne.
Il n'y a ni polling ni nouvelle dépendance.

Les traitements sont sérialisés : une reconnexion pendant une requête en échec
est mise en attente, sans être perdue derrière un verrou. Les doublons natifs
n'empêchent pas une reprise réseau. Les incidents d'analytics ne bloquent pas
le stockage ou le rattachement. Un échec d'écriture locale ne produit pas le
message « Invitation conservée » et permet de rouvrir immédiatement le lien.

La reprise ne réinitialise pas un formulaire `/auth` déjà ouvert. Une invitation
validée après le début de l'inscription reste disponible pour sa soumission ou
pour le rattachement authentifié après connexion. Les règles serveur
(auto-parrainage, parrain existant, expiration, gains) restent inchangées.

## Politique d'erreur

| Situation | Traitement mobile |
| --- | --- |
| 400, 409 ou 422 | refus métier définitif : candidat supprimé à la validation, invitation consommée au rattachement |
| 404 sur la route authentifiée | invitation conservée pour couvrir un déploiement progressif |
| 401 ou 403 | invitation conservée, session traitée séparément par l'authentification |
| erreur réseau, délai, 429 ou 5xx | invitation conservée ; reprise à la reconnexion, au retour au premier plan ou au prochain lancement |

Une erreur de rattachement n'appelle jamais la déconnexion. Le backend reste l'autorité pour empêcher l'auto-parrainage et le changement de parrain.

Limites : cette persistance commence lorsque le SDK livre un jeton de parrainage
à JavaScript. Elle ne remplace pas la résolution native d'un lien court ChottuLink
non encore livré à l'app, ni la configuration des App Links. Elle ne restaure pas
les invitations déjà perdues dans les anciennes versions. Les interruptions
réseau/serveur sans changement d'état réseau sont retentées au prochain retour
au premier plan ou lancement, pas en boucle. La suppression des données de l'app
efface les invitations locales. Aucun changement ni réparation de données en
production n'est réalisé par ce correctif.

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
6. provoquer une erreur de `/referrals/resolve-attribution` après livraison du lien
   par le SDK, puis rétablir la connexion sans recliquer sur le lien ;
7. vérifier la nouvelle tentative automatique, puis répéter en fermant/relançant
   l'app pendant la panne et en revenant au premier plan après reconnexion ;
8. ouvrir deux liens différents avant consommation et vérifier le message « Première invitation conservée » ;
9. tester un nouveau compte et un compte existant avec téléphone, Google et Apple ;
10. vérifier le lien depuis une version Google Play signée en production.

Effectuer cette recette sur Android et iOS physiques, conducteur et passager,
avec un compte sans parrain. Vérifier aussi l'inscription en cours, l'expiration,
un refus métier, le premier lien prioritaire et l'absence de double rattachement.
Les tests Node couvrent le composant et les fonctions de stockage réels avec
réseau, SDK, cycle React et AsyncStorage simulés ; ils ne valident pas les App
Links, le stockage natif ou la livraison ChottuLink sur un appareil physique.
