from django.db import migrations, models


VIEW_SQL = """
CREATE MATERIALIZED VIEW analytics_anonymous_feedback_aggregate AS
WITH groups AS (
    SELECT cohort_id, facility_id, ward_id, count(*)::integer AS submissions
    FROM assessments_feedback_anonymous
    GROUP BY cohort_id, facility_id, ward_id
    HAVING count(*) >= 3
), scores AS (
    SELECT f.cohort_id, f.facility_id, f.ward_id, r.question_code, r.scale,
           count(DISTINCT f.id)::integer AS submissions,
           count(*)::integer AS responses,
           round(avg(CASE WHEN r.scale = 'yes_no'
                          THEN CASE WHEN r.value_boolean THEN 1.0 ELSE 0.0 END
                          ELSE r.value_numeric END), 2)::numeric(6,2) AS mean_score
    FROM assessments_feedback_anonymous f
    JOIN assessments_anonymous_response r ON r.feedback_anonymous_id = f.id
    WHERE r.value_numeric IS NOT NULL OR r.value_boolean IS NOT NULL
    GROUP BY f.cohort_id, f.facility_id, f.ward_id, r.question_code, r.scale
    HAVING count(DISTINCT f.id) >= 3
), metrics AS (
    SELECT cohort_id, facility_id, ward_id, 'submissions'::varchar(16) AS metric_kind,
           ''::varchar(60) AS question_code, NULL::varchar(20) AS scale,
           submissions, submissions AS responses, NULL::numeric(6,2) AS mean_score
    FROM groups
    UNION ALL
    SELECT cohort_id, facility_id, ward_id, 'question'::varchar(16), question_code, scale,
           submissions, responses, mean_score
    FROM scores
)
SELECT md5(concat_ws('|', m.cohort_id::text, m.facility_id::text, m.ward_id::text,
                     m.metric_kind, m.question_code, coalesce(m.scale, '')))::uuid AS id,
       i.program_id, i.id AS institution_id,
       c.id AS cohort_id, c.name AS cohort_name,
       f.id AS facility_id, f.name AS facility_name,
       w.id AS ward_id, w.name AS ward_name,
       m.metric_kind, m.question_code, m.scale,
       m.submissions, m.responses, m.mean_score
FROM metrics m
JOIN institutions_cohort c ON c.id = m.cohort_id
JOIN institutions_institution i ON i.id = c.institution_id
JOIN facilities_facility f ON f.id = m.facility_id
JOIN facilities_ward w ON w.id = m.ward_id
"""


class Migration(migrations.Migration):
    dependencies = [
        ("analytics", "0008_cap_open_interruption_days"),
        ("assessments", "0004_anonymous_feedback_privacy"),
    ]

    operations = [
        migrations.RunSQL(VIEW_SQL, "DROP MATERIALIZED VIEW IF EXISTS analytics_anonymous_feedback_aggregate"),
        migrations.RunSQL(
            "CREATE UNIQUE INDEX analytics_anon_feedback_group_idx ON analytics_anonymous_feedback_aggregate (id)",
            "DROP INDEX IF EXISTS analytics_anon_feedback_group_idx",
        ),
        migrations.CreateModel(
            name="AnonymousFeedbackAggregate",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("program_id", models.UUIDField()), ("institution_id", models.UUIDField()),
                ("cohort_id", models.UUIDField()), ("cohort_name", models.CharField(max_length=200)),
                ("facility_id", models.UUIDField()), ("facility_name", models.CharField(max_length=200)),
                ("ward_id", models.UUIDField()), ("ward_name", models.CharField(max_length=200)),
                ("metric_kind", models.CharField(max_length=16)),
                ("question_code", models.CharField(max_length=60)),
                ("scale", models.CharField(max_length=20, null=True)),
                ("submissions", models.IntegerField()), ("responses", models.IntegerField()),
                ("mean_score", models.DecimalField(max_digits=6, decimal_places=2, null=True)),
            ],
            options={
                "db_table": "analytics_anonymous_feedback_aggregate",
                "managed": False,
            },
        ),
    ]
