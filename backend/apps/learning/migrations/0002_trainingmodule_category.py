from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("learning", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="trainingmodule",
            name="category",
            field=models.CharField(default="general", max_length=32),
        ),
    ]
