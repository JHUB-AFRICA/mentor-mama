from django.urls import path

from apps.mentorship import views

urlpatterns = [
    path("sessions/batch", views.SessionBatchView.as_view(), name="session-batch"),
    path("placements/<uuid:placement_id>/sessions", views.SessionListView.as_view(), name="session-list"),
]
