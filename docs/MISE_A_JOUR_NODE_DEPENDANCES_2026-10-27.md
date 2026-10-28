# Node et dépendances : correctifs de sécurité

Date : 27 octobre 2026. Périmètre : application mobile et dépôt voisin `zwanga-backend`.

## Constats et corrections

L’audit porte sur les dépendances npm verrouillées, l’exécution Node et les
configurations de compilation. Il ne constitue pas un test d’intrusion, une
analyse exhaustive des bibliothèques CocoaPods/Gradle ou une preuve d’exploitation.
Les compteurs npm incluent les paquets affectés indirectement : ce ne sont pas
des nombres de failles distinctes exploitables dans Zwanga.

| ID | Constat initial | Solution appliquée |
| --- | --- | --- |
| SEC-01 | Node local 24.11.0, Node non fixé pour EAS, backend/CI sur 22 sans correctif précis | Node 24.22.1 LTS fixé dans `.nvmrc`, `engines.node`, les profils EAS, le Dockerfile et les workflows backend |
| SEC-02 | Compose transmettait `NODE_BASE_IMAGE`, ignoré par le Dockerfile qui lit `NODE_VERSION` | Alignement du nom et de la valeur par défaut sur `NODE_VERSION=24.22.1` |
| SEC-03 | Mobile : 25 paquets affectés, dont 16 élevés et 9 modérés | Correctifs compatibles et substitutions ciblées gRPC, PostCSS, image-size et decode-uri-component ; Expo 54.0.38 et config-plugins 54.0.6 |
| SEC-04 | Backend : 30 paquets affectés, dont 16 élevés et 14 modérés | Mise à jour notamment de Multer, PM2, body-parser, follow-redirects, Zod et utilitaires ; substitutions gRPC, YAML et huit instrumentations OpenTelemetry |
| SEC-05 | Le décodeur d’URL corrigé exporte une fonction ESM alors que query-string 7 attend CommonJS | Adaptation limitée à l’import du `default` dans `scripts/patch-query-string-decoder.cjs`, appliquée au postinstall et vérifiée par le contrôle release |
| SEC-06 | L’export Metro a révélé que son API de lecture d’images transmettait des chemins à image-size 2, qui attend désormais des données binaires | `scripts/patch-metro-image-size.cjs` utilise l’API asynchrone `imageSizeFromFile` pour les chemins et conserve la lecture binaire existante pour les archives ; correctif appliqué au postinstall et contrôlé avant release |

