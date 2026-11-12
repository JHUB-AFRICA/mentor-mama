from django.urls import path

from apps.mentorship import views

urlpatterns = [
    path("follow-ups", views.FollowUpListView.as_view(), name="follow-up-list"),
    path("follow-ups/summary", views.FollowUpSummaryView.as_view(), name="follow-up-summary"),
    path("follow-ups/<uuid:session_id>/done", views.FollowUpResolveView.as_view(), name="follow-up-done"),
    path("follow-ups/<uuid:session_id>/reopen", views.FollowUpReopenView.as_view(), name="follow-up-reopen"),
    path("sessions/batch", views.SessionBatchView.as_view(), name="session-batch"),
    path("placements/<uuid:placement_id>/sessions", views.SessionListView.as_view(), name="session-list"),
]
