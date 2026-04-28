import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { getSession } from "@/server/better-auth/server";
import { AddSupplierDialog } from "@/components/datacenters/add-supplier-dialog";
import { SubmitFindingDialog } from "@/components/datacenters/submit-finding-dialog";
import { FindingActions } from "@/components/datacenters/finding-actions";
import { SupplierAdminActions } from "@/components/datacenters/supplier-admin-actions";
import { PeerComparison } from "@/components/datacenters/peer-comparison";
import { OwnershipChain } from "@/components/datacenters/ownership-chain";
import { SubsidiesPanel } from "@/components/datacenters/subsidies-panel";
import { PermitsTimeline } from "@/components/datacenters/permits-timeline";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await api.datacenters.getBySlug({ slug });
    const dc = data.datacenter;
    const where = [dc.city, dc.region, dc.country].filter(Boolean).join(", ");
    const title = `${dc.name} — ${data.operator?.canonicalName ?? "Unknown operator"}`;
    const desc =
      `${data.operator?.canonicalName ?? ""} datacenter${where ? ` in ${where}` : ""}. ${dc.capacityMw ? `${dc.capacityMw} MW operational. ` : ""}${dc.capacityMwPlanned ? `${dc.capacityMwPlanned} MW planned.` : ""}`.trim();
    return {
      title,
      description: desc,
      ...buildOgMeta(title, desc, "Datacenter"),
      alternates: buildAlternates(`/investigations/datacenters/${slug}`),
    };
  } catch {
    return { title: "Datacenter not found" };
  }
}

