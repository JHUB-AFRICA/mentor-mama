from django.db import migrations


VIEW_SQL = """
CREATE MATERIALIZED VIEW analytics_interruption_causes AS
SELECT
    i.program_id,
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
GROUP BY i.program_id, p.facility_id, f.name, p.cohort_id, c.name, pi.reason
"""

REVERSE_SQL = "DROP MATERIALIZED VIEW IF EXISTS analytics_interruption_causes"


class Migration(migrations.Migration):
    dependencies = [
        ("placements", "0002_constraints"),
        ("analytics", "0000_initial"),
    ]

    operations = [
        migrations.RunSQL(VIEW_SQL, REVERSE_SQL),
        migrations.RunSQL(
            "CREATE UNIQUE INDEX analytics_interruption_causes_key ON analytics_interruption_causes (facility_id, cohort_id, reason)",
            "DROP INDEX IF EXISTS analytics_interruption_causes_key",
        ),
    ]
