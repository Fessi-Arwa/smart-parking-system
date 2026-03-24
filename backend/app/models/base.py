from datetime import date, datetime
from decimal import Decimal
import enum


class ModelMixin:
    __public_fields__ = ()

    @staticmethod
    def serialize_value(value):
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, enum.Enum):
            return value.value
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return value

    def to_dict(self, extra_fields=None):
        fields = list(self.__public_fields__)
        if extra_fields:
            fields.extend(extra_fields)

        return {
            field: self.serialize_value(getattr(self, field))
            for field in fields
            if hasattr(self, field)
        }

    def update_from_dict(self, data, allowed_fields):
        for field in allowed_fields:
            if field in data:
                setattr(self, field, data[field])
        return self
