# Changement et oubli du PIN

Les parcours de connexion et de profil utilisent le même contrat que le backend sécurisé.

| Parcours | Appel |
| --- | --- |
| Connexion | `POST /auth/login` avec `{ phone, pin }` |
| Profil → Modifier le code PIN | `POST /users/pin/change` avec `{ oldPin, newPin }`, session authentifiée |
| PIN oublié → Demander ou renvoyer le SMS | `POST /auth/pin/reset/request-otp` avec `{ phone }` |
| PIN oublié → Vérifier les 6 chiffres | `POST /auth/pin/reset/verify-otp` avec `{ phone, otp }` |
| PIN oublié → Définir le nouveau PIN | `POST /auth/pin/reset` avec `{ resetToken, newPin }` |

Le PIN reste composé de 4 chiffres. Le code SMS de réinitialisation comporte 6 chiffres ; la vérification téléphonique d'inscription garde son parcours existant.

`hooks/auth/usePinResetFlow.ts` conserve le jeton en mémoire pour au maximum 5 minutes. Il l'efface lors d'un renvoi de SMS, d'une annulation, d'un changement de numéro, du démontage de l'écran et dès l'envoi de la confirmation. Les résultats des mutations sont retirés du cache RTK Query après traitement. Une réponse OTP tardive ne réactive pas un parcours annulé.

Après succès, l'utilisateur se reconnecte avec son nouveau PIN. Dans le profil, les tokens locaux sont supprimés et l'action de déconnexion nettoie les données de session. En cas d'expiration ou d'échec ambigu de confirmation, le parcours revient au SMS et demande un nouveau code ; il ne réutilise pas le jeton.

Vérification automatisée : `node --test tests/pinReset.test.js tests/profileModules.test.js`.

Vérification sur téléphone : tester le PIN oublié depuis la connexion et depuis le profil, le changement avec ancien PIN correct/incorrect, le collage des 6 chiffres, le renvoi du SMS, un jeton expiré et le retour à la connexion. Les tests locaux simulent les appels réseau ; ils n'envoient pas de SMS Keccel.
