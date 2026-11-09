import apps.core.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("analytics", "0005_projection_model_state"),
        ("identity", "0009_add_student_registration_number"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExportRecord",
            fields=[
                ("id", models.UUIDField(default=apps.core.models.new_id, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("export_type", models.CharField(max_length=32)),
                ("scope", models.JSONField(default=dict)),
                ("filters", models.JSONField(default=dict)),
                ("format", models.CharField(default="csv", max_length=10)),
                ("status", models.CharField(choices=[("queued", "queued"), ("running", "running"), ("completed", "completed"), ("failed", "failed")], default="queued", max_length=16)),
                ("row_count", models.IntegerField(default=0)),
                ("storage_key", models.CharField(blank=True, default="", max_length=255)),
                ("error_code", models.CharField(blank=True, default="", max_length=64)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("actor", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="export_records", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "analytics_export_record"},
        ),
        migrations.AddIndex(
            model_name="exportrecord",
            index=models.Index(fields=["actor", "-created_at"], name="analytics_e_actor_i_eb1cac_idx"),
        ),
    ]
