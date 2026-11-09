from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("analytics", "0006_export_record")]

    operations = [
        migrations.RenameField(
            model_name="exportrecord",
            old_name="actor",
            new_name="actor_id",
        ),
        migrations.AlterField(
            model_name="exportrecord",
            name="actor_id",
            field=models.UUIDField(),
        ),
        migrations.RemoveIndex(
            model_name="exportrecord",
            name="analytics_e_actor_i_eb1cac_idx",
        ),
        migrations.AddIndex(
            model_name="exportrecord",
            index=models.Index(fields=["actor_id", "-created_at"], name="analytics_e_actor_i_eb1cac_idx"),
        ),
    ]
