import apps.core.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("placements", "0003_delete_trigger_return")]

    operations = [
        migrations.CreateModel(
            name="PlacementBatch",
            fields=[
                ("id", models.UUIDField(default=apps.core.models.new_id, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("actor_id", models.UUIDField()),
                ("cohort_id", models.UUIDField()),
                ("planned_start", models.DateField()),
                ("planned_end", models.DateField()),
                ("student_ids", models.JSONField(default=list)),
                ("all_eligible", models.BooleanField(default=False)),
                ("status", models.CharField(choices=[("queued", "queued"), ("processing", "processing"), ("completed", "completed"), ("failed", "failed")], default="queued", max_length=16)),
                ("created_placement_ids", models.JSONField(default=list)),
                ("skipped", models.JSONField(default=list)),
                ("error_message", models.TextField(blank=True, default="")),
            ],
            options={"db_table": "placements_placement_batch", "indexes": [models.Index(fields=["actor_id", "-created_at"], name="placements_p_actor_i_8f4c23_idx")]},
        ),
    ]
