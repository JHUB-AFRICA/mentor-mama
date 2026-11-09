import { Skeleton } from "@mentormama/ui";

export type PortalWorkspaceRole =
  "program_admin" | "coordinator" | "nurse_manager" | "mentor" | "student";

const navigation: Record<PortalWorkspaceRole, string[]> = {
  program_admin: [
    "Overview",
    "Placements",
    "Reports",
    "People & access",
    "Programme setup",
    "Content library",
    "Activity",
  ],
  coordinator: [
    "Overview",
    "Students",
    "Cohorts",
    "Placements",
    "Invitations",
    "Reports",
    "Activity",
  ],
  nurse_manager: [
    "Overview",
    "Placements",
    "Mentors",
    "Wards & capacity",
    "Safeguarding",
    "Reports",
    "Activity",
  ],
  mentor: ["Today", "My students", "Learning", "Library", "Account"],
  student: ["Overview", "My placement", "Induction", "Learning", "Library"],
};

export function PortalWorkspaceSkeleton({
  role,
  pathname,
  includeShell = true,
}: {
  role: PortalWorkspaceRole;
  pathname: string;
  includeShell?: boolean;
}) {
  const page = pageKind(pathname, role);
  const title = pageTitle(pathname, role);
  const content = (
    <main
      className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      aria-busy="true"
      aria-label={`Loading ${title.toLowerCase()}`}
    >
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-[min(36rem,90%)]" />
        </div>
        {page !== "activity" && page !== "detail" && (
          <div className="flex gap-2">
            <Skeleton className="h-11 w-28 rounded-xl" />
            {page !== "settings" && (
              <Skeleton className="h-11 w-36 rounded-xl" />
            )}
          </div>
        )}
      </div>
      <PageShape page={page} />
    </main>
  );

  if (!includeShell) {
    return (
      <div role="status" className="w-full">
        {content}
      </div>
    );
  }

  const items = navigation[role];
  return (
    <div
      className="flex min-h-screen bg-mist text-navy"
      role="status"
      aria-label={`Loading ${title.toLowerCase()}`}
    >
      <aside className="hidden w-[17rem] shrink-0 flex-col bg-navy px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-1">
          <Skeleton className="size-9 rounded-full bg-white/15" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 bg-white/15" />
            <Skeleton className="h-2.5 w-32 bg-white/10" />
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2">
          <Skeleton className="mb-2 h-2 w-16 bg-white/10" />
          {items.map((item, index) => (
            <div
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 ${isActiveItem(item, pathname) ? "bg-white/10" : ""}`}
              key={item}
            >
              <Skeleton className="size-5 rounded-md bg-white/15" />
              <Skeleton
                className={`h-3 ${index % 3 === 0 ? "w-28" : "w-24"} bg-white/15`}
              />
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-5">
          <Skeleton className="size-10 rounded-full bg-teal/70" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-24 bg-white/15" />
            <Skeleton className="h-2.5 w-32 bg-white/10" />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-[4.5rem] items-center gap-4 border-b border-border bg-white px-4 sm:px-6 lg:px-8">
          <Skeleton className="size-10 rounded-xl lg:hidden" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Skeleton className="h-3 w-36 max-w-[30vw]" />
            <Skeleton className="h-3 w-28 max-w-[25vw]" />
          </div>
          <Skeleton className="hidden h-8 w-32 sm:block" />
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="hidden h-10 w-36 rounded-xl sm:block" />
        </header>
        {content}
      </div>
    </div>
  );
}

type PageKind =
  | "overview"
  | "list"
  | "placements"
  | "reports"
  | "activity"
  | "settings"
  | "content"
  | "form"
  | "detail";

function pageKind(pathname: string, role: PortalWorkspaceRole): PageKind {
  const path = pathname.toLowerCase();
  if (
    path === "/admin" ||
    path === "/coordinator" ||
    path === "/facility" ||
    path === "/mentor" ||
    path === "/student"
  )
    return "overview";
  if (path.includes("reports")) return "reports";
  if (path.includes("activity")) return "activity";
  if (
    path.includes("account") ||
    path.includes("settings") ||
    path.includes("profile")
  )
    return "settings";
  if (
    path.includes("content") ||
    path.includes("library") ||
    path.includes("learning")
  ) {
    if (path.includes("/new/") || path.includes("/edit")) return "form";
    if (path.includes("/item/")) return "detail";
    return "content";
  }
  if (path.includes("placement")) {
    if (/\/(create|new)(\/|$)/.test(path)) return "form";
    if (
      path.split("/").filter(Boolean).length >
      (role === "program_admin" ? 1 : 2)
    )
      return "detail";
    return "placements";
  }
  if (/\/(create|new|import)(\/|$)/.test(path)) return "form";
  if (
    /\/(people|students|cohorts|mentors|wards|safeguarding)(\/|$)/.test(path)
  ) {
    return path.split("/").filter(Boolean).length > 2 ? "detail" : "list";
  }
  return "overview";
}

function pageTitle(pathname: string, role: PortalWorkspaceRole) {
  const segment = pathname.split("/").filter(Boolean).at(-1);
  if (
    !segment ||
    ["admin", "coordinator", "facility", "mentor", "student"].includes(segment)
  ) {
    return role === "mentor" ? "Today" : "Overview";
  }
  return segment.replaceAll("-", " ").replaceAll("_", " ");
}

function isActiveItem(label: string, pathname: string) {
  const path = pathname.toLowerCase();
  const routeTerms: Record<string, string[]> = {
    Overview: ["/admin", "/coordinator", "/facility", "/student"],
    Today: ["/mentor"],
    "People & access": ["/people"],
    "Programme setup": ["/settings"],
    "Content library": ["/content", "/library"],
    "My students": ["/students"],
    Students: ["/students"],
    Cohorts: ["/cohorts"],
    Placements: ["/placements"],
    Mentors: ["/mentors"],
    "Wards & capacity": ["/wards"],
    Safeguarding: ["/safeguarding"],
    Reports: ["/reports"],
    Activity: ["/activity"],
    Learning: ["/learning"],
    Library: ["/library"],
    Induction: ["/induction"],
  };
  if (label === "Overview" || label === "Today") {
    return path.split("/").filter(Boolean).length === 1;
  }
  return (routeTerms[label] ?? []).some((term) => path.includes(term));
}

function PageShape({ page }: { page: PageKind }) {
  if (page === "overview") {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <section
              className="rounded-2xl border border-border bg-white p-5"
              key={index}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-3 h-3 w-36 max-w-full" />
            </section>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }, (_, index) => (
              <ListRow key={index} />
            ))}
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-56 rounded-xl" />
          </section>
        </div>
      </div>
    );
  }
  if (page === "reports") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-28 rounded-2xl" key={index} />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (page === "activity") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-14 rounded-xl" />
        <section className="space-y-2 rounded-2xl border border-border bg-white p-5">
          {Array.from({ length: 6 }, (_, index) => (
            <ListRow key={index} />
          ))}
        </section>
      </div>
    );
  }
  if (page === "settings" || page === "form") {
    return (
      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-hidden="true"
          className="flex gap-2 overflow-hidden lg:flex-col"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton
              className="h-10 w-36 shrink-0 rounded-xl lg:w-full"
              key={index}
            />
          ))}
        </nav>
        <div className="space-y-5">
          {Array.from({ length: 3 }, (_, index) => (
            <section
              className="space-y-4 rounded-2xl border border-border bg-white p-5"
              key={index}
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-72 max-w-full" />
              <Skeleton className="h-11 w-full rounded-xl" />
              {index === 0 && <Skeleton className="h-11 w-full rounded-xl" />}
            </section>
          ))}
        </div>
      </div>
    );
  }
  if (page === "content") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className="h-9 w-28 rounded-full" key={index} />
          ))}
        </div>
        <section className="space-y-2 rounded-2xl border border-border bg-white p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <ListRow key={index} />
          ))}
        </section>
      </div>
    );
  }
  if (page === "detail") {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="space-y-5 rounded-2xl border border-border bg-white p-5">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-40 rounded-xl" />
        </section>
        <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 4 }, (_, index) => (
            <ListRow key={index} />
          ))}
        </section>
      </div>
    );
  }
  if (page === "placements") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="h-24 rounded-2xl" key={index} />
          ))}
        </div>
        <section className="space-y-2 rounded-2xl border border-border bg-white p-5">
          {Array.from({ length: 6 }, (_, index) => (
            <ListRow key={index} />
          ))}
        </section>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-full rounded-xl" />
      <section className="space-y-2 rounded-2xl border border-border bg-white p-5">
        {Array.from({ length: 6 }, (_, index) => (
          <ListRow key={index} />
        ))}
      </section>
    </div>
  );
}

function ListRow() {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-border py-3 last:border-0">
      <Skeleton className="size-9 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-48 max-w-[70%]" />
        <Skeleton className="h-2.5 w-32 max-w-[50%]" />
      </div>
      <Skeleton className="h-7 w-20 rounded-full" />
    </div>
  );
}
