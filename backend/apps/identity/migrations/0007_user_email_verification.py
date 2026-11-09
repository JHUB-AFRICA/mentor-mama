import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("identity", "0006_usersession"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verification_nonce",
            field=models.UUIDField(default=uuid.uuid4, editable=False),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_code_hash",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
