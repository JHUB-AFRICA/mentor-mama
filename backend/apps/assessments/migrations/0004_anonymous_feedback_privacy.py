import hashlib
import hmac
import apps.core.models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


def scrub_legacy_links(apps, schema_editor):
    db = schema_editor.connection.alias
    Feedback = apps.get_model("assessments", "FeedbackAnonymous")
    Idempotency = apps.get_model("core", "IdempotencyKey")
    Outbox = apps.get_model("core", "OutboxEvent")
    Notification = apps.get_model("notifications", "Notification")
    Command = apps.get_model("assessments", "AnonymousFeedbackCommand")
    AuditDay = apps.get_model("assessments", "AnonymousFeedbackAuditDay")

    alias = db
    ids = list(Feedback.objects.using(alias).values_list("id", flat=True))
    dates = {}
    for row in Feedback.objects.using(alias).values("id", "submitted_on"):
        dates[row["id"]] = row["submitted_on"]
    # Preserve only a coarse global daily count for operations.
    from django.db.models import Count
    for row in Feedback.objects.using(alias).values("submitted_on").annotate(total=Count("id")):
        AuditDay.objects.using(alias).update_or_create(
            submitted_on=row["submitted_on"], defaults={"submissions": row["total"]}
        )

    if ids:
        legacy_keys = list(Idempotency.objects.using(alias).filter(result_ref__in=ids).values_list("command_id", "result_ref"))
        secret = settings.SECRET_KEY.encode("utf-8")
        for command_id, feedback_id in legacy_keys:
            digest = hmac.new(
                secret, b"anonymous-feedback-command:" + command_id.bytes, hashlib.sha256
            ).hexdigest()
            Command.objects.using(alias).get_or_create(
                command_digest=digest,
                defaults={"payload_digest": "", "received_on": dates.get(feedback_id)},
            )


    # The append-only trigger protects normal application writes. This
    # migration is the explicit privacy scrub for already linked records.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("ALTER TABLE core_audit_entry DISABLE TRIGGER audit_no_mutation")
        try:
            cursor.execute(
                "DELETE FROM core_audit_entry WHERE entity_table = %s OR action IN (%s, %s) "
                "OR entity_id::text = ANY(%s) OR changes->>'feedback_id' = ANY(%s)",
                ["assessments_feedback_anonymous", "feedback.anonymous_submit", "feedback.submit_anonymous",
                 [str(value) for value in ids], [str(value) for value in ids]],
            )
        finally:
            cursor.execute("ALTER TABLE core_audit_entry ENABLE TRIGGER audit_no_mutation")

    # Also remove old anonymous events even if a legacy build wrote a different
    # event name. Never infer anonymity from a current event schema alone.
    linked_events = Outbox.objects.using(alias).filter(
        Q(payload__mode="anonymous") | Q(payload__feedback_id__in=[str(value) for value in ids])
    )
    linked_event_ids = list(linked_events.values_list("id", flat=True))
    if linked_event_ids:
        Notification.objects.using(alias).filter(event_id__in=linked_event_ids).delete()
        Outbox.objects.using(alias).filter(id__in=linked_event_ids).delete()
    if ids:
        Idempotency.objects.using(alias).filter(result_ref__in=ids).delete()


def split_anonymous_responses(apps, schema_editor):
    """Move anonymous scores out of the shared timestamped response table."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            INSERT INTO assessments_anonymous_response
                (id, question_code, scale, value_numeric, value_boolean, feedback_anonymous_id)
            SELECT id, question_code, scale, value_numeric, value_boolean, feedback_anonymous_id
            FROM assessments_response
            WHERE feedback_anonymous_id IS NOT NULL
        """)
        cursor.execute("ALTER TABLE assessments_response DISABLE TRIGGER assessments_immutable_response")
        try:
            cursor.execute("DELETE FROM assessments_response WHERE feedback_anonymous_id IS NOT NULL")
        finally:
            cursor.execute("ALTER TABLE assessments_response ENABLE TRIGGER assessments_immutable_response")


def merge_anonymous_responses(apps, schema_editor):
    """Restore score data on rollback; discarded correlation timestamps stay discarded."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            INSERT INTO assessments_response
                (id, created_at, updated_at, question_code, scale, value_numeric, value_boolean,
                 feedback_anonymous_id, assessment_id, feedback_confidential_id)
            SELECT id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, question_code, scale,
                   value_numeric, value_boolean, feedback_anonymous_id, NULL, NULL
            FROM assessments_anonymous_response
        """)


class Migration(migrations.Migration):
    dependencies = [
        ("assessments", "0003_constraints"),
        ("core", "0004_constraints"),
        ("notifications", "0004_delivery_and_digest"),
    ]

    operations = [
        migrations.CreateModel(
            name="AnonymousFeedbackCommand",
            fields=[
                ("command_digest", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("payload_digest", models.CharField(blank=True, default="", max_length=64)),
                ("received_on", models.DateField()),
            ],
            options={"db_table": "assessments_anonymous_feedback_command"},
        ),
        migrations.CreateModel(
            name="AnonymousFeedbackAuditDay",
            fields=[
                ("submitted_on", models.DateField(primary_key=True, serialize=False)),
                ("submissions", models.PositiveIntegerField(default=0)),
            ],
            options={"db_table": "assessments_anonymous_feedback_audit_day"},
        ),
        migrations.CreateModel(
            name="AnonymousResponse",
            fields=[
                ("id", models.UUIDField(default=apps.core.models.new_id, editable=False, primary_key=True, serialize=False)),
                ("question_code", models.CharField(max_length=60)),
                ("scale", models.CharField(choices=[("likert_1_5", "Likert 1-5"), ("score_0_100", "Score 0-100"), ("yes_no", "Yes/No")], max_length=20)),
                ("value_numeric", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("value_boolean", models.BooleanField(blank=True, null=True)),
                ("feedback_anonymous", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="responses", to="assessments.feedbackanonymous")),
            ],
            options={"db_table": "assessments_anonymous_response"},
        ),
        migrations.AddConstraint(
            model_name="anonymousresponse",
            constraint=models.CheckConstraint(
                check=(
                    models.Q(scale="likert_1_5", value_numeric__gte=1, value_numeric__lte=5)
                    | models.Q(scale="score_0_100", value_numeric__gte=0, value_numeric__lte=100)
                    | models.Q(scale="yes_no", value_numeric=None, value_boolean__isnull=False)
                ),
                name="anonymous_assessment_score_in_range",
            ),
        ),
        migrations.RunPython(scrub_legacy_links, migrations.RunPython.noop),
        migrations.RunPython(split_anonymous_responses, merge_anonymous_responses),
        migrations.RunSQL(
            "CREATE TRIGGER assessments_immutable_anonymous_response BEFORE UPDATE OR DELETE "
            "ON assessments_anonymous_response FOR EACH ROW EXECUTE FUNCTION assessments_reject_mutation()",
            "DROP TRIGGER IF EXISTS assessments_immutable_anonymous_response ON assessments_anonymous_response",
        ),
        migrations.RemoveField(model_name="response", name="feedback_anonymous"),
        migrations.RemoveField(model_name="feedbackanonymous", name="comments"),
        migrations.RemoveField(model_name="feedbackanonymous", name="created_at"),
        migrations.RemoveField(model_name="feedbackanonymous", name="updated_at"),
    ]
