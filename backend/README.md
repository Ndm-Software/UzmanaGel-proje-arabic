# API

## Run

```bash
cd backend
npm install
npm run setup
npm run setup:secrets
npm run dev
```

Server default port: `5000`

## Env setup

Create `.env` from `.env.example` and fill Firebase Admin values.
`npm run setup` creates `.env` automatically if it is missing.
`npm run setup:secrets` stores Firebase secrets once as Windows user env vars.
You can provide service account JSON path when prompted for auto-fill.
After running it, close and reopen terminal.

Required:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (keep `\n` escaped)

## Auth

Every favorites endpoint requires Firebase ID token:

- `Authorization: Bearer <firebase_id_token>`

## Endpoints

- `GET /health`
- `GET /api/listings`
- `POST /api/listings` (auth required, expert only)
- `GET /api/listings/meta`
- `GET /api/listings/by-ids?ids=1,2,3`
- `GET /api/listings/:id`
- `GET /api/favorites`
- `POST /api/favorites/:id`
- `DELETE /api/favorites/:id`

## Response format

`GET /api/listings` query params:

- `page` (default: `1`)
- `limit` (default: `12`, max: `50`)
- `q` (search in title/category/location/expertName)
- `category`
- `city`
- `minPrice`
- `maxPrice`
- `sort` (`default`, `price_asc`, `price_desc`, `rating_desc`, `reviews_desc`)

`GET /api/listings` returns:

```json
{
  "items": [
    {
      "id": 1,
      "title": "Kombi Bakimi ve Tamiri",
      "category": "Kombi Klima Bakimi",
      "location": "Kadikoy, Istanbul",
      "rating": 4.8,
      "reviews": 124,
      "price": 350,
      "image": "https://...",
      "expertName": "Ahmet Yilmaz",
      "expertAvatar": "AY",
      "distance": null,
      "verified": true
    }
  ],
  "page": 1,
  "limit": 12,
  "total": 6,
  "totalPages": 1
}
```

`GET /api/favorites` returns:

```json
{
  "1": true,
  "4": true
}
```
## Managing Administrators

This project uses **Firebase Custom Claims** to securely handle administrator authorization without hitting the Firestore database on every request.

### Promoting a User to Admin
To promote an existing registered user to a full administrator, run the following command from the `backend` directory:

```bash
node --env-file=.env scripts/setAdminClaims.js <user-email>