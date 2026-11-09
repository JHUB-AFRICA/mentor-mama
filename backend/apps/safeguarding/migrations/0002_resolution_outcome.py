from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("safeguarding", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="escalation", name="resolution_outcome",
            field=models.CharField(blank=True, choices=[("internal_action", "Internal action"), ("referred_externally", "Referred externally"), ("no_action_required", "No action required")], max_length=32, null=True),
        ),
        migrations.AddField(
            model_name="escalation", name="referral_note",
            field=models.TextField(blank=True, null=True),
        ),
    ]
