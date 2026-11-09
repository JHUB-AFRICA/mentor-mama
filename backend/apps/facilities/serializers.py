from rest_framework import serializers
from apps.core.validators import validate_partner_logo


class FacilitySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, min_length=2)
    county = serializers.CharField(max_length=60, required=False, allow_blank=True)
    level = serializers.CharField(max_length=60, required=False, allow_blank=True)
    maternity_unit_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    contact_person = serializers.CharField(max_length=120, required=False, allow_blank=True)
    contact_email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    logo = serializers.ImageField(required=False, allow_null=True, validators=[validate_partner_logo])


class FacilityUpdateSerializer(FacilitySerializer):
    name = serializers.CharField(max_length=200, min_length=2, required=False)
    archived = serializers.BooleanField(required=False)
    clear_logo = serializers.BooleanField(required=False, write_only=True)

