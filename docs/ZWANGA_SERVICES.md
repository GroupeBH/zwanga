# Zwanga Services — socle opérationnel et activation progressive

Date : 24 septembre 2026. Périmètre : application mobile `zwanga`, backend
`zwanga-backend`, site public et administration `zwanga-admin`.

## Problème et décision de périmètre

Le profil renvoyait vers un formulaire web de documents présenté comme un
« pack Pro ». Les demandes web étaient enregistrées dans MongoDB, tandis
qu’un autre mécanisme existait dans les abonnements du backend. Ils ne
constituaient pas un dossier commun ni un registre financier et de garde.

Le nom générique devient **Zwanga Services** ; l’entrée mobile est
**Services pro**. L’abonnement Pro existant reste indépendant.

L’utilisateur a confirmé ne pas disposer de contrat validé : les engagements
financiers sont donc **verrouillés par défaut**. La première version permet
la collecte des besoins, l’étude et la préparation de devis. Aucun contrat
fictif, taux d’intérêt ou autorisation de garde n’est prérempli.

## Modifications effectivement appliquées

### Application mobile

- `components/profile/ProfileDocumentsCard.tsx` et
  `hooks/profile/useProfileController.ts` ouvrent les services sans navigateur :
  onglet dédié pour un conducteur, `/services` pour un passager.
  L’accès n’exige plus d’avoir terminé l’inscription comme conducteur.
- `features/pro-services/ServicesScreen.tsx`, partagé par `app/services/index.tsx`
  et `app/(tabs)/discover.tsx` : catalogue, dossiers de l’utilisateur,
  pagination par vingt et actualisation explicite.
- `app/services/new.tsx` : besoin, coordonnées, documents souhaités, véhicule
  et plaque facultatifs ; accord de contact distinct d’un accord de financement.
- `app/services/[id].tsx` : étape, message de l’équipe, devis, échéances,
  conditions, montants enregistrés et originaux. Acceptation explicite d’une
  version de devis ; annulation avant engagement. Les compléments demandés
  par l’équipe sont pour l’instant traités par contact humain : pas de nouvelle
  messagerie de dossier.
- `features/pro-services/ServiceLayout.tsx` : écrans sobres, défilants, zones
  sûres et adaptation au clavier. Aucun nouveau modal natif ni animation.
- `features/pro-services/model.ts`, `types/proServices.ts`,
  `store/api/proServicesApi.ts` : libellés, montants et contrats API. Le transport
  authentifié RTK Query est conservé ; l’état des formulaires reste local.

Aucun watcher GPS, coordinateur global ou intervalle de polling n’est ajouté.
Les consultations sont suspendues hors écran actif. Le tag `ProServices`
n’invalide pas les trajets, le wallet ou la navigation. Le détail utilise les
données du dossier courant, pas celles du dossier précédemment consulté.
Une réponse tardive n’ouvre aucun modal global et ne redirige pas automatiquement.

### Site et administration

- `/demande-documents` et `/enquiry` gardent leurs adresses, avec le nom Zwanga
  Services. Le lien du pied de page est renommé.
- `app/demande-documents/FormWizard.tsx` charge les offres du backend et ne
  présente plus les anciens prix codés en dur comme prix applicables.
- `app/api/demandes/route.ts` transmet les nouvelles demandes au backend partagé,
  avec validation, accord de contact, taille limitée à 16 000 octets, contrôle
  d’origine, absence de cache et délais réseau bornés.
- `lib/features/proServices/publicRequest.ts` borne également l’attente du
  navigateur. Une panne backend ne provoque pas de repli silencieux vers MongoDB.
- `/pro-services` est ajouté au menu d’administration : liste filtrée, détail,
  devis, étapes, rattachement vérifié d’un compte, écritures et originaux.
  Découpage : `page.tsx`, `CaseOperations.tsx`, `QuoteForm.tsx`,
  `ServiceConfiguration.tsx`, `services.module.css`.
- `lib/features/proServices/proServicesApi.ts` utilise RTK Query. Le menu
  n’ajoute aucune interrogation permanente des dossiers.

### Backend

