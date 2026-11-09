from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("learning", "0003_lesson_metadata")]

    operations = [
        migrations.AddField(
            model_name="trainingmodule",
            name="cover_image",
            field=models.FileField(blank=True, null=True, upload_to="learning/covers/"),
        ),
    ]
