from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0012_program_setup_identity_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="program",
            name="directory_reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="program",
            name="directory_reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_programme_directories",
                to="identity.user",
            ),
        ),
    ]
