$env:PLATE_MODEL_PATH = if ($env:PLATE_MODEL_PATH) { $env:PLATE_MODEL_PATH } else { "best.pt" }
$env:PLATE_API_HOST = if ($env:PLATE_API_HOST) { $env:PLATE_API_HOST } else { "0.0.0.0" }
$env:PLATE_API_PORT = if ($env:PLATE_API_PORT) { $env:PLATE_API_PORT } else { "8001" }
$env:PLATE_OCR_LANGS = if ($env:PLATE_OCR_LANGS) { $env:PLATE_OCR_LANGS } else { "en,ar" }
$env:PLATE_OCR_ENGINE = if ($env:PLATE_OCR_ENGINE) { $env:PLATE_OCR_ENGINE } else { "auto" }
$env:PLATE_PADDLE_CACHE_DIR = if ($env:PLATE_PADDLE_CACHE_DIR) { $env:PLATE_PADDLE_CACHE_DIR } else { ".paddlex" }

python plate_api.py
