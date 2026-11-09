from django.db import migrations


FACILITY_SQL = """
CREATE MATERIALIZED VIEW analytics_facility_indicators AS
SELECT f.program_id, f.id AS facility_id, f.name AS facility_name,
       count(DISTINCT p.id)::integer AS placements_total,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'active')::integer AS placements_active,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'awaiting_student')::integer AS placements_awaiting_student,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'induction')::integer AS placements_induction,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'completed')::integer AS placements_completed,
       count(DISTINCT s.id)::integer AS sessions_total
FROM facilities_facility f
LEFT JOIN placements_placement p ON p.facility_id = f.id
LEFT JOIN mentorship_session s ON s.placement_id = p.id
GROUP BY f.program_id, f.id, f.name
"""

COHORT_SQL = """
CREATE MATERIALIZED VIEW analytics_cohort_indicators AS
SELECT i.program_id, i.id AS institution_id, c.id AS cohort_id, c.name AS cohort_name,
       count(DISTINCT p.id)::integer AS placements_total,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'active')::integer AS placements_active,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'awaiting_student')::integer AS placements_awaiting_student,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'induction')::integer AS placements_induction,
       count(DISTINCT p.id) FILTER (WHERE p.state = 'completed')::integer AS placements_completed,
       count(DISTINCT s.id)::integer AS sessions_total
FROM institutions_cohort c
JOIN institutions_institution i ON i.id = c.institution_id
LEFT JOIN placements_placement p ON p.cohort_id = c.id
LEFT JOIN mentorship_session s ON s.placement_id = p.id
GROUP BY i.program_id, i.id, c.id, c.name
"""


class Migration(migrations.Migration):
    dependencies = [
        ("analytics", "0002_interruption_institution_scope"),
        ("facilities", "0002_initial"),
        ("mentorship", "0001_initial"),
    ]
    operations = [
        migrations.RunSQL(FACILITY_SQL, "DROP MATERIALIZED VIEW IF EXISTS analytics_facility_indicators"),
        migrations.RunSQL(COHORT_SQL, "DROP MATERIALIZED VIEW IF EXISTS analytics_cohort_indicators"),
        migrations.RunSQL(
            "CREATE UNIQUE INDEX analytics_facility_indicators_key ON analytics_facility_indicators (facility_id)",
            "DROP INDEX IF EXISTS analytics_facility_indicators_key",
        ),
        migrations.RunSQL(
            "CREATE UNIQUE INDEX analytics_cohort_indicators_key ON analytics_cohort_indicators (cohort_id)",
            "DROP INDEX IF EXISTS analytics_cohort_indicators_key",
        ),
    ]
