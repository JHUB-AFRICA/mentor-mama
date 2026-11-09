from django.urls import path

from apps.content import views

urlpatterns = [
    path("library", views.LibraryView.as_view()),
    path("content", views.ContentListView.as_view()),
    path("content/<uuid:content_id>", views.ContentDetailView.as_view()),
    path("content/<uuid:content_id>/document", views.ContentDocumentDownloadView.as_view()),
    path("content/<uuid:content_id>/cover", views.ContentCoverImageView.as_view()),
    path("content/<uuid:content_id>/publish", views.ContentPublishView.as_view()),
    path("content/<uuid:content_id>/archive", views.ContentArchiveView.as_view()),
    path("content/<uuid:content_id>/revise", views.ContentReviseView.as_view()),
]
