"use client";



import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { SlideOver } from "@/components/ui/slide-over";

import { FilterDateInput } from "@/components/discover/FilterDateInput";

import { FilterMultiSelect } from "@/components/discover/FilterMultiSelect";

import { FilterRangeSlider } from "@/components/discover/FilterRangeSlider";

import { GenreMultiSelect } from "@/components/discover/GenreMultiSelect";

import { KeywordSelector } from "@/components/discover/KeywordSelector";
import { LanguageSelect } from "@/components/discover/LanguageSelect";

import { TOP_COUNTRIES, TV_STATUS_OPTIONS } from "@/lib/discover/constants";

import {
  countActiveFilters,
  parseListParam,
  resolveDiscoverLocaleLists,
} from "@/components/discover/filter-utils";

import { cn } from "@/lib/utils";
import { glassBtn } from "@/lib/styles/glass";

interface KeywordItem {
  id: number;
  name: string;
}



interface FilterSlideoverProps {

  open: boolean;

  onClose: () => void;

  genres: Array<{ id: number; name: string }>;

  mediaType: "movie" | "tv";

  initialKeywords?: KeywordItem[];

  initialExcludeKeywords?: KeywordItem[];

}



const ghostField = "border-gray-300/70 bg-white/40 text-gray-900 backdrop-blur-md";



const RATING_MIN = 1;

const RATING_MAX = 10;

const RUNTIME_MIN = 0;

const RUNTIME_MAX = 400;



function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {

  return (

    <div className="border-b border-gray-300/70 py-5 last:border-b-0">

      <h3 className="mb-3 text-sm font-medium text-gray-900">{title}</h3>

      {children}

    </div>

  );

}



function parseNumberParam(value: string | null): number | undefined {

  if (!value) return undefined;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;

}



function formatRating(value: number): string {

  return value.toFixed(1).replace(/\.0$/, "");

}



