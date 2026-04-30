Integration plaque:

1. Le backend principal reste sur Railway et ecrit dans la base Railway.
2. `plate-service` expose `POST /recognize-plate`.
3. `backend` appelle `PLATE_RECOGNITION_API_URL`.
4. Si une place reservee est detectee occupee, le backend compare la plaque lue avec `vehicule.matricule`.

Variables backend utiles:

- `PLATE_RECOGNITION_API_URL`
- `PLATE_RECOGNITION_API_TOKEN`
- `PLATE_RECOGNITION_API_TIMEOUT`
- `PLATE_RECOGNITION_MIN_CONFIDENCE`

Variables plate-service utiles:

- `PLATE_MODEL_PATH`
- `PLATE_OCR_LANGS`
- `PLATE_OCR_ENGINE`
- `PLATE_PADDLE_CACHE_DIR`