Nouveau module `src/pro-services/`, enregistré dans `src/app.module.ts` :

| Fichier | Responsabilité |
| --- | --- |
| `pro-service.types.ts`, `pro-service.dto.ts` | Catalogue, états et validation |
| `pro-service.entities.ts` | Offres, dossiers, écritures, documents, événements |
| `pro-service.store.ts` | Création idempotente, pagination et lecture cloisonnée |
| `pro-service.workflow.ts` | Devis, acceptation, étapes, rattachement du titulaire |
| `pro-service.configuration.ts` | Ouverture des demandes, contrat validé/versionné |
| `pro-service.policy.ts` | Montants, échéances et transitions autorisées |
| `pro-service.finance.ts` | Versements vérifiés et garde/restitution |
| `pro-services.controller.ts`, `pro-services.module.ts` | Routes et droits d’accès |

La migration `1780000041000-AddProServices.ts`, enregistrée dans
`src/database/migrations/index.ts`, ajoute cinq tables PostgreSQL indépendantes.
Les entités sont enregistrées dans `src/database/entities.ts`.

UUID, dates `timestamptz`, références financières uniques, contraintes de
domaine et index de pagination/liaison sont utilisés. Les montants sont des
**entiers en centièmes de devise**, y compris en CDF : `150025` représente
`1 500,25 CDF`. Le devis définit CDF ou USD ; aucune conversion n’est effectuée.

## Parcours et contrôles métier

1. Le dépôt avec accord de contact et clé de soumission ne crée ni dette,
   ni prélèvement, ni abonnement Pro.
2. L’administration propose un devis versionné : coût total, apport, prestataire,
   description des coûts, échéances, expiration, originaux et contrat applicable.
3. Sans contrat validé, un devis peut être préparé **sans originaux**, mais le
   serveur refuse son acceptation.
4. Un super-administrateur pourra configurer un contrat réellement validé :
   texte, version, référence de validation et documents expressément autorisés.
   Une nouvelle version nécessite de refaire les devis non encore acceptés.
   Une ancienne version ne peut pas être réécrite sous le même numéro.
5. Le titulaire accepte lui-même dans l’app. Le backend contrôle la propriété,
   l’activité du compte, le dernier contrôle d’identité approuvé, la version,
   l’expiration et le contrat. Un verrou du compte empêche les engagements
   simultanés quand un autre dossier engagé/non remboursé reste en cours.
6. Après versements réels et vérifiés, l’administration enregistre l’apport,
   puis l’avance exacte au prestataire. Ces écritures sont des **constats
   manuels**, pas des transferts FlexPay. Le traitement requiert ces écritures,
   ou l’apport intégral pour un dossier sans avance.
7. Étapes : accepté → en traitement → prêt à remettre → démarches terminées.
   La fin administrative ne signifie pas dette remboursée.
8. Les remboursements réduisent le solde, sans pouvoir le dépasser. Ils sont
   affectés aux échéances les plus anciennes en premier.
9. La garde exige un original prévu au devis accepté, un contrat l’autorisant,
   une avance enregistrée, un lieu de conservation et un reçu. Le remboursement
   complet rend les originaux « à restituer » ; une autre action avec reçu
   constate leur restitution physique.

Un nouveau contrat ne remplace pas celui déjà accepté. La pause ou la
désactivation juridique bloque de nouveaux engagements, versements et gardes,
mais pas l’enregistrement des remboursements ni les restitutions déjà dues.

La garde d’un original n’est pas présentée comme une sûreté juridiquement
constituée. Avant activation réelle, faire valider localement les contrats,
coûts, échéanciers, autorisations de financement, documents conservables,
droits de restitution, litiges et protection des données. Cocher une case
administrative dans le logiciel ne constitue pas cette validation juridique.

## Accès, preuves et doublons

- Public : catalogue et dépôt uniquement, jamais coordonnées des dossiers,
  contrats, historiques ou soldes.
- Routes `mine` : filtre par compte authentifié, jamais par téléphone déclaré.
- Exploitation : administrateur. Configuration juridique et activation :
  super-administrateur. Les gardes d’authentification existants sont conservés.
