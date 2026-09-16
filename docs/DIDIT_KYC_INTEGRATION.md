# Intégration Didit KYC

Le client mobile Zwanga ne doit jamais contenir la clé API Didit. L'application lance le flux KYC via l'API Zwanga, puis ouvre l'URL de vérification hébergée par Didit avec `expo-web-browser`.

## Contrat attendu côté backend

### Créer une session Didit

`POST /users/kyc/didit/session`

Corps envoyé par l'app :

```json
{
  "callbackUrl": "zwanga://kyc/didit-return",
  "language": "fr",
  "source": "auth"
}
```

Le backend crée ensuite la session chez Didit avec sa clé serveur et retourne au mobile :

```json
{
  "sessionId": "didit-session-id",
  "url": "https://verification.didit.me/...",
  "status": "Not Started",
  "vendorData": "zwanga-user-id",
  "workflowId": "didit-workflow-id"
}
```

Champs acceptés par le mobile en snake_case aussi :

- `session_id`
- `session_number`
- `session_token`
- `verification_url`
- `vendor_data`
- `workflow_id`

### Synchroniser la décision

`POST /users/kyc/didit/sync`

Corps envoyé par l'app après le retour navigateur :

```json
{
  "sessionId": "didit-session-id",
  "status": "Approved"
}
```

Le backend récupère la décision Didit, met à jour le statut KYC Zwanga, puis retourne soit le document KYC, soit un wrapper :

```json
{
  "kyc": {
    "id": "kyc-id",
    "userId": "user-id",
    "cniFrontUrl": "",
    "selfieUrl": "",
    "status": "approved",
    "rejectionReason": null,
    "createdAt": "2026-09-01T00:00:00.000Z",
    "updatedAt": "2026-09-01T00:00:00.000Z"
  }
}
```

## Mapping recommandé des statuts

| Statut Didit | Statut Zwanga |
| --- | --- |
| `Approved` | `approved` |
| `Declined`, `Expired`, `Abandoned`, `Kyc Expired` | `rejected` |
| `In Review`, `In Progress`, `Not Started`, `Resubmitted`, `Awaiting User` | `pending` |

## Variables d'environnement serveur

À configurer uniquement côté backend :

```env
DIDIT_API_KEY=...
DIDIT_WORKFLOW_ID=...
DIDIT_WEBHOOK_SECRET=...
```

Ne pas exposer ces valeurs en `EXPO_PUBLIC_*`.

## Webhook recommandé

Le backend doit écouter les événements Didit, notamment `status.updated`, vérifier la signature HMAC, rendre le traitement idempotent, puis mettre à jour le KYC utilisateur même si l'utilisateur ne revient pas immédiatement dans l'app.
