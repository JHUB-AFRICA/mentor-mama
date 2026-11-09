"""Human-readable scope projection for cross-domain reporting surfaces."""

from apps.facilities.models import Facility
from apps.institutions.models import Institution


def people_scope_directory(*, people, program_id) -> dict[str, dict[str, str]]:
    """Translate stored scope ids into programme-scoped display values in batches."""
    institution_ids = {person.institution_id for person in people if person.institution_id}
    facility_ids = {person.facility_id for person in people if person.facility_id}
    institutions = Institution.objects.filter(program_id=program_id, id__in=institution_ids).values("id", "name")
    facilities = Facility.objects.filter(program_id=program_id, id__in=facility_ids).values("id", "name")
    institution_names = {str(item["id"]): item["name"] for item in institutions}
    facility_names = {str(item["id"]): item["name"] for item in facilities}
    directory = {}
    for person in people:
        if person.facility_id:
            directory[str(person.id)] = {"scope_type": "Facility", "scope_name": facility_names.get(str(person.facility_id), "Facility unavailable")}
        elif person.institution_id:
            directory[str(person.id)] = {"scope_type": "Institution", "scope_name": institution_names.get(str(person.institution_id), "Institution unavailable")}
        else:
            directory[str(person.id)] = {"scope_type": "Programme", "scope_name": "Programme-wide"}
    return directory
