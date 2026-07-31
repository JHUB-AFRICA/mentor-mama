from django.urls import path

from apps.placements import views

urlpatterns = [
    path("placements", views.PlacementListView.as_view(), name="placement-list"),
    path("placements/<uuid:placement_id>", views.PlacementDetailView.as_view(), name="placement-detail"),
    path("placements/<uuid:placement_id>/transitions", views.PlacementTransitionsView.as_view(),
         name="placement-transitions"),
    path("placements/<uuid:placement_id>/allocate-ward", views.AllocateWardView.as_view()),
    path("placements/<uuid:placement_id>/assign-mentor", views.AssignMentorView.as_view()),
    path("placements/<uuid:placement_id>/reassign-mentor", views.ReassignMentorView.as_view()),
    path("placements/<uuid:placement_id>/pause", views.PauseView.as_view()),
    path("placements/<uuid:placement_id>/resume", views.ResumeView.as_view()),
    path("placements/<uuid:placement_id>/complete", views.CompleteView.as_view()),
    path("placements/<uuid:placement_id>/withdraw", views.WithdrawView.as_view()),
]
