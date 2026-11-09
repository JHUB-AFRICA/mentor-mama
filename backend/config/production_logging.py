"""Structured production logs with exception messages and arbitrary extras removed."""

from traceback import format_tb

from pythonjsonlogger.json import JsonFormatter


class SafeJsonFormatter(JsonFormatter):
    """Keep stable operational fields while omitting arbitrary log extras."""

    SAFE_FIELDS = {"asctime", "levelname", "name", "message", "exc_info"}

    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        for key in tuple(log_record):
            if key not in self.SAFE_FIELDS:
                log_record.pop(key, None)

    def formatException(self, exc_info):
        exception_type, _, traceback = exc_info
        stack = "".join(format_tb(traceback))
        return f"{stack}{exception_type.__name__}: [details redacted]"
