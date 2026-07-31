from django.urls import path

from apps.mentorship import views

urlpatterns = [
    path("placements/<uuid:placement_id>/sessions", views.SessionListView.as_view(), name="session-list"),
]
