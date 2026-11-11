"""Certificates of completion: numbering, issuing, and the PDF."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.documents.renderer import render_pdf
from apps.core.errors import InvalidTransition
from apps.learning.models import Certificate, ModuleCompletion


def _next_number(year: int) -> str:
    prefix = f"MM-{year}-"
    last = Certificate.objects.filter(number__startswith=prefix).order_by("-number").values_list("number", flat=True).first()
    sequence = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{sequence:06d}"


def issue_for_completion(completion) -> Certificate | None:
    """Issue (once per version) a certificate for this completion. Modules can switch certificates off."""
    module = completion.module
    if not module.certificate_enabled:
        return None
    existing = Certificate.objects.filter(user=completion.user, module=module, version=completion.version).first()
    if existing:
        return existing
    for _ in range(5):  # a concurrent issue can take the same number; retry with the next one
        try:
            with transaction.atomic():
                return Certificate.objects.create(
                    user=completion.user, module=module, version=completion.version,
                    number=_next_number(timezone.now().year), learner_name=completion.user.full_name or completion.user.email,
                    module_title=module.title, score=completion.score, completed_at=completion.completed_at,
                )
        except IntegrityError:
            existing = Certificate.objects.filter(user=completion.user, module=module, version=completion.version).first()
            if existing:
                return existing
    raise InvalidTransition("We could not issue the certificate. Please try again.")


def latest_for(user, module) -> Certificate | None:
    """The learner's newest certificate; legacy completions get theirs on first request."""
    certificate = Certificate.objects.filter(user=user, module=module).order_by("-version").first()
    completion = ModuleCompletion.objects.filter(user=user, module=module).first()
    if completion is not None and (certificate is None or certificate.version < completion.version):
        certificate = issue_for_completion(completion) or certificate
    return certificate


def certificate_pdf(certificate: Certificate) -> bytes:
    context = {
        "name": certificate.learner_name, "module": certificate.module_title, "number": certificate.number,
        "completed": certificate.completed_at, "issued": certificate.issued_at, "score": certificate.score,
        "version": certificate.version,
    }
    return render_pdf("documents/certificate.html", context, title=f"Certificate of completion · {certificate.module_title}",
                      subject=f"Certificate {certificate.number}", orientation="landscape")
