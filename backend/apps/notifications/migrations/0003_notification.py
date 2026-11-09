from django.db import migrations, models

from apps.core.models import new_id


class Migration(migrations.Migration):
    dependencies = [("notifications", "0002_leaf_user_identifier")]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.UUIDField(default=new_id, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user_id", models.UUIDField()),
                ("event_id", models.UUIDField()),
                ("event_type", models.CharField(max_length=64)),
                ("template_key", models.CharField(max_length=100)),
                ("payload", models.JSONField(default=dict)),
                ("status", models.CharField(choices=[("queued", "Queued"), ("sent", "Sent"), ("failed", "Failed")], default="queued", max_length=16)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("last_error", models.CharField(blank=True, default="", max_length=500)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={"db_table": "notifications_notification"},
        ),
        migrations.AddConstraint(
            model_name="notification",
            constraint=models.UniqueConstraint(
                fields=("event_id", "user_id", "template_key"),
                name="one_notification_per_event_recipient_template",
            ),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user_id", "read_at", "-created_at"], name="notification_inbox_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["event_id"], name="notification_event_idx"),
        ),
    ]
