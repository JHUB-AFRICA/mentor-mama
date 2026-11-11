import { useState } from "react";

export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string; embed_url: string };

/** Loads nothing from the video host until the learner taps play (saves mobile data and avoids tracking). */
export function VideoPlayer({ video, title }: { video: VideoEmbed; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="tr-video">
      {playing ? (
        <iframe
          src={`${video.embed_url}${video.embed_url.includes("?") ? "&" : "?"}autoplay=1`}
          title={title}
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <button type="button" className="tr-video__play" onClick={() => setPlaying(true)}>
          <span aria-hidden="true">▶</span>
          <span className="tr-video__label">Play video: {title}</span>
        </button>
      )}
    </div>
  );
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** Same rules as the server's parser (apps/learning/video.py): only YouTube and Vimeo, never an arbitrary iframe URL. */
export function parseVideoUrl(url: string): VideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  if (host === "youtu.be") id = parts[0];
  else if (YOUTUBE_HOSTS.has(host)) {
    if (parsed.pathname === "/watch") id = parsed.searchParams.get("v") ?? undefined;
    else if (parts.length === 2 && ["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1];
  }
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    return { provider: "youtube", id, embed_url: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` };
  }
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const candidate = host === "player.vimeo.com" ? (parts.length === 2 && parts[0] === "video" ? parts[1] : "") : (parts.at(-1) ?? "");
    if (/^\d{5,12}$/.test(candidate)) return { provider: "vimeo", id: candidate, embed_url: `https://player.vimeo.com/video/${candidate}?dnt=1` };
  }
  return null;
}
