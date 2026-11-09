from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html

from apps.identity import authentication
from apps.identity.models import MFARecoveryRequest


class PlatformRecoveryDecisionForm(forms.Form):
    decision = forms.ChoiceField(choices=(("recover", "Reset authenticator"), ("close", "Close request")))
    reason = forms.CharField(min_length=5, max_length=1000, widget=forms.Textarea(attrs={"rows": 4}))


@admin.register(MFARecoveryRequest)
class MFARecoveryRequestAdmin(admin.ModelAdmin):
    list_display = ("requester", "requester_email", "programme", "status", "created_at", "review_link")
    list_filter = ("status", "created_at")
    search_fields = ("user__email", "user__first_name", "user__last_name", "reason")
    readonly_fields = ("user", "reason", "status", "created_at", "updated_at")
    ordering = ("status", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return self.has_view_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return bool(
            request.user.is_superuser
            and request.user.status == "active"
            and authentication.session_is_valid(request=request, user=request.user)
            and request.session.get(authentication.MFA_VERIFIED_SESSION_KEY) is True
        )

    def get_queryset(self, request):
        if not self.has_view_permission(request):
            return self.model.objects.none()
        return super().get_queryset(request).exclude(user_id=request.user.id)

    @admin.display(description="Person")
    def requester(self, obj):
        return obj.user.full_name or obj.user.email

    @admin.display(description="Email")
    def requester_email(self, obj):
        return obj.user.email

    @admin.display(description="Programme")
    def programme(self, obj):
        return obj.user.program.name if obj.user.program_id else "—"

    @admin.display(description="Action")
    def review_link(self, obj):
        if obj.status != MFARecoveryRequest.Status.PENDING:
            return "Reviewed"
        url = reverse("admin:identity_mfarecoveryrequest_platform_review", args=(obj.pk,))
        return format_html('<a href="{}">Review request</a>', url)

    def get_urls(self):
        urls = super().get_urls()
        custom = [path("<uuid:request_id>/platform-review/", self.admin_site.admin_view(self.platform_review), name="identity_mfarecoveryrequest_platform_review")]
        return custom + urls

    def platform_review(self, request, request_id):
        if not self.has_view_permission(request):
            raise PermissionDenied
        record = MFARecoveryRequest.objects.select_related("user", "user__program").filter(pk=request_id).first()
        if record is None:
            self.message_user(request, "This recovery request is no longer available.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:identity_mfarecoveryrequest_changelist"))
        form = PlatformRecoveryDecisionForm(request.POST or None)
        if request.method == "POST" and form.is_valid():
            ok = authentication.review_platform_mfa_recovery_request(
                actor=request.user, request_id=record.id, **form.cleaned_data,
            )
            if ok:
                self.message_user(request, "The recovery request has been reviewed and recorded.", messages.SUCCESS)
                return HttpResponseRedirect(reverse("admin:identity_mfarecoveryrequest_changelist"))
            self.message_user(request, "This request can no longer be reviewed. Refresh the list and try again.", messages.ERROR)
        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Review authenticator recovery",
            "record": record,
            "form": form,
            "cancel_url": reverse("admin:identity_mfarecoveryrequest_changelist"),
        }
        return TemplateResponse(request, "admin/identity/mfarecoveryrequest/platform_review.html", context)
