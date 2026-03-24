from .routes.parking import parking_bp
from .routes.reservation import reservation_bp

app.register_blueprint(parking_bp, url_prefix="/api/parkings")
app.register_blueprint(reservation_bp, url_prefix="/api/reservations")