"use client";

import Link from "next/link";
import Image from "next/image";
import { profileUrl, cn } from "@/lib/utils";
import { useInScrollRow } from "./ScrollRowContext";

export const PERSON_CARD_WIDTH_PX = 120;

export const personCardLinkClassName =
  "group block w-[120px] max-w-[120px] shrink-0 grow-0 basis-[120px] transition-transform hover:scale-105 hover:z-10";

interface PersonCardProps {
  id: number;
  name: string;
  profilePath?: string | null;
  subtitle?: string;
  className?: string;
}

function ScrollRowPoster({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div
      role="img"
      aria-label={alt}
      className="h-full w-full bg-cover bg-center"
      style={{ backgroundImage: `url("${src}")` }}
    />
  );
}

function PersonCardContent({
  name,
  profilePath,
  subtitle,
  href,
}: Pick<PersonCardProps, "name" | "profilePath" | "subtitle"> & { href: string }) {
  return (
    <>
      <div
        data-nav-href={href}
        className="relative aspect-[2/3] w-[120px] cursor-pointer overflow-hidden rounded-lg bg-seerr-card shadow-lg"
      >
        <ScrollRowPoster src={profileUrl(profilePath, "w185")} alt={name} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-2 text-sm font-medium line-clamp-2 text-foreground/90">{name}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{subtitle}</p>
      )}
    </>
  );
}

export function PersonCard({ id, name, profilePath, subtitle, className }: PersonCardProps) {
  const href = `/person/${id}`;
  const inScrollRow = useInScrollRow();

  if (inScrollRow) {
    return (
      <div className={cn(personCardLinkClassName, "scroll-row-item", className)}>
        <PersonCardContent
          name={name}
          profilePath={profilePath}
          subtitle={subtitle}
          href={href}
        />
      </div>
    );
  }

  return (
    <Link href={href} draggable={false} className={cn(personCardLinkClassName, className)}>
      <div className="relative aspect-[2/3] w-[120px] overflow-hidden rounded-lg bg-seerr-card shadow-lg">
        <Image
          key={`${id}-${profilePath ?? "none"}`}
          src={profileUrl(profilePath, "w185")}
          alt={name}
          fill
          draggable={false}
          className="object-cover"
          sizes="120px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-2 text-sm font-medium line-clamp-2 text-foreground/90">{name}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{subtitle}</p>
      )}
    </Link>
  );
}