- Le dossier web n’a initialement aucun compte propriétaire. L’administration
  doit vérifier le titulaire, choisir un compte au téléphone vérifié et
  documenter le rapprochement. Pas d’attribution automatique par numéro déclaré.
- Version du devis, consentement et conditions acceptées sont conservés.
  Les justificatifs sont des **références/textes**, pas des fichiers téléversés.
- Journal et écritures sont append-only **via les API proposées**, pas protégés
  contre un administrateur de base de données disposant d’accès directs.
- Les opérations financières sont sérialisées par verrou du dossier. Une même
  référence rejoue le résultat ; une opération différente utilisant cette
  référence est refusée. Un index interdit plusieurs avances pour un dossier.
  Les transactions n’effectuent aucun appel réseau.
- Le formulaire garde clé et contenu après résultat réseau incertain. Un
  429/401 ultérieur n’efface pas l’incertitude du premier envoi. Cette reprise
  reste **en mémoire pendant le montage**, pas dans une file persistante après
  fermeture forcée/rechargement : consulter les dossiers ou contacter l’équipe
  avant de recréer la demande après une telle fermeture.
- Les lectures du titulaire masquent le lieu de stockage, les références
  juridiques et les justificatifs comptables internes. Les listes ne chargent
  pas les contrats complets ; l’historique récent est limité à cinquante événements.

## Activation future et fonctionnalités différées

`vehicles`, `equipment`, `fleet` démarrent en `coming_soon`. Le super-admin
peut ouvrir leur **collecte de demandes**. Le serveur refuse encore devis
engageants et financement pour ces codes : ouvrir le catalogue n’active pas
un crédit véhicule ni une gestion opérationnelle de flotte.

Restent à construire : contrats/garanties spécifiques, véhicules/équipements
financés, opérations de flotte, versements automatiques, remboursements intégrés,
assurance, défauts et litiges. Ne sont pas ajoutés : retenues sur gains,
intérêts automatiques, corrections/remboursements d’apports via UI, signature
ou téléversement de contrats, notifications automatiques, import historique.

## Refonte UX mobile — 24 septembre 2026

### Problème et interface appliquée

L’écran initial alignait quatre offres avec de longues descriptions avant le
suivi des demandes. Le formulaire présentait toutes les coordonnées, le véhicule,
dix documents et le consentement dans un seul défilement.

- Catalogue : une présentation mise en avant pour chaque service réellement
  ouvert, un bouton « Faire une demande », puis « Mes dossiers ». Les futurs
  services restent dans une liste secondaire non interactive, sans promesse de
  disponibilité. Les dossiers montrent leur statut, la date et, si présent,
  un aperçu du message de l’équipe. Actualisation manuelle et pagination conservées.
- Étape 1, **Votre besoin** : documents sélectionnables avec compteur et état
  accessible ; précisions facultatives repliées. Pour un futur service ouvert,
  description du besoin obligatoire, sans documents imposés artificiellement.
- Étape 2, **Coordonnées** : nom et téléphone préremplis depuis le compte,
  modifiables pour cette demande sans changer le profil. Véhicule et plaque
  facultatifs derrière un contrôle dépliable.
- Étape 3, **Vérification** : récapitulatif, liens « Modifier », consentement
  explicite au contact et rappel de l’absence d’engagement financier. Modifier
  une valeur remet ce consentement à zéro.
- Après succès : confirmation réelle du serveur, prochaines étapes et choix
  entre suivi du dossier et retour aux services, sans redirection automatique.

Style : surfaces claires, texte bleu sombre, accent orange réservé aux actions
et sélections ; offre ouverte légèrement teintée, listes avec séparateurs,
statuts libellés et contrastés. Pas d’images téléchargées, d’ombre lourde ou de
nouvelle animation. Retour visuel à l’appui, sélection et dévoilement progressif
des champs remplacent les effets décoratifs.

### Structure et protections conservées

- `app/services/index.tsx` : lectures actives RTK Query, erreurs/états vides,
  pagination et orchestration du catalogue.
