from django.db import migrations


VIEW_SQL = """
CREATE MATERIALIZED VIEW analytics_interruption_causes AS
SELECT
    i.program_id,
    i.id AS institution_id,
    p.facility_id,
    f.name AS facility_name,
    p.cohort_id,
    c.name AS cohort_name,
    pi.reason,
    count(*)::integer AS interruptions,
    sum(COALESCE(pi.ended_on, CURRENT_DATE) - pi.started_on)::integer AS days_interrupted
FROM placements_pause_interval pi
JOIN placements_placement p ON p.id = pi.placement_id
JOIN facilities_facility f ON f.id = p.facility_id
JOIN institutions_cohort c ON c.id = p.cohort_id
JOIN institutions_institution i ON i.id = c.institution_id
GROUP BY i.program_id, i.id, p.facility_id, f.name, p.cohort_id, c.name, pi.reason
"""


class Migration(migrations.Migration):
    dependencies = [("analytics", "0001_interruption_causes")]
    operations = [
        migrations.RunSQL(
            "DROP MATERIALIZED VIEW analytics_interruption_causes",
            "DROP MATERIALIZED VIEW IF EXISTS analytics_interruption_causes",
        ),
        migrations.RunSQL(
            VIEW_SQL,
            "DROP MATERIALIZED VIEW IF EXISTS analytics_interruption_causes",
        ),
        migrations.RunSQL(
            "CREATE UNIQUE INDEX analytics_interruption_causes_key ON analytics_interruption_causes (facility_id, cohort_id, reason)",
            "DROP INDEX IF EXISTS analytics_interruption_causes_key",
        ),
    ]
