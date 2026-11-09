from apps.core.errors import ScopeDerivationMismatch
from apps.core.http import domain_exception_handler
from apps.core.middleware import SafeApiErrorResponseMiddleware
from django.http import HttpResponse
from django.test import RequestFactory


def test_unexpected_api_exception_returns_generic_retryable_response():
    response = domain_exception_handler(RuntimeError("database password leaked"), {})

    assert response.status_code == 500
    assert response.data == {
        "error": {
            "code": "InternalError",
            "message": "MentorMAMA is having a brief problem. Please try again shortly.",
            "retryable": True,
        }
    }
    assert "database password leaked" not in str(response.data)


def test_internal_domain_error_does_not_return_its_private_message():
    response = domain_exception_handler(
        ScopeDerivationMismatch("postgres host is internal-db"), {}
    )

    assert response.status_code == 500
    assert response.data["error"]["code"] == "ScopeDerivationMismatch"
    assert "internal-db" not in str(response.data)


def test_debug_html_for_api_errors_is_replaced_with_safe_json():
    middleware = SafeApiErrorResponseMiddleware(
        lambda _request: HttpResponse("traceback with secret", status=500)
    )
    response = middleware(RequestFactory().get("/api/v1/missing"))

    assert response.status_code == 500
    assert response["Content-Type"].startswith("application/json")
    assert b"traceback with secret" not in response.content
