from django.urls import path

from apps.induction import views

urlpatterns = [
    path("induction/readiness", views.InductionReadinessView.as_view(), name="induction-readiness"),
    path("induction/orientation-reminders", views.OrientationReminderBatchView.as_view(), name="orientation-reminders-batch"),
    path("induction/batches", views.InductionBatchView.as_view(), name="induction-batch-open"),
    path("induction/batches/<uuid:batch_id>/items/<uuid:item_id>", views.InductionBatchItemView.as_view(), name="induction-batch-answer"),
    path("induction/batches/<uuid:batch_id>/sign", views.SignInductionBatchView.as_view(), name="induction-batch-sign"),
    path("placements/<uuid:placement_id>/induction", views.OpenInductionView.as_view(), name="open-induction"),
    path("placements/<uuid:placement_id>/orientation", views.OrientationAcknowledgementView.as_view(), name="orientation-acknowledgement"),
    path("placements/<uuid:placement_id>/induction/checklist", views.ChecklistDetailView.as_view(), name="induction-checklist"),
    path("placements/<uuid:placement_id>/induction/items/<uuid:item_id>", views.AnswerItemView.as_view(), name="induction-answer"),
    path("placements/<uuid:placement_id>/induction/sign", views.SignInductionView.as_view(), name="induction-sign"),
]