export default async function DatacenterDetailPage({ params }: PageProps) {
  const { slug } = await params;
  let data;
  let peers;
  let subsidiesData;
  let permitsData;
  try {
    [data, peers, subsidiesData, permitsData] = await Promise.all([
      api.datacenters.getBySlug({ slug }),
      api.datacenters.peerComparison({ slug }),
      api.datacenters.subsidiesFor({ slug }),
      api.datacenters.permitsFor({ slug }),
    ]);
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const {
    datacenter: dc,
    operator,
    utility,
    suppliers,
    deals,
    findings,
  } = data;
  const lat = Number(dc.lat);
  const lng = Number(dc.lng);
  const where = [dc.city, dc.region, dc.country].filter(Boolean).join(", ");

  const session = await getSession();
  const currentUserId = session?.user?.id ?? null;
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";
  const isLoggedIn = !!currentUserId;

  const ownership = operator
    ? await api.datacenters
        .ownershipChain({ slug: operator.slug })
        .catch(() => null)
    : null;

  return (
    <main className="container mx-auto flex flex-col gap-8 p-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/investigations/datacenters" className="hover:underline">
          ← All datacenters
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{dc.name}</h1>
          {dc.aiDedicated && (
            <span className="rounded bg-purple-600 px-2 py-0.5 text-xs text-white">
              AI dedicated
            </span>
          )}
          {!dc.verified && (
            <span className="rounded border px-2 py-0.5 text-xs">
              unverified
            </span>
          )}
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>
            Operated by{" "}
            {operator ? (
              <span className="font-medium">{operator.canonicalName}</span>
            ) : (
              "—"
            )}
            {where ? ` · ${where}` : ""}
          </span>
          <SourceBadge count={dc.sources?.length ?? 0} />
          <span className="text-muted-foreground/70 text-xs">
            updated {timeAgo(dc.updatedAt)}
          </span>
        </p>
        {dc.description && (
          <p className="max-w-3xl text-sm leading-relaxed">{dc.description}</p>
        )}
      </header>

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
          Compared to peers
        </h2>
        <PeerComparison data={peers} />
      </section>

      {ownership && (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Ownership chain ({operator?.canonicalName ?? "operator"})
          </h2>
          <OwnershipChain
            chain={ownership.chain}
            depth={ownership.depth}
            opacityScore={ownership.opacityScore}
            ultimateBeneficialOwner={ownership.ultimateBeneficialOwner}
          />
        </section>
      )}

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
          Public subsidies & incentives
        </h2>
        <SubsidiesPanel data={subsidiesData as never} />
      </section>

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
          Permits
        </h2>
        <PermitsTimeline data={permitsData as never} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Status" value={dc.status} />
        <Stat
          label="Current capacity"
          value={dc.capacityMw != null ? `${Number(dc.capacityMw)} MW` : "—"}
        />
        <Stat
          label="Planned capacity"
          value={
            dc.capacityMwPlanned != null
              ? `${Number(dc.capacityMwPlanned)} MW`
              : "—"
          }
        />
        <Stat label="Power source" value={dc.primaryPowerSource ?? "—"} />
        <Stat label="Cooling" value={dc.coolingType ?? "—"} />
        <Stat
          label="Water draw"
          value={
            dc.waterDrawMgd != null
              ? `${Number(dc.waterDrawMgd)} MGD`
              : dc.waterDrawCubicM != null
                ? `${Number(dc.waterDrawCubicM)} m³/d`
                : "—"
          }
        />
        <Stat
          label="PUE"
          value={dc.puePledged != null ? Number(dc.puePledged).toFixed(2) : "—"}
        />
        <Stat
          label="Capex"
          value={
            dc.capexUsd != null
              ? `$${(Number(dc.capexUsd) / 1e9).toFixed(1)}B`
              : "—"
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Location
          </h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            {dc.address && <Row label="Address" value={dc.address} />}
            {dc.city && <Row label="City" value={dc.city} />}
            {dc.region && <Row label="Region" value={dc.region} />}
            <Row label="Country" value={dc.country} />
            <Row
              label="Coordinates"
              value={`${lat.toFixed(4)}, ${lng.toFixed(4)}`}
            />
          </dl>
          <a
            className="mt-3 inline-block text-xs underline"
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`}
            target="_blank"
            rel="noreferrer"
          >
            View on OpenStreetMap →
          </a>
        </div>

        <div className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Timeline
          </h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <Row label="Announced" value={fmtDate(dc.announcedDate)} />
            <Row label="Groundbreak" value={fmtDate(dc.groundbreakDate)} />
            <Row label="Online" value={fmtDate(dc.onlineDate)} />
            <Row label="Full capacity" value={fmtDate(dc.fullCapacityDate)} />
          </dl>
        </div>
      </section>

      {(dc.rackCount != null ||
        dc.squareFootage != null ||
        (dc.gpus && dc.gpus.length > 0)) && (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Hardware
          </h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm md:grid-cols-3">
            {dc.squareFootage != null && (
              <Row
                label="Square footage"
                value={`${Number(dc.squareFootage).toLocaleString()} sqft`}
              />
            )}
            {dc.rackCount != null && (
              <Row
                label="Racks"
                value={Number(dc.rackCount).toLocaleString()}
              />
            )}
          </dl>
          {dc.gpus && dc.gpus.length > 0 && (
            <div className="mt-3">
              <div className="text-muted-foreground text-xs">GPU inventory</div>
              <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                {dc.gpus.map((g, i) => (
                  <li key={i} className="bg-muted rounded px-2 py-1">
                    {g.model}
                    {g.count != null && ` · ${g.count.toLocaleString()}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
          Power
        </h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm md:grid-cols-3">
          <Row label="Primary source" value={dc.primaryPowerSource ?? "—"} />
          <Row label="Utility" value={utility?.canonicalName ?? "—"} />
          <Row
            label="PUE pledged"
            value={
              dc.puePledged != null ? Number(dc.puePledged).toFixed(2) : "—"
            }
          />
        </dl>
      </section>

      <section className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Suppliers ({suppliers.length})
          </h2>
          {isLoggedIn && <AddSupplierDialog datacenterId={dc.id} />}
        </div>
        {suppliers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No suppliers tracked yet.{" "}
            {isLoggedIn ? "Be first to add one." : "Sign in to contribute."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            {suppliers.map((s) => (
              <li
                key={s.link.id}
                className="border-border flex items-center justify-between rounded border p-2"
              >
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    {s.supplier.canonicalName}
                    <SourceBadge count={s.link.sources?.length ?? 0} />
                    {!s.link.verified && (
                      <span className="bg-muted text-muted-foreground rounded px-1 py-0.5 text-[10px]">
                        unverified
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {s.link.category}
                    {s.link.role ? ` · ${s.link.role}` : ""}
                    {s.link.isLocal ? " · local" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.link.contractValueUsd != null && (
                    <span className="text-muted-foreground text-xs">
                      ${(Number(s.link.contractValueUsd) / 1e6).toFixed(1)}M
                    </span>
                  )}
                  {isAdmin && (
                    <SupplierAdminActions
                      id={s.link.id}
                      verified={s.link.verified}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deals.length > 0 && (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Energy deals ({deals.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {deals.map((d) => (
              <li key={d.id} className="border-border rounded border p-2">
                <div className="font-medium">{d.title}</div>
                <div className="text-muted-foreground text-xs">
                  {d.type}
                  {d.energyType ? ` · ${d.energyType}` : ""}
                  {d.mw != null ? ` · ${Number(d.mw)} MW` : ""}
                  {d.termYears != null ? ` · ${Number(d.termYears)}y term` : ""}
                  {d.signedDate ? ` · signed ${fmtDate(d.signedDate)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
          Sources ({dc.sources.length})
        </h2>
        <ul className="space-y-1 text-sm">
          {dc.sources.map((s, i) => (
            <li key={i} className="flex items-baseline gap-2">
              {s.type && (
                <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
                  {s.type}
                </span>
              )}
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="break-all underline"
              >
                {s.title ?? s.url}
              </a>
              {s.publishedAt && (
                <span className="text-muted-foreground text-xs">
                  {fmtDate(s.publishedAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Community findings ({findings.length})
          </h2>
          {isLoggedIn && <SubmitFindingDialog datacenterId={dc.id} />}
        </div>
        {findings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No findings submitted yet.{" "}
            {isLoggedIn
              ? "Spotted incorrect data? Submit a finding."
              : "Sign in to dispute or correct facts."}
          </p>
        ) : (
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={f.id} className="border-border rounded border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-medium">{f.title}</h3>
                    {f.claim && (
                      <code className="text-muted-foreground bg-muted mt-1 inline-block rounded px-1.5 py-0.5 text-xs">
                        {f.claim}
                      </code>
                    )}
                  </div>
                  <FindingActions
                    finding={{
                      id: f.id,
                      userId: f.userId,
                      upvotes: f.upvotes,
                      status: f.status,
                    }}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                  />
                </div>
                {f.body && (
                  <p className="text-muted-foreground mt-1 text-sm">{f.body}</p>
                )}
                {f.evidenceUrls.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {f.evidenceUrls.map((u, i) => (
                      <li key={i}>
                        <a
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all underline"
                        >
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <span
                  className={`mt-2 inline-block rounded px-1.5 py-0.5 text-xs ${
                    f.status === "verified"
                      ? "bg-green-600 text-white"
                      : f.status === "disputed"
                        ? "bg-red-600 text-white"
                        : "bg-muted"
                  }`}
                >
                  {f.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-border rounded-lg border p-3">
      <div className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function SourceBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        title="No sources"
        className="rounded border border-amber-500/60 px-1 py-0.5 text-[10px] text-amber-600"
      >
        ⚠ no sources
      </span>
    );
  }
  const tone =
    count >= 3
      ? "border-green-600/60 text-green-700"
      : count >= 2
        ? "border-sky-500/60 text-sky-700"
        : "border-muted-foreground/40 text-muted-foreground";
  return (
    <span
      title={`${count} source${count === 1 ? "" : "s"}`}
      className={`rounded border px-1 py-0.5 text-[10px] ${tone}`}
    >
      {count} src
    </span>
  );
}

function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  const day = 86_400_000;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}.${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}
