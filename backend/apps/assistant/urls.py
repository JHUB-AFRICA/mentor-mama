from django.urls import path

from apps.assistant import views

urlpatterns = [
    path("assistant/chat", views.MentaChatView.as_view()),
    path("assistant/navigation", views.MentaNavigationView.as_view()),
]