- `app/services/new.tsx` : chargement et sélection du service ; formulaire
  identifié par service et compte, sans reprise des coordonnées d’un autre compte.
- `features/pro-services/ServiceCatalogue.tsx` : offre, services futurs et lien
  de dossier réutilisables.
- `ServiceRequestForm.tsx`, `ServiceFormFields.tsx`, `ServiceFormReview.tsx`,
  `ServiceForm.styles.ts` dans ce même dossier : étapes, champs, récapitulatif
  et styles séparés, tous sous 400 lignes.
- `ServiceLayout.tsx` : pied d’écran optionnel à l’intérieur de la gestion du
  clavier, safe areas conservées, référence de défilement et retour personnalisables.
  L’écran de détail du dossier conserve ses règles et ses actions existantes.
- `proServiceFormModel.ts` : validation localisée et copie nettoyée des données
  au moment de l’envoi ; formats conformes au contrat API existant.
- `useProServiceForm.ts` : état transitoire local au formulaire ; données serveur
  toujours via RTK Query. Pas de nouvelle requête ni de nouveau polling.

Le retour d’étape conserve la saisie. L’écoute du retour Android ne fonctionne
que sur cet écran actif et se nettoie à sa sortie. La fermeture du clavier et le
repositionnement du défilement ne s’exécutent pas en arrière-plan sur un autre
écran. Les erreurs sont visibles près des champs et au-dessus du bouton principal.

Une référence synchrone protège le double appui avant même le rendu de l’état
RTK « chargement ». Après un délai dépassé ou une erreur réseau incertaine,
l’édition est verrouillée et « Vérifier mon envoi » rejoue **le même corps et la
même clé**. Un refus ultérieur 429/401 ne permet pas de conclure que le premier
envoi n’a pas été enregistré : sa clé reste donc conservée. Un premier refus
définitif 4xx permet la correction et un nouvel envoi. Une réponse tardive après
démontage n’écrit plus l’état UI.

Pendant un envoi/état incertain, le retour contrôlé ouvre la liste au-dessus du
formulaire pour garder sa tentative en mémoire ; le geste de fermeture iOS est
désactivé dans cet état. Cela **ne constitue pas une sauvegarde persistante** :
une fermeture complète ou un démontage du formulaire perd encore le brouillon
et sa clé locale. Vérifier « Mes dossiers » avant de recréer une demande après
un tel arrêt. Aucun stockage de données personnelles sur disque n’a été ajouté.

Les validations de contrat, devis et garde d’originaux restent côté serveur.
Cette refonte ne touche ni le backend ni le site/admin, n’active aucun futur
service et ne modifie ni les versements ni les paiements des trajets.

### Vérifications de cette refonte

