from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("identity", "0011_program_require_mentor_training_before_placement")]

    operations = [
        migrations.AddField(model_name="program", name="short_name", field=models.CharField(blank=True, default="", max_length=40)),
        migrations.AddField(model_name="program", name="description", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="program", name="academic_year", field=models.CharField(blank=True, default="", max_length=20)),
        migrations.AddField(model_name="program", name="owner", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="owned_programmes", to="identity.user")),
    ]
