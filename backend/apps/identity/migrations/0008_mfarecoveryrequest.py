# Generated manually for the identity account-recovery surface.
from django.db import migrations, models
import django.db.models.deletion
from apps.core.models import new_id


class Migration(migrations.Migration):
    dependencies = [("identity", "0007_user_email_verification")]

    operations = [
        migrations.CreateModel(
            name="MFARecoveryRequest",
            fields=[
                ("id", models.UUIDField(default=new_id, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reason", models.CharField(max_length=1000)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("reviewed", "Reviewed")], default="pending", max_length=16)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="mfa_recovery_requests", to="identity.user")),
            ],
            options={"db_table": "identity_mfa_recovery_request", "indexes": [models.Index(fields=["user", "status", "-created_at"], name="identity_mf_user_id_81726e_idx")]},
        ),
    ]
