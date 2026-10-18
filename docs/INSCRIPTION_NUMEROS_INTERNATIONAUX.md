# Inscription avec un numéro étranger — 8 octobre 2026

## Périmètre et constat

Inscription par téléphone, numéro demandé après Google/Apple, connexion par PIN
et traitement commun des OTP dans le backend NestJS.

La création de compte côté serveur n'imposait pas d'indicatif congolais. Le
problème se trouvait dans l'aide/validation mobile et surtout dans la conversion
OTP : après avoir retiré `+` ou `00`, un numéro étranger de 8 à 10 chiffres pouvait
être interprété comme un numéro national et recevoir un indicatif supplémentaire.
Le traitement était dupliqué dans le fournisseur SMS historique Keccel.

## Solution appliquée

- Saisir un numéro étranger avec `+` ou `00`, puis son indicatif et son numéro
  international. Le champ ne suggère plus exclusivement un indicatif congolais ;
  une ligne courte explique cette possibilité, également après Google/Apple.
- Le contrôle mobile compte les chiffres, pas les caractères de mise en forme.
  Les numéros internationaux explicites de 7 à 15 chiffres sont recevables ;
  lettres, préfixes malformés et longueurs excessives sont rejetés avant l'envoi.
  C'est un contrôle syntaxique, pas une validation exhaustive des plans nationaux.
- Le backend retire un seul préfixe international, sans appliquer ensuite le pays
  par défaut. Les zéros appartenant au numéro national après l'indicatif restent
  intacts. Didit reçoit le numéro avec `+`, Keccel avec les chiffres seuls.
- Le calcul de la clé du challenge et l'envoi/contrôle fournisseur utilisent le
  même traitement. Un code ne peut pas valider une autre destination ou un autre
  usage ; les protections d'expiration et de consommation unique restent actives.
- Pas de sélecteur de pays, de dépendance ou de modification native ajoutée.

## Fichiers

Application :

- `features/auth/authPhone.ts` : validation syntaxique et messages français.
- `components/auth/steps/PhoneStep.tsx` et `GooglePhoneStep.tsx` : champ, aide,
  remplissage téléphonique, accessibilité et état du bouton.
- `hooks/auth/usePhoneAuthActions.ts` et `useSocialPhoneVerification.ts` : même
  validation lors de la soumission ; imports de types sociaux remis en tête.
- `features/screen-styles/components/auth/styles/inputLabelSmall.styles.ts` : aide
  compacte, sans tronquer le texte ni désactiver le grossissement système.
- `tests/authInternationalPhone.test.js` et `package.json` : nouvelle couverture
  de régression, intégrée à `test:otp`.

Backend voisin :

- `src/otp/otp-phone.util.ts` : indicatif explicite prioritaire.
- `src/keccel-otp/keccel-otp.service.ts` : suppression de la normalisation dupliquée.
- `src/otp/otp-phone.util.spec.ts`, `src/otp/otp.service.spec.ts` et
  `src/keccel-otp/keccel-otp.service.spec.ts` : tests sans message réel.

## Compatibilité et limites

Les identifiants de compte ne sont pas réécrits : le téléphone saisi, seulement
trimé, reste transmis à l'inscription et à la connexion. Les comptes historiques
restent recherchés selon leur format enregistré. L'unification future de toutes
les variantes d'un même numéro en base nécessite un traitement séparé des
collisions/anciens comptes ; aucune migration de ce type n'est appliquée ici.

Les parcours congolais, l'auto-connexion PIN, les brouillons d'inscription, les
verrous de chargement et le drapeau OTP existant sont conservés. Le format correct
du numéro ne prouve pas sa possession ; aucun nouveau statut serveur « vérifié »
n'est accordé sur cette seule base. Les conditions Mobile Money ne changent pas.

La disponibilité de la livraison selon le pays/canal dépend aussi du fournisseur :
[documentation Didit](https://docs.didit.me/core-technology/phone-verification/overview).
Aucun envoi international réel ni vérification de couverture d'un compte Didit
n'a été effectué. Un challenge affecté par l'ancien mauvais indicatif peut devoir
être renvoyé après la mise à jour du serveur ; aucune réinterprétation d'un ancien
challenge sous une autre destination n'est tentée.

## Vérifications effectuées

- 100 tests mobile réussis : numéros internationaux, OTP/collage, récupération
  PIN, auto-connexion, chargement après succès, clavier et brouillons. Les neuf
  tests internationaux ont aussi été rejoués après le dernier ajustement.
- 120 tests backend réussis : normalisation, routage Didit/Keccel, rejet d'une
  mauvaise destination, consommation unique, vérification utilisateur, politique
  de réservation du numéro, récupération PIN et inscription conducteur/sociale.
- TypeScript mobile et backend : réussite. ESLint mobile ciblé : aucune erreur
  ni avertissement après déplacement des imports. Formatage des tests backend,
  contrôle de taille des sources et diff ciblé : réussite.
- Il s'agit de tests JavaScript/TypeScript avec E/S simulées. Aucun résultat
  de livraison WhatsApp/SMS, d'affichage natif ou de performance physique n'est
  revendiqué. Les changements KYC/finance/notifications concurrents sont préservés.

## Recette à réaliser et mise à disposition

1. Charger le backend corrigé en développement et l'application via Metro avec
   un client natif existant. Aucun nouveau module natif n'est nécessaire.
2. Sur iOS et Android, saisir un numéro étranger contrôlé par le testeur avec
   indicatif explicite, puis recevoir et valider son propre code. Tester notamment
   un numéro international court, sans utiliser les numéros fictifs des tests.
3. Terminer l'inscription, se déconnecter, puis se reconnecter avec le même numéro
   et le PIN. Vérifier aussi la récupération du PIN et le parcours Google/Apple.
4. Refaire le parcours avec un numéro congolais, le collage d'un numéro avec
   espaces, puis une valeur malformée. Contrôler le message d'erreur et les boutons.
5. Vérifier la conservation de l'étape OTP après un aller-retour dans WhatsApp.

Commandes de contrôle depuis les dépôts respectifs :

```powershell
# Application
npm.cmd run test:otp
node --test tests/pinAutoLogin.test.js tests/authSubmissionLoading.test.js tests/authFlowDraft.test.js tests/authKeyboardLayout.test.js
npx.cmd tsc --noEmit --incremental false

# Backend
npx.cmd jest --runInBand src/otp/otp-phone.util.spec.ts src/otp/otp.service.spec.ts src/otp/didit-otp.service.spec.ts src/keccel-otp/keccel-otp.service.spec.ts src/users/users.service.otp.spec.ts src/users/registration-phone.policy.spec.ts src/auth/pin-reset.spec.ts src/auth/driver-signup.spec.ts
npx.cmd tsc --noEmit --incremental false -p tsconfig.build.json
```

Pour les utilisateurs de production, il faut diffuser le code mobile corrigé et
déployer le backend corrigé via les procédures habituelles. Aucun déploiement,
build store, changement d'environnement ni migration n'a été exécuté pour cette
fonctionnalité.
