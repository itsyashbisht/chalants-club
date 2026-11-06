import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/server";
import { PHOTOS } from "@/content/site";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Photo } from "@/components/ui/photo";
import { SupportForm } from "./support-form";

export const metadata: Metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const user = await getCurrentUser().catch(() => null);
  const operator = process.env.OPERATOR_NAME || "Chalants Club";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";
  const hours = process.env.SUPPORT_HOURS || "Mon-Sat, 10:00-18:00 IST";
  return (
    <Section>
      <Container className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="text-title">Talk to a person</h1>
          <p className="mt-4 text-ink-2">
            {operator} support is staffed {hours}. Email <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a> or use the form.
          </p>
          <div className="mt-8">
            <Photo photo={PHOTOS.chai} aspect="aspect-[4/3]" sizes="(min-width: 1024px) 40vw, 100vw" caption="Most questions get a reply the same working day." />
          </div>
          <h2 className="mt-8 text-xl">Private reporting</h2>
          <p className="mt-2 text-ink-2">Choose “A safety concern or private report”. It goes to staff only, never to hosts or other travellers. You will not be asked to justify leaving an activity or changing rooms.</p>
          <h2 className="mt-6 text-xl">Your data</h2>
          <p className="mt-2 text-ink-2">Ask for a copy or deletion of your optional profile and quiz data under “Delete my account data”. Financial records are retained under the published retention policy.</p>
        </div>
        <div className="rounded-editorial border border-rule bg-surface p-6 md:p-8 lg:col-span-7">
          <SupportForm defaultEmail={user?.email ?? ""} />
        </div>
      </Container>
    </Section>
  );
}