export function FilterSlideover({

  open,

  onClose,

  genres,

  mediaType,

  initialKeywords = [],

  initialExcludeKeywords = [],

}: FilterSlideoverProps) {

  const router = useRouter();

  const pathname = usePathname();

  const searchParams = useSearchParams();



  const [keywords, setKeywords] = useState<KeywordItem[]>(initialKeywords);

  const [excludeKeywords, setExcludeKeywords] = useState<KeywordItem[]>(initialExcludeKeywords);

  const [forceEmptyDates, setForceEmptyDates] = useState(false);

  const [dateResetKey, setDateResetKey] = useState(0);



  useEffect(() => {

    if (open) {

      setKeywords(initialKeywords);

      setExcludeKeywords(initialExcludeKeywords);

    }

  }, [open, initialKeywords, initialExcludeKeywords]);



  useEffect(() => {

    if (!forceEmptyDates) return;

    if (!searchParams.get("dateMin") && !searchParams.get("dateMax")) {

      setForceEmptyDates(false);

    }

  }, [forceEmptyDates, searchParams]);



  const selectedGenres = parseListParam(searchParams.get("genres"));

  const { countries: selectedCountries, languages: selectedLanguages } =
    resolveDiscoverLocaleLists(searchParams, mediaType);
  const selectedStatus = parseListParam(searchParams.get("status"));

  const activeCount = countActiveFilters(searchParams, mediaType);



  const minRating = parseNumberParam(searchParams.get("minRating"));

  const maxRating = parseNumberParam(searchParams.get("maxRating"));

  const runtimeMin = parseNumberParam(searchParams.get("runtimeMin"));

  const runtimeMax = parseNumberParam(searchParams.get("runtimeMax"));

  const updateParams = useCallback(

    (key: string, value: string) => {

      const params = new URLSearchParams(searchParams.toString());

      if (value) params.set(key, value);

      else params.delete(key);

      router.push(`${pathname}?${params.toString()}`);

    },

    [router, pathname, searchParams]

  );



  const updateRangeParams = useCallback(

    (

      minKey: string,

      maxKey: string,

      minValue: number,

      maxValue: number,

      defaultMin: number,

      defaultMax: number,

      format: (value: number) => string = String

    ) => {

      const params = new URLSearchParams(searchParams.toString());



      if (minValue === defaultMin && maxValue === defaultMax) {

        params.delete(minKey);

        params.delete(maxKey);

      } else {

        if (minValue !== defaultMin) params.set(minKey, format(minValue));

        else params.delete(minKey);



        if (maxValue !== defaultMax) params.set(maxKey, format(maxValue));

        else params.delete(maxKey);

      }



      router.push(`${pathname}?${params.toString()}`);

    },

    [router, pathname, searchParams]

  );



  const updateListParam = useCallback(

    (key: string, values: string[]) => {

      const params = new URLSearchParams(searchParams.toString());

      if (values.length === 0) params.set(key, "");

      else params.set(key, values.join(","));

      router.push(`${pathname}?${params.toString()}`);

    },

    [router, pathname, searchParams]

  );



  const updateKeywords = useCallback(

    (items: KeywordItem[]) => {

      setKeywords(items);

      updateParams("keywords", items.map((k) => String(k.id)).join(","));

    },

    [updateParams]

  );



  const updateExcludeKeywords = useCallback(

    (items: KeywordItem[]) => {

      setExcludeKeywords(items);

      updateParams("excludeKeywords", items.map((k) => String(k.id)).join(","));

    },

    [updateParams]

  );



  const clearFilters = useCallback(() => {

    setForceEmptyDates(true);

    setDateResetKey((key) => key + 1);

    setKeywords([]);

    setExcludeKeywords([]);

    router.push(pathname);

  }, [router, pathname]);



  const dateLabel = mediaType === "movie" ? "Release Date" : "First Air Date";

  const dateMinValue = forceEmptyDates ? "" : (searchParams.get("dateMin") ?? "");

  const dateMaxValue = forceEmptyDates ? "" : (searchParams.get("dateMax") ?? "");



  return (

    <SlideOver

      open={open}

      onClose={onClose}

      title="Filters"

      subText={

        activeCount > 0

          ? `${activeCount} active filter${activeCount === 1 ? "" : "s"}`

          : undefined

      }

    >

      <FilterSection title={dateLabel}>

        <div className="grid grid-cols-2 gap-3">

          <div>

            <Label className="text-xs text-muted-foreground">From</Label>

            <FilterDateInput

              key={`date-min-${dateResetKey}`}

              value={dateMinValue}

              onCommit={(next) => updateParams("dateMin", next)}

              className={ghostField}

            />

          </div>

          <div>

            <Label className="text-xs text-muted-foreground">To</Label>

            <FilterDateInput

              key={`date-max-${dateResetKey}`}

              value={dateMaxValue}

              onCommit={(next) => updateParams("dateMax", next)}

              className={ghostField}

            />

          </div>

        </div>

      </FilterSection>



      <FilterSection title="Genres">

        <GenreMultiSelect

          genres={genres}

          selected={selectedGenres}

          onChange={(values) => updateListParam("genres", values)}

        />

      </FilterSection>



      <FilterSection title="Keywords">

        <KeywordSelector selected={keywords} onChange={updateKeywords} />

      </FilterSection>



      <FilterSection title="Exclude Keywords">

        <KeywordSelector

          selected={excludeKeywords}

          onChange={updateExcludeKeywords}

          placeholder="Search keywords to exclude…"

        />

      </FilterSection>



      <FilterSection title="TMDB User Score">

        <FilterRangeSlider

          min={RATING_MIN}

          max={RATING_MAX}

          step={0.1}

          defaultMin={RATING_MIN}

          defaultMax={RATING_MAX}

          valueMin={minRating}

          valueMax={maxRating}

          formatSubText={(min, max) =>
            `Ratings between ${formatRating(min)} and ${formatRating(max)}`
          }

          onChange={(nextMin, nextMax) =>

            updateRangeParams(

              "minRating",

              "maxRating",

              nextMin,

              nextMax,

              RATING_MIN,

              RATING_MAX,

              formatRating

            )

          }

        />

      </FilterSection>



      {mediaType === "movie" && (

        <FilterSection title="Runtime">

          <FilterRangeSlider

            min={RUNTIME_MIN}

            max={RUNTIME_MAX}

            step={1}

            defaultMin={RUNTIME_MIN}

            defaultMax={RUNTIME_MAX}

            valueMin={runtimeMin}

            valueMax={runtimeMax}

            formatSubText={(min, max) => `${min}-${max} minute runtime`}

            onChange={(nextMin, nextMax) =>

              updateRangeParams(

                "runtimeMin",

                "runtimeMax",

                nextMin,

                nextMax,

                RUNTIME_MIN,

                RUNTIME_MAX

              )

            }

          />

        </FilterSection>

      )}



      {mediaType === "tv" && (

        <FilterSection title="Status">

          <FilterMultiSelect

            label=""

            options={TV_STATUS_OPTIONS}

            selected={selectedStatus}

            onChange={(values) => updateListParam("status", values)}

          />

        </FilterSection>

      )}



      <FilterSection title="Production Country">

        <FilterMultiSelect

          label=""

          options={TOP_COUNTRIES}

          selected={selectedCountries}

          onChange={(values) => updateListParam("countries", values)}

        />

      </FilterSection>



      <FilterSection title="Original Language">

        <LanguageSelect
          selected={selectedLanguages}
          onChange={(values) => updateListParam("language", values)}
        />

      </FilterSection>



      <div className="pb-2 pt-4">
        <Button
          type="button"
          variant="outline"
          className={cn("w-full", glassBtn)}

          onClick={clearFilters}

          disabled={activeCount === 0}

        >

          Clear Active Filters

        </Button>

      </div>

    </SlideOver>

  );

}

