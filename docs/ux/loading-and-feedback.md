# Loading and feedback patterns

## Non-blocking loading

Use skeletons when page structure is known and the user can remain oriented in the
workspace. People uses table-row skeletons and Activity uses timeline skeletons.
The skeleton preserves approximate geometry and uses the shared pulse treatment.

## Blocking loading

Use the shared `LoadingOverlay` for an operation that must not be interrupted,
such as checking the secure session or sending an invitation. It uses a restrained
navy scrim, a teal spinner, a short status label, and `role="status"` for assistive
technology. Buttons remain disabled as a second protection against duplicate
submissions.

## Error and success

Fetch failures stay in the affected component and provide a clear retry path or
safe message. Mutations report a local success/error result without clearing the
user’s current table or drawer context.
