import hashlib
import json

from django.db import migrations


def create_first_versions(apps, schema_editor):
    """Every module that is live, or that learners have records on, becomes version 1."""
    Module = apps.get_model("learning", "TrainingModule")
    Version = apps.get_model("learning", "ModuleVersion")
    for module in Module.objects.all():
        if not (module.is_published or module.completions.exists() or module.attempts.exists()):
            continue
        lessons = [
            {"id": str(row.id), "position": row.position, "title": row.title, "body": row.body,
             "lesson_type": row.lesson_type, "duration_minutes": row.duration_minutes, "video_url": row.video_url}
            for row in module.lessons.order_by("position")
        ]
        quiz_rows = []
        quiz = getattr(module, "quiz", None)
        if quiz:
            quiz_rows = [
                {"id": str(q.id), "position": q.position, "prompt": q.prompt, "options": q.options,
                 "option_ids": q.option_ids, "correct_option_id": q.correct_option_id}
                for q in quiz.questions.order_by("position")
            ]
        snapshot = {"title": module.title, "description": module.description, "pass_mark": module.pass_mark,
                    "lessons": lessons, "quiz": quiz_rows}
        digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
        Version.objects.create(module=module, number=1, change_kind="major", change_note="First version",
                               snapshot=snapshot, content_hash=digest)


class Migration(migrations.Migration):
    dependencies = [("learning", "0007_versions_progress_video")]
    operations = [migrations.RunPython(create_first_versions, migrations.RunPython.noop)]
