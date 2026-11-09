from django.db import migrations, models
import apps.content.models


class Migration(migrations.Migration):
    dependencies = [("content", "0006_contentrevision_cover_image")]

    operations = [
        migrations.AddField(
            model_name="contentitem",
            name="document_file",
            field=models.FileField(blank=True, null=True, storage=apps.content.models.content_document_storage, upload_to="content/documents/"),
        ),
        migrations.AddField(
            model_name="contentrevision",
            name="document_file",
            field=models.FileField(blank=True, null=True, storage=apps.content.models.content_document_storage, upload_to="content/revisions/"),
        ),
    ]
