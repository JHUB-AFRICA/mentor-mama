"""Additive: when a facility was asked (requested_at) and which institutions a run touched (institution_ids).

* ``Placement.requested_at`` lets the facility's incoming queue and the coordinator's planning list say "requested
  since <date>". Existing requests are backfilled from ``updated_at`` (the best available approximation).
* ``AllocationRun.institution_ids`` lets a coordinator see the arrangement results that concern their own students
  (an arrangement is run by a facility and can touch several institutions). Existing runs are backfilled from the
  placements stored in their result.

Both fields are nullable/defaulted, so the migration is safe on populated data. The reverse drops the new columns.
"""

from django.db import migrations, models


def backfill(apps, schema_editor):
    Placement = apps.get_model("placements", "Placement")
    AllocationRun = apps.get_model("placements", "AllocationRun")
    # One statement, not one per row: populated databases can hold thousands of requests.
    Placement.objects.filter(requested_facility__isnull=False, requested_at__isnull=True).update(requested_at=models.F("updated_at"))
    for run in AllocationRun.objects.all():
        ids = [row.get("placement_id") for key in ("arranged", "unplaced", "assignments") for row in (run.result or {}).get(key, []) if row.get("placement_id")]
        if not ids:
            continue
        institutions = sorted({str(value) for value in Placement.objects.filter(id__in=ids).values_list("institution_id", flat=True)})
        AllocationRun.objects.filter(id=run.id).update(institution_ids=institutions)


class Migration(migrations.Migration):

    dependencies = [
        ("placements", "0012_release_finished_student_holds"),
    ]

    operations = [
        migrations.AddField(
            model_name="placement",
            name="requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="allocationrun",
            name="institution_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
