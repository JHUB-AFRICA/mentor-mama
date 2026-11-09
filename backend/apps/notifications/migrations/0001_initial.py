from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from apps.core.models import new_id


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationPreference",
            fields=[
                ("id", models.UUIDField(default=new_id, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("account_activity", models.BooleanField(default=True)),
                ("programme_updates", models.BooleanField(default=True)),
                ("placement_updates", models.BooleanField(default=True)),
                ("weekly_digest", models.BooleanField(default=False)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="notification_preferences", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "notifications_preference"},
        ),
    ]