- `node --test tests/proServices.test.js tests/proServiceForm.test.js tests/proServiceUI.test.js tests/profileModules.test.js` : **36/36 réussis**, dont
  **15 nouveaux tests**. Les tests UI inspectent des composants React avec les
  primitives natives simulées : ce ne sont pas des captures ni des essais natifs.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` : valide.
- `node --test tests/formSafeArea.test.js` : **9/9**, non-régression des layouts
  de formulaires existants (simulations JavaScript, pas de rendu natif).
- `node scripts/check-source-size.cjs` : **929 sources**, aucune > 400 lignes.
- `node scripts/check-network-boundaries.js` : valide ; `git diff --check` valide.
- Suite mobile globale non relancée pour cette refonte ; le résultat global
  de l’implémentation initiale ci-dessous est historique, pas une nouvelle mesure.

À recetter sur appareils : petit écran et grande police, clavier téléphone sur
iPhone, clavier Android et barre de navigation, passage entre les trois étapes,
retour matériel, retour du background pendant un envoi, affichage d’un devis et
de ses conditions dans le détail. Aucune validation visuelle ou de performances
natives réalisée ; aucune promesse de disparition des freezes/crashs.

## Onglet Services selon le compte — 24 septembre 2026

### Problème et choix appliqué

L’accès par le profil rendait les services peu visibles pour les conducteurs.
La recherche reste néanmoins une fonction principale pour les passagers.
La même route interne ne doit pas afficher des services quand un lien demande
explicitement la recherche.

| Compte | Deuxième onglet | Recherche depuis l’accueil | Services depuis le profil |
| --- | --- | --- | --- |
| Passager | Recherche | Écran `/search` | Écran `/services` |
| Conducteur ou mixte | Services | Écran `/search` | Onglet `/(tabs)/discover` |

La capacité conducteur dépend de `auth.user.role` (`driver` ou `both`) ou de
`auth.user.isDriver`. Une vérification d’identité seule, un véhicule ou le rôle
tenu dans le trajet courant ne change pas les onglets. Le sélecteur partagé
renvoie un booléen : une position GPS ou un solde modifié ne change pas sa valeur.
Un conducteur voyageant comme passager conserve donc son accès Services, tandis
que la bannière de son trajet ouvre toujours sa navigation passager.

### Fichiers et protections

- `features/navigation/accountTabPolicy.ts` : règle commune, cible depuis le
  profil et espace réservé à la barre superposée iOS.
- `app/(tabs)/_layout.tsx` : cinq routes stables, deuxième libellé/icône adaptés.
  L’ancien alias `app/(tabs)/search.tsx` est remplacé par `discover.tsx`.
  Aucun consommateur de l’ancien chemin qualifié n’a été trouvé dans le projet.
  `/search` reste l’écran autonome et les liens de l’accueil sont inchangés.
- `app/(tabs)/discover.tsx` : rend uniquement le catalogue ou la recherche,
  selon le même sélecteur ; pas deux écrans cachés montés en parallèle.
- `features/pro-services/ServicesScreen.tsx` et `app/services/index.tsx` : une
  seule implémentation du catalogue, également disponible hors des onglets.
- `features/pro-services/ServiceLayout.tsx` et `app/search.tsx` : pas de bouton
  retour à la racine d’onglet ; marge calculée via la hauteur réelle de la barre
  iOS. Android réserve déjà cette hauteur dans son layout. Les écrans autonomes
  gardent leur retour, et les formulaires leurs zones sûres et gestion du clavier.
- `hooks/profile/useProfileController.ts` : le lien Services sélectionne
  l’onglet existant pour les conducteurs ; les passagers gardent l’écran autonome.
- `hooks/profile/useProfileOnboarding.ts` : le succès réel de l’activation
  conducteur actualise uniquement `role`/`isDriver` dans Redux. Les identifiants
  de la demande, de la réponse et du compte encore connecté doivent correspondre.
  Un refus ou une réponse concernant un compte quitté ne change pas les onglets.
  Cette synchronisation n’accorde aucun droit serveur et ne remplace pas le JWT.

Les formulaires et détails `/services/new` et `/services/[id]` restent hors de
la barre. Les retours vers `/services` pendant un envoi incertain sont conservés
pour ne pas démonter le formulaire qui garde sa clé et son contenu en mémoire.
Le changement du deuxième onglet ne réinitialise pas les quatre autres.

`lazy: true` explicite le montage différé. Les options `freezeOnBlur` et
`detachInactiveScreens` existantes sont préservées, notamment les exceptions
Android, accueil et messagerie. Aucun coordinateur, intervalle, paquet natif ou
mutation backend ajouté. Les lectures Services gardent `skip` hors écran actif,
leur cache RTK Query, l’actualisation explicite et la pagination. La recherche
garde sa liste virtualisée, son filtrage et son état local lors des retours.

### Vérifications et limites

- **92/92 tests JavaScript ciblés** : `accountTabs`, `proServices`,
  `proServiceForm`, `proServiceUI`, `searchScreen`, `searchOwnTrips`,
  `compactSearchCards`, `profileModules`, `screenIdlePolicy`,
  `ongoingTripBanner`, `formSafeArea` (`tests/*.test.js`).
- **13 nouveaux cas** : cinq onglets, comptes passager/conducteur/mixte,
  espace iOS/Android, liens, absence de flèche retour dans l’onglet,
  suspension des lectures et activation conducteur sans mélange de comptes.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` : valide.
- Garde-fous : **931 sources**, aucune > 400 lignes ; frontière réseau valide ;
  `git diff --check` valide. Suite globale non relancée pour cette modification.
- Les rendus React sont inspectés avec primitives natives simulées. Aucun
  essai sur téléphone, mesure mémoire/CPU, capture native ou déploiement effectué.

Recette native restante : ouvrir Recherche avec un passager et Services avec
un conducteur ; utiliser Chercher depuis l’accueil pour les deux ; ouvrir un
dossier/formulaire et revenir ; vérifier clavier, grandes polices et bas d’écran
iOS/Android ; activer un compte conducteur, se déconnecter puis changer de
compte ; vérifier que la bannière de navigation conserve la bonne réservation.
Les changements de rôle effectués hors de l’application restent dépendants de
la mise à jour de la session Redux existante, sans nouveau polling de profil.
Les validations de contrat et les services futurs restent inchangés.

## Déploiement et préservation de l’existant

1. Sauvegarder et essayer la migration sur une base de préproduction. Déployer
   les tables avant l’API, le site et le mobile avec le processus TypeORM
   existant. Ne pas activer `synchronize` en production.
2. Vérifier la variable **existante** `NEXT_PUBLIC_API_PUBLIC_URL` du site :
   même base API et même préfixe de version que les autres routes admin.
   Aucune valeur de configuration n’a été modifiée.
3. Vérifier les IP derrière le reverse proxy : le frontal de confiance doit
   remplacer les en-têtes IP clients. Sans transmission d’IP, les limites
   publiques peuvent être partagées entre visiteurs du serveur web.
4. Laisser les conditions à `null` jusqu’à validation réelle. Ne pas utiliser
   un contrat d’exemple pour déverrouiller la production.
5. Tester avec deux utilisateurs, un admin et un super-admin, des données
   fictives, des accès croisés et des doubles soumissions.

Les anciens enregistrements MongoDB, modèles et demandes de financement
d’abonnement sont conservés, sans migration automatique. Les nouvelles demandes
web vont uniquement au backend commun. L’ancien formulaire est remplacé,
**pas les données anciennes**.

Trajets, réservations, navigation, wallet, FlexPay, gains et abonnements ne sont
pas modifiés par ce module. Aucun paquet natif ajouté. La méthode `down` refuse
de supprimer des données financières : conserver les tables pour un retour
applicatif ou prévoir une procédure de sauvegarde/réparation contrôlée.

## Vérifications réalisées et limites

- TypeScript sans émission : mobile, backend et administration valides.
- Backend : **31 nouveaux tests réussis**, couvrant règles, verrou juridique,
  propriété, rejouabilité, remboursements, garde et migration. SQL simulé : pas
  de preuve de concurrence sur un vrai PostgreSQL ni de migration réelle.
- Mobile : **3 nouveaux tests réussis** ; suite ciblée avec profil **21/21**.
- Suite mobile globale : **916 tests, 914 réussis, 2 échecs préexistants** dans
  `tests/sourceExtractions.test.js`, empreintes des styles de réservations et de
  `store/api/userApi.ts`. Ces références historiques n’ont pas été réécrites.
- Site : **5 tests nouveaux réussis** dans
  `lib/features/proServices/proServices.test.cjs` : proxy, refus/erreurs,
  consentement/origine/taille, conversion exacte des montants et délai navigateur.
- Mobile : **922 fichiers, aucun au-dessus de 400 lignes**, frontière RTK Query
  valide. Nouveaux fichiers des trois projets sous 400 lignes.
  `git diff --check` valide dans les trois projets.

Aucune migration réelle, opération financière, livraison de document ou mise
en production exécutée. Pas de validation visuelle navigateur ou appareil
physique. Ces tests JavaScript/TypeScript ne garantissent pas l’absence de
crash natif, chauffe ou défaut de clavier : recette iPhone et Android nécessaire.

```text
Mobile : node --test tests/proServices.test.js tests/profileModules.test.js
Backend : node node_modules/jest/bin/jest.js pro-service --runInBand --silent
Site : node --test lib/features/proServices/proServices.test.cjs
```
