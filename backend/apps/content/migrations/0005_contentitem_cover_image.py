from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("content", "0004_contentitem_library_metadata")]

    operations = [
        migrations.AddField(
            model_name="contentitem",
            name="cover_image",
            field=models.FileField(blank=True, null=True, upload_to="content/covers/"),
        ),
    ]
