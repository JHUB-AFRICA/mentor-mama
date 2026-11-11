import uuid

from django.db import migrations, models


def backfill(apps, schema_editor):
    Question = apps.get_model("learning", "QuizQuestion")
    for question in Question.objects.all():
        question.option_ids = [str(uuid.uuid4()) for _ in question.options]
        if question.correct_option in question.options:
            question.correct_option_id = question.option_ids[question.options.index(question.correct_option)]
        question.save(update_fields=["option_ids", "correct_option_id"])


class Migration(migrations.Migration):
    dependencies = [("learning", "0005_trainingmodule_archived_at")]

    operations = [
        migrations.AddField("quizquestion", "option_ids", models.JSONField(default=list)),
        migrations.AddField("quizquestion", "correct_option_id", models.CharField(blank=True, default="", max_length=36)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
