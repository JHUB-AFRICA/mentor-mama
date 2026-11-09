from django.urls import path

from apps.learning import views

urlpatterns = [
    path("training/modules/admin", views.TrainingModuleAdminListView.as_view()),
    path("training/modules", views.TrainingModuleListView.as_view()),
    path("training/modules/<uuid:module_id>", views.TrainingModuleDetailView.as_view()),
    path("training/modules/<uuid:module_id>/publish", views.TrainingModulePublishView.as_view()),
    path("training/modules/<uuid:module_id>/revise", views.TrainingModuleReviseView.as_view()),
    path("training/modules/<uuid:module_id>/attempts", views.QuizAttemptView.as_view()),
    path("me/training", views.MyTrainingView.as_view()),
]
