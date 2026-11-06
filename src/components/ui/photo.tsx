import Image from "next/image";
import type { Photo as PhotoData } from "@/content/site";

type Props = {
  photo: PhotoData;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Tailwind aspect utility, e.g. "aspect-[4/3]". */
  aspect?: string;
  rounded?: string;
  showCredit?: boolean;
  caption?: string;
};

/** Editorial photograph with optional credit and caption. Uses next/image with fill inside an aspect box. */
export function Photo({ photo, className = "", sizes = "(min-width: 1024px) 50vw, 100vw", priority = false, aspect = "aspect-[4/3]", rounded = "rounded-editorial", showCredit = true, caption }: Props) {
  return (
    <figure className={`group relative ${className}`}>
      <div className={`relative overflow-hidden ${aspect} ${rounded} bg-tint`}>
        <Image src={photo.src} alt={photo.alt} fill sizes={sizes} priority={priority} quality={85} className="object-cover" />
      </div>
      {caption ? <figcaption className="mt-3 text-meta text-ink-2">{caption}</figcaption> : null}
      {showCredit ? <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink/60 px-2 py-0.5 text-[11px] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">Photo: {photo.credit}</span> : null}
    </figure>
  );
}
