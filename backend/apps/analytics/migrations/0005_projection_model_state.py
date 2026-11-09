from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("analytics", "0004_feedback_aggregate")]
    operations = [
        migrations.CreateModel(
            name="InterruptionCause",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("program_id", models.UUIDField()), ("institution_id", models.UUIDField()),
                ("facility_id", models.UUIDField()), ("facility_name", models.CharField(max_length=200)),
                ("cohort_id", models.UUIDField()), ("cohort_name", models.CharField(max_length=200)),
                ("reason", models.CharField(max_length=40)), ("interruptions", models.IntegerField()),
                ("days_interrupted", models.IntegerField()),
            ],
            options={"db_table": "analytics_interruption_causes", "managed": False, "unique_together": {("facility_id", "cohort_id", "reason")}},
        ),
        migrations.CreateModel(
            name="FacilityIndicator",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("program_id", models.UUIDField()), ("facility_id", models.UUIDField()),
                ("facility_name", models.CharField(max_length=200)), ("placements_total", models.IntegerField()),
                ("placements_active", models.IntegerField()), ("placements_awaiting_student", models.IntegerField()),
                ("placements_induction", models.IntegerField()), ("placements_completed", models.IntegerField()),
                ("sessions_total", models.IntegerField()),
            ],
            options={"db_table": "analytics_facility_indicators", "managed": False},
        ),
        migrations.CreateModel(
            name="CohortIndicator",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("program_id", models.UUIDField()), ("institution_id", models.UUIDField()),
                ("cohort_id", models.UUIDField()), ("cohort_name", models.CharField(max_length=200)),
                ("placements_total", models.IntegerField()), ("placements_active", models.IntegerField()),
                ("placements_awaiting_student", models.IntegerField()), ("placements_induction", models.IntegerField()),
                ("placements_completed", models.IntegerField()), ("sessions_total", models.IntegerField()),
            ],
            options={"db_table": "analytics_cohort_indicators", "managed": False},
        ),
        migrations.CreateModel(
            name="FeedbackAggregate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("mentor_id", models.UUIDField()), ("question_code", models.CharField(max_length=60)),
                ("responses", models.IntegerField()),
                ("mean_score", models.DecimalField(decimal_places=2, max_digits=5, null=True)),
            ],
            options={"db_table": "analytics_feedback_aggregate", "managed": False, "unique_together": {("mentor_id", "question_code")}},
        ),
    ]
