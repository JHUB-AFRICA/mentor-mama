from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("identity", "0009_add_student_registration_number")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="accepting_students",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="user",
            name="max_active_placements",
            field=models.PositiveIntegerField(default=5),
        ),
    ]
