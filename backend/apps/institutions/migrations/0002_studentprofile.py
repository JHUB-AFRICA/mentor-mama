import apps.core.models
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("institutions", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="StudentProfile",
            fields=[
                ("id", models.UUIDField(default=apps.core.models.new_id, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("course_name", models.CharField(blank=True, default="", max_length=160)),
                ("year_of_study", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("date_of_birth", models.DateField(blank=True, null=True)),
                ("emergency_contact_name", models.CharField(blank=True, default="", max_length=160)),
                ("emergency_contact_phone", models.CharField(blank=True, default="", max_length=32)),
                ("emergency_contact_relationship", models.CharField(blank=True, default="", max_length=80)),
                ("student", models.OneToOneField(on_delete=models.deletion.CASCADE, related_name="student_profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "institutions_student_profile"},
        ),
    ]
