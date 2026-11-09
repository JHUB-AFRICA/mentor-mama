from django.db import migrations


VIEW_SQL = """
CREATE MATERIALIZED VIEW analytics_feedback_aggregate AS
SELECT ma.mentor_id, r.question_code,
       count(*)::integer AS responses,
       CASE WHEN count(*) >= 3 THEN round(avg(r.value_numeric), 2) END::numeric(5,2) AS mean_score
FROM assessments_response r
JOIN assessments_feedback_confidential f ON f.id = r.feedback_confidential_id
JOIN placements_mentor_assignment ma ON ma.placement_id = f.placement_id
WHERE r.value_numeric IS NOT NULL
GROUP BY ma.mentor_id, r.question_code
"""


class Migration(migrations.Migration):
    dependencies = [
        ("analytics", "0003_operational_indicators"),
        ("assessments", "0003_constraints"),
    ]
    operations = [
        migrations.RunSQL(VIEW_SQL, "DROP MATERIALIZED VIEW IF EXISTS analytics_feedback_aggregate"),
        migrations.RunSQL(
            "CREATE UNIQUE INDEX analytics_feedback_aggregate_key ON analytics_feedback_aggregate (mentor_id, question_code)",
            "DROP INDEX IF EXISTS analytics_feedback_aggregate_key",
        ),
    ]
