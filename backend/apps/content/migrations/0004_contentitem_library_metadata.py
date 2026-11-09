from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("content", "0003_contentrevision_slug")]

    operations = [
        migrations.AddField(
            model_name="contentrevision",
            name="category",
            field=models.CharField(
                choices=[
                    ("general", "General"),
                    ("onboarding", "Onboarding"),
                    ("clinical_care", "Clinical care"),
                    ("safeguarding", "Safeguarding"),
                    ("templates", "Templates"),
                    ("reference", "Reference"),
                ],
                default="general",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="contentitem",
            name="category",
            field=models.CharField(
                choices=[
                    ("general", "General"),
                    ("onboarding", "Onboarding"),
                    ("clinical_care", "Clinical care"),
                    ("safeguarding", "Safeguarding"),
                    ("templates", "Templates"),
                    ("reference", "Reference"),
                ],
                default="general",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="contentitem",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="contentitem",
            name="content_type",
            field=models.CharField(
                choices=[("guide", "Guide"), ("document", "Document"), ("external", "External resource")],
                default="guide",
                max_length=32,
            ),
        ),
    ]
