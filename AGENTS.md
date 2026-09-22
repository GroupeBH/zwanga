# Documentation des changements

À la demande de l'utilisateur, chaque changement fonctionnel ou technique doit
désormais être documenté dans `docs/CHANGEMENTS_TECHNIQUES.md`, ou dans un document
spécialisé référencé depuis ce journal.

Pour chaque changement, indiquer :

- la date, le périmètre et le problème constaté ;
- la solution effectivement appliquée et les fichiers concernés ;
- les comportements conservés et les précautions contre les régressions ;
- les vérifications réalisées, leurs résultats et les limites restantes.

Distinguer les mesures réelles des hypothèses, les tests JavaScript des essais
sur appareils physiques, et les solutions appliquées des pistes différées.
Ne pas annoncer une disparition des crashs ou de la chauffe sans validation native.
Ne jamais inclure de secrets, de valeurs de `.env` ou de données personnelles
d'utilisateurs dans cette documentation.
