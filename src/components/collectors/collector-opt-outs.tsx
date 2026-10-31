"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { canonicalOptOutDomain } from "@/lib/collectors/opt-out-domain";

export function CollectorOptOuts() {
  const t = useTranslations("collectors.optOuts");
  const query = api.collectors.optOuts.useQuery();
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const utils = api.useUtils();
  const refresh = () => {
    void utils.collectors.optOuts.invalidate();
  };
  const add = api.collectors.addOptOut.useMutation({
    onSuccess: () => {
      setDomain("");
      setReason("");
      refresh();
    },
  });
  const remove = api.collectors.removeOptOut.useMutation({
    onSuccess: refresh,
  });
  const forbidden = query.error?.data?.code === "FORBIDDEN";
  if (forbidden) return <p role="alert">{t("staffOnly")}</p>;
  return (
    <SectionBody status={statusFromQueries(query)}>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">{t("help")}</p>
        </div>
        <form
          className="flex flex-col gap-4 rounded-xl border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = canonicalOptOutDomain(domain);
            setInvalid(!value);
            if (value) add.mutate({ domain: value, reason });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="opt-out-domain">{t("domain")}</Label>
            <Input
              id="opt-out-domain"
              value={domain}
              maxLength={255}
              required
              placeholder="example.org"
              aria-invalid={invalid}
              aria-describedby={invalid ? "domain-error" : undefined}
              onChange={(event) => {
                setDomain(event.target.value);
                setInvalid(false);
              }}
            />
            {invalid ? (
              <p id="domain-error" className="text-destructive text-sm">
                {t("invalidDomain")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="opt-out-reason">{t("reason")}</Label>
            <Input
              id="opt-out-reason"
              value={reason}
              maxLength={200}
              required
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {add.isError || remove.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {t("error")}
            </p>
          ) : null}
          <Button
            className="self-start"
            type="submit"
            disabled={add.isPending || !reason.trim()}
          >
            {t("add")}
          </Button>
        </form>
        <ul className="divide-y rounded-xl border" aria-label={t("title")}>
          {query.data?.length ? (
            query.data.map((row) => (
              <li
                key={row.domain}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm break-all">{row.domain}</p>
                  <p className="text-muted-foreground mt-1 text-sm break-words">
                    {row.reason}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={remove.isPending}
                  aria-label={t("removeDomain", { domain: row.domain })}
                  onClick={() => remove.mutate({ domain: row.domain })}
                >
                  {t("remove")}
                </Button>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground p-4 text-sm">{t("empty")}</li>
          )}
        </ul>
      </div>
    </SectionBody>
  );
}
