from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notifications", "0001_initial")]

    operations = [
        migrations.RenameField(
            model_name="notificationpreference",
            old_name="user",
            new_name="user_id",
        ),
        migrations.AlterField(
            model_name="notificationpreference",
            name="user_id",
            field=models.UUIDField(unique=True),
        ),
    ]
