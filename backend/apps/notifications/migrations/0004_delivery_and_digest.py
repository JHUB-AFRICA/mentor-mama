from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notifications", "0003_notification")]

    operations = [
        migrations.AddField(
            model_name="notification",
            name="provider_event_id",
            field=models.CharField(blank=True, default="", max_length=180),
        ),
        migrations.AddField(
            model_name="notification",
            name="provider_status",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="notificationpreference",
            name="last_digest_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