Les versions de départ sont lues dans les lockfiles ; la version Node 24.11.0
est celle du terminal initial, pas une mesure du serveur de production.
Node 24.22.1 est la publication LTS de sécurité du 21 octobre 2026 :
[note officielle](https://nodejs.org/en/blog/release/v24.22.1).

## Précautions et compatibilité

- Expo reste en SDK 54, React Native en 0.81.5 ; version de l’application 1.0.18
  conservée. Les SDK Didit, Notifee et React Native Firebase ne sont pas migrés
  vers d’autres versions majeures pour faire disparaître les alertes indirectes.
- `expo-asset` est aligné sur 12.0.14, version attendue par Expo 54.0.38,
  pour éviter deux copies de ce module natif dans l’arbre npm.
- Les substitutions sont explicites dans les deux `package.json` et les
  lockfiles sont conservés. `npm audit fix --force` n’est pas utilisé.
- Une première résolution npm mobile a ajouté des copies imbriquées d’Expo 58
  via les peers. Ce résultat a été rejeté avant installation ; la contrainte
  `overrides.expo: "$expo"` maintient les résolutions sur le SDK déclaré.
- Le correctif URI échoue si l’import attendu change. Il devra être réévalué
  lors d’une migration d’Expo Router ; le supprimer sans migration casserait
  le décodage de query-string avec la version ESM corrigée.
- Le correctif Metro échoue également si le code attendu change. La nouvelle
  API lit au plus 512 Kio d’en-tête par image, conformément au code installé
  d’image-size 2.0.4. Aucun retour à la version vulnérable n’est effectué.
- Les huit versions OpenTelemetry suivent les premiers correctifs publiés
  pour supprimer l’attribut `db.user` transmis sans consentement explicite :
  [avis du mainteneur](https://github.com/open-telemetry/opentelemetry-js-contrib/security/advisories/GHSA-qqmp-wf37-98f9).
  Le registre ADOT utilisé par ECS est conservé.
- `npm run check:security` est disponible dans les deux dépôts ; il consulte
  npm et échoue à partir d’une vulnérabilité élevée. Ce contrôle réseau n’est
  pas ajouté au postinstall afin de ne pas bloquer une installation hors ligne.
- Aucun secret, fichier `.env`, compte réel, serveur de production ou base de
  production n’a été utilisé. Aucun déploiement, publication ou migration.

## Vérifications

Le binaire officiel Windows Node 24.22.1 a été téléchargé dans un dossier
temporaire, vérifié contre le SHA-256 publié par Node et utilisé pour les essais.
L’installation globale de Node sur la machine n’est pas remplacée.

- Audits finaux `npm audit --json --include=dev` : **0 vulnérabilité signalée**
  dans chacun des deux dépôts, le 27 octobre 2026. Les dépendances de
  développement sont incluses ; aucun paquet affecté n’est masqué par omission.
- Installation mobile reproductible avec `npm ci --ignore-scripts`, puis
  exécution réussie des correctifs `postinstall` existants et du correctif URI.
  L’alignement ultérieur d’Expo Asset a été installé et audité à nouveau.
- Backend : `npm ci` a rencontré une DLL Sharp verrouillée par un processus
  Windows déjà actif. Ce processus n’a pas été arrêté ; `npm install
  --ignore-scripts --include=dev` a terminé la remise en cohérence. Une
  installation backend entièrement neuve reste à vérifier en CI/Linux.
- Onze tests ciblés mobiles réussis : paramètres de navigation, entrée URI
  malformée volumineuse, lecture d’image par Metro en mémoire et depuis un
  fichier (dont l’image Expo Router ayant fait échouer l’export),
  lecture/réécriture Xcode en mémoire, PostCSS et cohérence des versions
  applicatives et Node. ESLint ciblé réussi après le correctif Metro.
- Cinq tests backend d’intégration des dépendances réussis : upload HTTP
  Multer et rejet d’un fichier trop grand, appel gRPC local, construction des
  instrumentations ADOT, traitement d’image Sharp et mots de passe bcrypt,
  sérialisation YAML de Swagger. Intégrés aux workflows backend par
  `npm run test:dependencies`. Données synthétiques, aucun fournisseur externe.
- Compilation NestJS réussie sous Node 24.22.1.
- Contrôles TypeScript, ESLint (erreurs), frontières réseau, taille des sources
  et cohérence des sources natives mobiles réussis. Aucun écart entre les
  modules Expo installés et les versions attendues par le SDK 54.0.38.
- Contrôle mobile `check:release` complet réussi : **2 752 tests réussis,
  aucun échec, un test Ruby ignoré** faute de Ruby sur Windows. Ce contrôle
  précède le correctif Metro découvert à l’export ; les onze tests ciblés
  ci-dessus ont été relancés après ce correctif (dont un nouveau test).
- Suite backend complète : 239 suites réussies, deux en échec, 29 ignorées ;
  2 849 tests réussis, quatre en échec, 494 ignorés. Trois échecs concernaient
  les tests HTTP OAuth (dépassements de cinq secondes et assertion suivante) ;
  le quatrième utilisait l’ancienne simulation de dispatch. Des tests de
  notifications/dispatch ont été modifiés parallèlement, hors de ce correctif
  de dépendances. Après réduction de la charge, les quatre suites concernées
  ou modifiées ont été relancées : **71 tests réussis, aucun échec**, avec les
  délais existants. La suite complète n’a pas été exécutée une seconde fois.
- Exports Metro Android et iOS réussis après adaptation d’image-size : bundles
  JavaScript produits pour les deux plateformes (environ 8,1 Mo chacun), avec
  les images et sons référencés. Commande `expo export --platform android
  --platform ios --no-bytecode --max-workers 1`, en mode hors ligne, sans
  chargement des fichiers `.env`, sortie dans un dossier temporaire. Cela ne
  valide ni le bytecode Hermes ni un binaire natif installé sur téléphone.
- `git diff --check` réussi dans les deux dépôts.

## Mise en service et limites

Utiliser Node indiqué dans `.nvmrc` avant les installations locales. Les prochains
builds EAS et images backend utiliseront les nouvelles références après livraison
des fichiers. Les processus déjà démarrés et les applications déjà installées ne
changent pas de version automatiquement.

Le `Podfile.lock` iOS conserve les dernières versions résolues sur macOS ; il
n’est pas réécrit manuellement sous Windows. `pod install` devra résoudre Expo
et Expo Asset aux versions du nouveau lockfile npm lors du prochain build iOS.
Les bundles JavaScript ne remplacent pas cette compilation CocoaPods/Xcode.

Un audit npm sans alerte signifie seulement qu’aucune vulnérabilité connue par ce
registre n’est signalée pour les versions auditées à cette date. Il ne certifie
ni l’absence de bugs applicatifs, ni les SDK natifs, ni l’absence de crashs sur
téléphones physiques. Certaines dépendances historiques restent dépréciées même
si elles ne sont pas signalées par cet audit ; leur remplacement doit respecter
la compatibilité Expo/React Native.
