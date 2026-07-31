"""The session window guard (INV-04, INV-05) — Stage 5 §5.4.

Service code checks these too, and that is where the clean domain error comes
from. The trigger exists because a second write path (management command, data
fix, psql session) would otherwise bypass them.
"""

from django.db import migrations

SESSION_WINDOW = """
CREATE OR REPLACE FUNCTION mentorship_session_window_guard() RETURNS trigger AS $$
DECLARE p RECORD;
BEGIN
    SELECT state, planned_start, coalesce(actual_end, planned_end) AS ends
      INTO p FROM placements_placement WHERE id = NEW.placement_id FOR SHARE;

    IF p.state <> 'active' THEN
        RAISE EXCEPTION 'mentorship_session_window: PlacementNotActive (state=%)', p.state;
    END IF;

    IF NEW.session_date < p.planned_start OR NEW.session_date > p.ends THEN
        RAISE EXCEPTION
            'mentorship_session_window: SessionOutsidePlacementWindow (% not in [%, %])',
            NEW.session_date, p.planned_start, p.ends;
    END IF;

    IF EXISTS (
        SELECT 1 FROM placements_pause_interval
         WHERE placement_id = NEW.placement_id
           AND started_on <= NEW.session_date
           AND (ended_on IS NULL OR ended_on > NEW.session_date)
    ) THEN
        RAISE EXCEPTION
            'mentorship_session_window: SessionOutsidePlacementWindow (inside a pause)';
    END IF;

    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER mentorship_session_window
    BEFORE INSERT ON mentorship_session
    FOR EACH ROW EXECUTE FUNCTION mentorship_session_window_guard();
"""
SESSION_WINDOW_REVERSE = """
DROP TRIGGER IF EXISTS mentorship_session_window ON mentorship_session;
DROP FUNCTION IF EXISTS mentorship_session_window_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("mentorship", "0001_initial"), ("placements", "0002_constraints")]
    operations = [migrations.RunSQL(SESSION_WINDOW, SESSION_WINDOW_REVERSE)]
