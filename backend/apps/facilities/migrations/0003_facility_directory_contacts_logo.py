from django.db import migrations, models
import apps.core.validators
import apps.facilities.models


class Migration(migrations.Migration):
    dependencies = [("facilities", "0002_initial")]
    operations = [
        migrations.AddField("facility", "contact_email", models.EmailField(blank=True, default="", max_length=254)),
        migrations.AddField("facility", "contact_phone", models.CharField(blank=True, default="", max_length=32)),
        migrations.AddField("facility", "logo", models.ImageField(blank=True, null=True, upload_to=apps.facilities.models.partner_logo_upload_to, validators=[apps.core.validators.validate_partner_logo])),
    ]
