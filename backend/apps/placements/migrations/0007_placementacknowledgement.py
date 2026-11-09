import apps.core.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


IMMUTABILITY_SQL = """
CREATE OR REPLACE FUNCTION placements_acknowledgement_is_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'placements_acknowledgement_immutable: acknowledgement records cannot be changed';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER placements_acknowledgement_immutable
    BEFORE UPDATE OR DELETE ON placements_acknowledgement
    FOR EACH ROW EXECUTE FUNCTION placements_acknowledgement_is_immutable();
"""

REVERSE_IMMUTABILITY_SQL = """
DROP TRIGGER IF EXISTS placements_acknowledgement_immutable ON placements_acknowledgement;
DROP FUNCTION IF EXISTS placements_acknowledgement_is_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("placements", "0006_placementnote"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlacementAcknowledgement",
            fields=[
                ("id", models.UUIDField(default=apps.core.models.new_id, editable=False, primary_key=True, serialize=False)),
                ("signed_name", models.CharField(max_length=240)),
                ("signed_at", models.DateTimeField(auto_now_add=True)),
                ("placement", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="student_acknowledgement", to="placements.placement")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="placement_acknowledgements", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "placements_acknowledgement"},
        ),
        migrations.RunSQL(IMMUTABILITY_SQL, REVERSE_IMMUTABILITY_SQL),
    ]
