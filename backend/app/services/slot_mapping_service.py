from __future__ import annotations

from typing import Any

from ..models.place import Place


def get_ordered_parking_places(parking_id: int) -> list[Place]:
    return (
        Place.query.filter_by(parking_id=parking_id)
        .order_by(Place.num_place.asc(), Place.id_place.asc())
        .all()
    )


def assign_slots_to_places(
    parking_id: int,
    raw_slots: list[dict[str, Any]],
) -> dict[str, Any]:
    places = get_ordered_parking_places(parking_id)
    places_by_id = {place.id_place: place for place in places}
    remaining_places = list(places)
    normalized_slots: list[dict[str, Any]] = []
    warnings: list[str] = []
    auto_assigned_count = 0
    changed = False
    seen_place_ids: set[int] = set()

    for index, raw_slot in enumerate(raw_slots, start=1):
        try:
            x = int(raw_slot["x"])
            y = int(raw_slot["y"])
            w = int(raw_slot["w"])
            h = int(raw_slot["h"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Le slot #{index} doit contenir x, y, w et h valides.") from exc

        if w <= 0 or h <= 0:
            raise ValueError(f"Le slot #{index} doit avoir une largeur et une hauteur positives.")

        raw_place_id = raw_slot.get("place_id")
        place_id: int | None = None
        place_number: int | None = None

        if raw_place_id not in (None, "", 0, "0"):
            try:
                candidate_place_id = int(raw_place_id)
            except (TypeError, ValueError):
                candidate_place_id = 0

            place = places_by_id.get(candidate_place_id)
            if not place:
                warnings.append(f"Le slot #{index} pointe vers une place introuvable. Reaffectation automatique appliquee.")
                changed = True
            elif candidate_place_id in seen_place_ids:
                warnings.append(f"Le slot #{index} duplique une place existante. Reaffectation automatique appliquee.")
                changed = True
            else:
                place_id = candidate_place_id
                place_number = place.num_place
                seen_place_ids.add(candidate_place_id)
                remaining_places = [item for item in remaining_places if item.id_place != candidate_place_id]
                if raw_slot.get("place_number") != place_number:
                    changed = True

        if place_id is None and remaining_places:
            next_place = remaining_places.pop(0)
            place_id = next_place.id_place
            place_number = next_place.num_place
            seen_place_ids.add(next_place.id_place)
            auto_assigned_count += 1
            changed = True

        if place_id is None:
            changed = True
            warnings.append(f"Le slot #{index} n a pas pu etre associe automatiquement a une place.")

        normalized_slots.append(
            {
                "slot_index": index,
                "place_id": place_id,
                "place_number": place_number,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
            }
        )

    if not places:
        warnings.append("Aucune place n existe encore pour ce parking.")

    if len(raw_slots) != len(places):
        warnings.append(
            f"Le parking contient {len(places)} place(s) pour {len(raw_slots)} slot(s)."
        )

    return {
        "slots": normalized_slots,
        "changed": changed,
        "auto_assigned_count": auto_assigned_count,
        "warning": " ".join(dict.fromkeys(warnings)) if warnings else None,
        "places_count": len(places),
        "slots_count": len(normalized_slots),
    }
