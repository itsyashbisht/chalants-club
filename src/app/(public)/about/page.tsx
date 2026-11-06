import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listHosts } from "@/features/trips/service";
import { PHOTOS, PROMISES } from "@/content/site";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Photo } from "@/components/ui/photo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About" };
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const operator = process.env.OPERATOR_NAME || "Chalants Club";
  const hosts = await listHosts();
  return (
    <>
      <Section className="pb-6">
        <Container className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Eyebrow>About</Eyebrow>
            <h1 className="text-title">{operator}</h1>
            <p className="prose-measure mt-5 text-lg text-ink-2">We run small hosted group trips for solo adults in India because arriving alone somewhere good should not mean spending it alone. Groups of ten to twelve, one named host, rooms that make sense, and a person checking every traveller before anyone pays the balance.</p>
            <p className="prose-measure mt-4 text-ink-2">The product is in a pilot. The departures you see are marked as fixtures until the organiser publishes real inventory, photography and terms. We would rather say that plainly than pretend.</p>
          </div>
          <div className="lg:col-span-6">
            <Photo photo={PHOTOS.heroSecondary} sizes="(min-width: 1024px) 50vw, 100vw" />
          </div>
        </Container>
      </Section>

      <Section className="bg-surface">
        <Container>
          <Eyebrow>The people who host</Eyebrow>
          <h2 className="text-section">You will know their names before you book</h2>
          <ul className="mt-8 grid gap-8 md:grid-cols-2">
            {hosts.map((h) => (
              <li key={h.id} className="grid gap-5 sm:grid-cols-[180px_1fr]">
                {h.photoUrl ? (
                  <div className="relative aspect-[4/5] w-44 overflow-hidden rounded-editorial bg-tint">
                    <Image src={h.photoUrl} alt={`Portrait of ${h.name}`} fill sizes="176px" className="object-cover" />
                  </div>
                ) : (
                  <div className="flex aspect-[4/5] w-44 items-center justify-center rounded-editorial bg-tint font-display text-4xl">{h.name[0]}</div>
                )}
                <div>
                  <p className="text-xl font-bold">{h.name}</p>
                  <p className="mt-2 text-ink-2">{h.bio}</p>
                </div>
              </li>
            ))}
            {hosts.length === 0 ? <li className="text-ink-2">Host profiles will appear here once departures are published.</li> : null}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <Eyebrow>How we run things</Eyebrow>
          <h2 className="text-section">Six commitments on every departure</h2>
          <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {PROMISES.map((p) => (
              <li key={p.title} className="border-t-2 border-rule pt-4">
                <h3 className="text-lg">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section className="bg-surface">
        <Container narrow>
          <h2 className="text-section">Merchant identity</h2>
          <p className="mt-3 text-ink-2">Payments are collected by {operator} through Razorpay in Indian rupees. Legal entity name, registered address and GST details are published here before launch. Photography on this site is licensed stock until our own trip photography, taken with travellers’ consent, replaces it.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/trips">Browse departures</ButtonLink>
            <ButtonLink href="/contact" variant="secondary">
              Contact us
            </ButtonLink>
          </div>
          <p className="mt-6 text-meta text-ink-2">
            Read <Link href="/safety" className="underline">exactly what we check</Link> and <Link href="/cancellations" className="underline">how refunds work</Link>.
          </p>
        </Container>
      </Section>
    </>
  );
}
