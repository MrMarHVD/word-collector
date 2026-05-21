# Word Marker

A small local web application for uploading vocabulary collections, searching words, and marking words as known.

## Run

```sh
npm start
```

Open `http://localhost:3000`.

## CSV Format

Each row should contain a word and translation:

```txt
hei hello
takk thanks
```

Comma, semicolon, and tab separated rows are also accepted.

## Data

The app stores data in SQLite at `data/words.db`.
