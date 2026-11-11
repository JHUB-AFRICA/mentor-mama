from django.urls import path

from apps.learning import views

urlpatterns = [
    path("training/media", views.LessonMediaView.as_view()),
    path("training/media/<uuid:media_id>", views.LessonMediaFileView.as_view()),
    path("training/modules/admin", views.TrainingModuleAdminListView.as_view()),
    path("training/modules", views.TrainingModuleListView.as_view()),
    path("training/modules/<uuid:module_id>", views.TrainingModuleDetailView.as_view()),
    path("training/modules/<uuid:module_id>/cover", views.TrainingModuleCoverView.as_view()),
    path("training/modules/<uuid:module_id>/lessons/<uuid:lesson_id>/check", views.LessonCheckView.as_view()),
    path("training/question-bank", views.QuestionBankView.as_view()),
    path("training/question-bank/<uuid:question_id>", views.QuestionBankDetailView.as_view()),
    path("training/modules/<uuid:module_id>/lessons/<uuid:lesson_id>/visit", views.LessonVisitView.as_view()),
    path("training/modules/<uuid:module_id>/versions", views.TrainingModuleVersionsView.as_view()),
    path("training/modules/<uuid:module_id>/versions/<int:number>/restore", views.TrainingModuleVersionRestoreView.as_view()),
    path("training/modules/<uuid:module_id>/certificate", views.ModuleCertificateView.as_view()),
    path("training/certificates/<str:number>", views.CertificateVerifyView.as_view()),
    path("training/modules/<uuid:module_id>/publish", views.TrainingModulePublishView.as_view()),
    path("training/modules/<uuid:module_id>/unpublish", views.TrainingModuleUnpublishView.as_view()),
    path("training/modules/<uuid:module_id>/archive", views.TrainingModuleArchiveView.as_view()),
    path("training/modules/<uuid:module_id>/duplicate", views.TrainingModuleDuplicateView.as_view()),
    path("training/modules/<uuid:module_id>/complete", views.ModuleCompleteView.as_view()),
    path("training/modules/<uuid:module_id>/revise", views.TrainingModuleReviseView.as_view()),
    path("training/modules/<uuid:module_id>/attempts", views.QuizAttemptView.as_view()),
    path("training/modules/<uuid:module_id>/explain-lesson", views.LessonExplanationView.as_view()),
    path("me/training", views.MyTrainingView.as_view()),
]
