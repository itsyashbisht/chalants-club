import type { ReactNode } from "react";
import type { Photo as PhotoData } from "@/content/site";
import { Container, Eyebrow } from "./container";
import { Photo } from "./photo";

/** Full-width page opener: eyebrow, title and lead on the left, an editorial photograph on the right. */
export function PageHero({ eyebrow, title, lead, photo, caption, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; photo: PhotoData; caption?: string; children?: ReactNode }) {
  return (
    <section className="pt-10 md:pt-14">
      <Container className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-title">{title}</h1>
          {lead ? <p className="prose-measure mt-5 text-lg text-ink-2">{lead}</p> : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
        <div className="lg:col-span-6">
          <Photo photo={photo} priority aspect="aspect-[16/11]" sizes="(min-width: 1024px) 48vw, 100vw" caption={caption} />
        </div>
      </Container>
    </section>
  );
}
