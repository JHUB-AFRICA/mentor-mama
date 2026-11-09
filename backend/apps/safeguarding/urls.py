from django.urls import path

from apps.safeguarding import views

urlpatterns = [
    path("escalations", views.EscalationListView.as_view()),
    path("escalations/<uuid:escalation_id>", views.EscalationDetailView.as_view()),
    path("escalations/<uuid:escalation_id>/assign-reviewer", views.AssignReviewerView.as_view()),
    path("escalations/<uuid:escalation_id>/record-finding", views.RecordFindingView.as_view()),
    path("escalations/<uuid:escalation_id>/record-action", views.RecordActionView.as_view()),
    path("escalations/<uuid:escalation_id>/close", views.CloseEscalationView.as_view()),
]
