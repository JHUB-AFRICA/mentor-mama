from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("learning", "0002_trainingmodule_category")]

    operations = [
        migrations.AddField(
            model_name="lesson",
            name="lesson_type",
            field=models.CharField(
                choices=[("reading", "Reading"), ("video", "Video"), ("checklist", "Checklist")],
                default="reading",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="lesson",
            name="duration_minutes",
            field=models.PositiveSmallIntegerField(default=5),
        ),
    ]
