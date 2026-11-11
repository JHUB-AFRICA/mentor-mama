import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getFacilities } from "../../services/api";

/** Tags (for finding things) and optional facility limits for a library item. */
export function PublishingExtras({
  tags,
  setTags,
  facilityIds,
  setFacilityIds,
}: {
  tags: string[];
  setTags: (value: string[]) => void;
  facilityIds: string[];
  setFacilityIds: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const facilities = useQuery({ queryKey: ["facilities-for-content"], queryFn: getFacilities, staleTime: 5 * 60_000 });

  function commit(raw: string) {
    const next = [...tags];
    raw.split(",").forEach((part) => {
      const tag = part.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
      if (tag && !next.includes(tag) && next.length < 8) next.push(tag);
    });
    setTags(next);
    setDraft("");
  }

  return (
    <>
      <div className="content-authoring-field">
        <label htmlFor="content-tags">Tags</label>
        <div className="cx-tags">
          {tags.map((tag) => (
            <span key={tag} className="cx-tag">
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((item) => item !== tag))}>
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            id="content-tags"
            value={draft}
            placeholder={tags.length >= 8 ? "Up to 8 tags" : "Add a tag, then press Enter"}
            disabled={tags.length >= 8}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commit(draft);
              }
            }}
            onBlur={() => draft.trim() && commit(draft)}
          />
        </div>
        <small className="content-authoring-field-help">Tags help people find this in search, e.g. “infection control”.</small>
      </div>
      <fieldset className="content-authoring-field cx-facilities">
        <legend>Limit to facilities (optional)</legend>
        {facilities.isPending ? (
          <small className="content-authoring-field-help">Loading facilities…</small>
        ) : (facilities.data ?? []).length === 0 ? (
          <small className="content-authoring-field-help">No facilities are set up yet.</small>
        ) : (
          <div className="cx-facility-list">
            {(facilities.data ?? []).map((facility) => (
              <label key={facility.id}>
                <input
                  type="checkbox"
                  checked={facilityIds.includes(facility.id)}
                  onChange={(event) =>
                    setFacilityIds(event.target.checked ? [...facilityIds, facility.id] : facilityIds.filter((id) => id !== facility.id))
                  }
                />
                <span>{facility.name}</span>
              </label>
            ))}
          </div>
        )}
        <small className="content-authoring-field-help">
          Leave all unticked to show this to everyone in the audience. Ticked facilities apply to mentors and nurse managers working there; students are not tied to one facility, so choose “no limit” for student content.
        </small>
      </fieldset>
    </>
  );
}
