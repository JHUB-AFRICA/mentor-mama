from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("placements", "0004_placementbatch")]

    operations = [
        migrations.RenameIndex(
            model_name="placementbatch",
            old_name="placements_p_actor_i_8f4c23_idx",
            new_name="placements__actor_i_4b30f6_idx",
        ),
    ]
