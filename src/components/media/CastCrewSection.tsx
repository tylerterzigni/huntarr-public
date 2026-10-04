"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PersonCard, PERSON_CARD_WIDTH_PX } from "./PersonCard";
import { HorizontalScrollRow } from "./HorizontalScrollRow";
import type { TmdbCreditPerson } from "@/types";

const NOTABLE_CREW_JOBS = new Set([
  "Director",
  "Producer",
  "Executive Producer",
  "Writer",
  "Screenplay",
  "Creator",
  "Showrunner",
]);

interface CastCrewSectionProps {
  cast?: TmdbCreditPerson[];
  crew?: TmdbCreditPerson[];
}

function PersonScroll({ title, people }: { title: string; people: TmdbCreditPerson[] }) {
  if (people.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <HorizontalScrollRow className="cast-scroll-row -mx-1 px-1 pb-2">
        {people.map((person) => (
          <PersonCard
            key={`${title}-${person.id}-${person.character ?? person.job}`}
            id={person.id}
            name={person.name}
            profilePath={person.profile_path}
            subtitle={person.character ?? person.job}
          />
        ))}
      </HorizontalScrollRow>
    </section>
  );
}

function CrewAccordion({ people }: { people: TmdbCreditPerson[] }) {
  const [expanded, setExpanded] = useState(false);

  if (people.length === 0) return null;

  const cardGapPx = 16;
  const horizontalPaddingPx = 32;
  const crewContentWidth =
    people.length * PERSON_CARD_WIDTH_PX +
    Math.max(0, people.length - 1) * cardGapPx +
    horizontalPaddingPx;

  return (
    <section className="mt-6 w-fit max-w-full">
      <div
        className="max-w-full overflow-hidden rounded-lg border border-gray-300/70 bg-white/40 shadow-none backdrop-blur-md"
        style={{ width: expanded ? `min(${crewContentWidth}px, 100%)` : undefined }}
      >
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-seerr-hover/50 transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="font-semibold text-gray-900">Crew</span>
            <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
              {people.length} {people.length === 1 ? "Person" : "People"}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-gray-800 px-4 py-4">
            <div className="flex flex-nowrap gap-4">
              {people.map((person) => (
                <PersonCard
                  key={`Crew-${person.id}-${person.job}`}
                  id={person.id}
                  name={person.name}
                  profilePath={person.profile_path}
                  subtitle={person.job}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function CastCrewSection({ cast = [], crew = [] }: CastCrewSectionProps) {
  const castMembers = [...cast]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 20);

  const castIds = new Set(castMembers.map((person) => person.id));
  const crewMembers = crew
    .filter((person) => NOTABLE_CREW_JOBS.has(person.job ?? "") && !castIds.has(person.id))
    .reduce<TmdbCreditPerson[]>((acc, person) => {
      if (!acc.some((existing) => existing.id === person.id)) {
        acc.push(person);
      }
      return acc;
    }, [])
    .slice(0, 12);

  if (castMembers.length === 0 && crewMembers.length === 0) return null;

  return (
    <div className="mt-6 w-full min-w-0">
      <PersonScroll title="Cast" people={castMembers} />
      <CrewAccordion people={crewMembers} />
    </div>
  );
}
