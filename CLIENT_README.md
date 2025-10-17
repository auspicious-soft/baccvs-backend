# baccvs Backend — Client Summary

This document summarizes the work implemented in the `baccvs` backend repository and provides instructions for running, testing, and integrating with the API. Use this as the client-facing deliverable.

---

## Overview

The `baccvs` backend is a Node.js + Express application built using TypeScript. It provides a complete backend for a social/marketplace platform with features including:

- User authentication and authorization
- Posts, comments, likes, reposts
- Stories (image/video), with file uploads to S3-compatible storage
- Events with ticketing (create events, tickets, purchases)
- Chat (socket-based) and chat settings
- Community, professional profiles, and search utilities
- Subscriptions, promotions, purchases, and transactions
- Notifications and user settings
- File uploads saved locally (under `uploads/`) and to S3 via streaming

---

## Tech Stack

- Node.js (TypeScript)
- Express
- MongoDB (Mongoose)
- AWS S3 (or S3-compatible) for media uploads
- Busboy for streaming multipart uploads
- JSON Web Tokens for authentication

---

## Project Structure (important folders)

- `src/app.ts` - Application entry and Express setup
- `src/routes/` - API routes grouped by domain (event, post, user, chat, etc.)
- `src/controllers/` - Controllers that call respective services and format responses
- `src/services/` - Business logic for features (event, ticket, story, chat, etc.)
- `src/models/` - Mongoose schemas and models
- `src/configF/` - Configuration for DB, S3, multer, etc.
- `src/lib/` - Constants, error handling helpers
- `src/middleware/` - Auth and socket middleware
- `uploads/` - Local file storage used in development

---

## Key Endpoints (high-level)

Note: All endpoints are under the base URL where the app is hosted. The server uses JWT for protected routes.

- Auth & User
  - `POST /user/login` — login (returns JWT)
  - `POST /user/register` — register
  - `GET /user/profile` — get logged-in user profile (auth required)

- Events
  - `POST /` — create event (multipart/form-data for media)
  - `POST /user/event/feed` — get user event feed with filters (date range, geo, pricing, preferences)
  - `GET /:id` — get event by id
  - `POST /update-event/:id` — update event
  - `DELETE /delete-event/:id` — delete event
  - `GET /user/events` — get events for logged-in user

- Tickets
  - `POST /ticket` — create ticket
  - `GET /ticket` — list tickets
  - `GET /ticket/:id` — ticket details (populated with event)

- Stories
  - `POST /story` — create story (multipart)
  - `GET /story/:id` — get story

- Chat & Sockets
  - WebSocket endpoints handled under `socket/` implementations

(There are many more endpoints — refer to `src/routes` for a full list.)

---

## Event Feed Filters

The `POST /user/event/feed` endpoint supports filters in the request body (or query depending on client):

- `week`: `'this'` or `'next'` — returns events for this week or next week
- `date`: ISO date string — returns events on that specific date
- `lat` / `lng` / `maxDistance` (km) — geo filter, requires `location` index on events
- `isFree`: `'true'` or `'false'` — filter by free/paid
- `minPrice` / `maxPrice` — filter paid events by ticket price range
- `musicType`, `eventType`, `venueType` — comma-separated strings or arrays to filter event preferences

Note: The feed now returns attached `tickets` for each event when tickets exist.

---

## How to run (development)

1. Install dependencies

```powershell
cd baccvs
npm install
```

2. Environment variables (create `.env`)

Required variables (example names — confirm in `src/configF`):

- `MONGO_URI` — MongoDB connection string
- `PORT` — port to run the server (default 3000)
- `JWT_SECRET` — secret used for signing tokens
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` — for uploads

3. Run in development

```powershell
npm run dev
```


## Known Limitations & Notes

- Error handling: Services often call `errorResponseHandler` which can either send a response or throw; ensure controllers are prepared to format final HTTP responses.
- Some multipart handlers stream to S3 and resolve via Promises — ensure that client waits for the final response.
- Geo queries require a `2dsphere` index on the event `location` field in MongoDB.
- Tests are minimal / absent — recommend adding unit and integration tests for critical paths.

---

## Next steps / Recommendations

- Harden error handling and unify `errorResponseHandler` behavior.
- Add pagination to feed endpoints and index frequently queried fields (date, location, creator).

---

## Deliverables

- This README (client-facing summary)
- Full source code (attached in repository)

---

If you'd like, I can expand this README with:
- Auto-generated endpoint list
- Example requests and responses for key endpoints
- Postman collection export
- Minimal Swagger/OpenAPI addition

Tell me which additions you want and I'll add them.
