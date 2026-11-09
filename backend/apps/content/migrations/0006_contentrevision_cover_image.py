from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("content", "0005_contentitem_cover_image")]

    operations = [
        migrations.AddField(
            model_name="contentrevision",
            name="cover_image",
            field=models.FileField(blank=True, null=True, upload_to="content/revisions/"),
        ),
    ]
