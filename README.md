# Word Marker

A small local web application for uploading vocabulary collections, searching words, and marking words as known.

## Structure

```txt
backend/   HTTP API, domain modules, SQLite access, auth, imports, tokenization, migrations
frontend/  Browser app, styles, localization, static web server
data/      Local SQLite database and dictionary files
```

Backend domain code is organized as service/repository modules:

```txt
backend/src/modules/
  auth/
  dashboard/
  dictionaries/
  imports/
  languages/
  materials/
  translations/
  words/
```

`*.service.js` files contain business rules and orchestration. `*.repository.js` files contain SQL and prepared statements.

## Run

```sh
npm install
npm run dev:api
```

In another terminal:

```sh
npm run dev:web
```

Open `http://localhost:5173`.

The frontend dev server calls the API at `http://localhost:3000` by default. Override it with:

```sh
API_BASE_URL=http://localhost:3000 npm run dev:web
```

You can still run the backend only with:

```sh
npm start
```

## CSV Format

Each row should contain a word and translation:

```txt
hei hello
takk thanks
```

Comma, semicolon, and tab separated rows are also accepted.

## Data

The app stores data in SQLite at `data/words.db`.
