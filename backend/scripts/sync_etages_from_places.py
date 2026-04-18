from collections import defaultdict

from app import create_app, db
from app.models.etage import Etage
from app.models.place import Place


def normalize_floor_name(raw_value: str | None) -> str:
    value = (raw_value or "").strip()
    return value or "RDC"


def sync_etages() -> None:
    app = create_app()
    with app.app_context():
        places = Place.query.order_by(Place.parking_id.asc(), Place.num_place.asc(), Place.id_place.asc()).all()
        grouped_places: dict[int, list[Place]] = defaultdict(list)

        for place in places:
            grouped_places[int(place.parking_id)].append(place)

        Etage.query.delete()
        db.session.flush()

        for parking_id, parking_places in grouped_places.items():
            grouped_by_floor: dict[str, list[Place]] = defaultdict(list)
            for place in parking_places:
                grouped_by_floor[normalize_floor_name(place.etage)].append(place)

            for order, floor_name in enumerate(sorted(grouped_by_floor.keys())):
                floor_places = grouped_by_floor[floor_name]
                etage = Etage(
                    parking_id=parking_id,
                    nom=floor_name,
                    code=f"P{parking_id}-E{order + 1}",
                    ordre=order,
                    description=f"Etage {floor_name} du parking {parking_id}",
                    total_places=len(floor_places),
                )
                db.session.add(etage)
                db.session.flush()

                for place in floor_places:
                    place.etage_id = etage.id_etage

        db.session.commit()
        print("SYNC_ETAGES_OK")


if __name__ == "__main__":
    sync_etages()
