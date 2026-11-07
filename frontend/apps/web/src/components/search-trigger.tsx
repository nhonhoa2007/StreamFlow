"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchTrigger() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <form onSubmit={submitSearch} className="hidden w-full max-w-xl md:block">
      <label className="relative block">
        <span className="sr-only">Search media</span>
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sf-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search films, mixes, and moments"
          className="h-11 w-full rounded-full border border-white/10 bg-white/[0.06] pl-11 pr-5 text-sm text-white outline-none transition-colors placeholder:text-sf-text-muted focus:border-sf-focus focus:bg-white/[0.08]"
        />
      </label>
    </form>
  );
}
