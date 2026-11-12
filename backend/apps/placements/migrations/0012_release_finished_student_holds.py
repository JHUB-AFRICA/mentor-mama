"""Data repair: stop finished placements holding a student's dates for ever.

Root cause: ``StudentAssignment.ended_on`` was never written, so the exclusion
constraint ``student_no_overlapping_placements`` saw every assignment as the
open-ended range [started_on, infinity), whatever state the placement was in.
That made a withdrawn, archived, completed or long-past placement block any
later placement for the same student.

The constraint itself is unchanged and stays in force. This migration only
narrows the held range of existing rows to what the placement really holds:

* withdrawn / archived  -> empty range (ended_on = started_on): holds nothing
* completed             -> up to the earlier of completion day and end date
* any other (live)      -> up to its end date (actual_end, else planned_end)

Narrowing ranges can never create a new overlap, so it is safe on a populated
database. The reverse is deliberately a no-op: re-widening ranges to
open-ended could violate the constraint on live data, and bounded ranges are
valid under the previous code too.
"""

import datetime as dt

from django.db import migrations
from django.utils import timezone

ONE_DAY = dt.timedelta(days=1)


def release_finished_holds(apps, schema_editor):
    Assignment = apps.get_model("placements", "StudentAssignment")
    rows = Assignment.objects.select_related("placement").filter(ended_on=None)
    for assignment in rows.iterator(chunk_size=500):
        placement = assignment.placement
        started_on = assignment.started_on
        if placement.state in ("withdrawn", "archived"):
            ended_on = started_on
        else:
            last_day = placement.actual_end or placement.planned_end
            if placement.state == "completed" and placement.completed_at is not None:
                last_day = min(last_day, timezone.localtime(placement.completed_at).date())
            ended_on = max(started_on, last_day + ONE_DAY)
        Assignment.objects.filter(pk=assignment.pk).update(ended_on=ended_on)


class Migration(migrations.Migration):
    dependencies = [("placements", "0011_request_decline")]
    operations = [migrations.RunPython(release_finished_holds, migrations.RunPython.noop)]
