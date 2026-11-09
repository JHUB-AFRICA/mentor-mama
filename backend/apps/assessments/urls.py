from django.urls import path

from apps.assessments import views

urlpatterns = [
    path("feedback/approved", views.ApprovedFeedbackView.as_view(), name="approved-feedback"),
    path("feedback/anonymous", views.AnonymousFeedbackView.as_view(), name="anonymous-feedback"),
    path("placements/<uuid:placement_id>/feedback", views.PlacementFeedbackView.as_view(), name="placement-feedback"),
    path("placements/<uuid:placement_id>/assessments/final", views.FinalAssessmentView.as_view(),
         name="final-assessment"),
]
