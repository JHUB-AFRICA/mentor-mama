# Screen 51 — Programme recovery inbox and content documents

## Authenticator recovery

People & access links to a dedicated programme-scoped table with summary cards,
requester, role, request details, received time, and review actions. Loading,
error, empty, and decision states are explicit. Reset and close decisions require
an audit reason. The page states that Programme Admins cannot approve their own
request and directs them to their organisation's platform administrator route.

Platform superusers review those requests in Django Admin. They record reset or
close and a reason. Reset clears authenticators, revokes active sessions, and
notifies the person so they can sign in and set up a new authenticator.

## Document authoring

A Programme Admin can select PDF, DOCX, or PPTX up to 20 MB, or use an existing
approved managed link. The selected file name and size remain visible before
save. Replacing a document creates a revision reference to the previously
attached file. Published audience members download through a protected endpoint;
drafts and archived items remain unavailable to them. Programme Admins can
manage and download programme content while signed in.

The browser picker is not the security boundary: server-side size, extension,
and file-signature checks run before persistence. Files use private storage and
are never exposed through the public media URL.
