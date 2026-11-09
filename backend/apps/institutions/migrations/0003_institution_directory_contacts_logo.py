from django.db import migrations, models
import apps.core.validators
import apps.institutions.models


class Migration(migrations.Migration):
    dependencies = [("institutions", "0002_studentprofile")]
    operations = [
        migrations.AddField("institution", "contact_email", models.EmailField(blank=True, default="", max_length=254)),
        migrations.AddField("institution", "contact_phone", models.CharField(blank=True, default="", max_length=32)),
        migrations.AddField("institution", "logo", models.ImageField(blank=True, null=True, upload_to=apps.institutions.models.partner_logo_upload_to, validators=[apps.core.validators.validate_partner_logo])),
    ]
