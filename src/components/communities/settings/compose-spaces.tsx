"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui/error-state";
import {
  resolveSpaceLabel,
  type BuiltinSurface,
} from "@/server/communities/space-defaults";

export function ComposeSpaces({ slug }: { slug: string }) {
  const tRooms = useTranslations("communities.rooms");
  const tProfile = useTranslations("communities.profile");
  const t = useTranslations("communities.spaces");
  const utils = api.useUtils();

  const {
    data: spaces,
    isLoading,
    isError,
    refetch,
  } = api.spaces.listForAdmin.useQuery({ slug });

  const {
    data: rooms,
    isLoading: roomsLoading,
    isError: roomsError,
    refetch: roomsRefetch,
  } = api.spaces.listRooms.useQuery({ slug });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  // Create room form state
  const [roomName, setRoomName] = useState("");
  const [roomPurpose, setRoomPurpose] = useState("");
  const [roomPublic, setRoomPublic] = useState(true);

  // Edit room state
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [draftRoomName, setDraftRoomName] = useState("");
  const [draftRoomPurpose, setDraftRoomPurpose] = useState("");
  const [draftRoomPublic, setDraftRoomPublic] = useState(true);

  const invalidate = async () => {
    await Promise.all([
      utils.spaces.listForAdmin.invalidate({ slug }),
      utils.spaces.list.invalidate({ slug }),
    ]);
  };

  const invalidateRooms = async () => {
    await Promise.all([
      utils.spaces.listRooms.invalidate({ slug }),
      utils.spaces.listForAdmin.invalidate({ slug }),
    ]);
  };

  const setEnabled = api.spaces.setEnabled.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const reorder = api.spaces.reorder.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const rename = api.spaces.rename.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createRoom = api.spaces.createRoom.useMutation({
    onSuccess: async () => {
      setRoomName("");
      setRoomPurpose("");
      setRoomPublic(true);
      await invalidateRooms();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRoom = api.spaces.updateRoom.useMutation({
    onSuccess: async () => {
      setEditingRoomId(null);
      await invalidateRooms();
    },
    onError: (e) => toast.error(e.message),
  });

  const archiveRoom = api.spaces.archiveRoom.useMutation({
    onSuccess: invalidateRooms,
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={refetch} />;

  const ordered = spaces ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...ordered];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate({ slug, orderedIds: next.map((s) => s.id) });
  };

  return (
    <div className="space-y-10">
      {/* ── Surfaces section ── */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>

        <ul className="divide-y rounded-lg border">
          {ordered.map((space, index) => {
            const label = resolveSpaceLabel(
              {
                kind: space.kind,
                builtinSurface: space.builtinSurface,
                name: space.name,
              },
              (k: BuiltinSurface) => tProfile(k),
            );
            return (
              <li key={space.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    disabled={index === ordered.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  {editingId === space.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder={label}
                        maxLength={60}
                        className="h-8"
                        aria-label={t("rename")}
                      />
                      <Button
                        size="sm"
                        onClick={() =>
                          rename.mutate({
                            slug,
                            spaceId: space.id,
                            name: draftName,
                          })
                        }
                        disabled={rename.isPending}
                      >
                        {t("save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline"
                      onClick={() => {
                        setEditingId(space.id);
                        setDraftName(space.name ?? "");
                      }}
                    >
                      {label}
                    </button>
                  )}
                </div>

                <Switch
                  checked={space.enabled}
                  onCheckedChange={(checked) =>
                    setEnabled.mutate({
                      slug,
                      spaceId: space.id,
                      enabled: checked,
                    })
                  }
                  aria-label={t("enabledToggle")}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Rooms section ── */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {tRooms("title")}
          </h2>
        </div>

        {/* Create room form */}
        <div className="rounded-lg border p-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="room-name" className="text-sm font-medium">
                {tRooms("name")}
              </label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={60}
                placeholder={tRooms("untitled")}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="room-purpose" className="text-sm font-medium">
                {tRooms("purpose")}
              </label>
              <Input
                id="room-purpose"
                value={roomPurpose}
                onChange={(e) => setRoomPurpose(e.target.value)}
                maxLength={500}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="room-visibility"
                checked={roomPublic}
                onCheckedChange={setRoomPublic}
                aria-label={tRooms("visibility")}
              />
              <label
                htmlFor="room-visibility"
                className="cursor-pointer text-sm font-medium select-none"
              >
                {roomPublic ? tRooms("public") : tRooms("private")}
              </label>
            </div>

            <Button
              onClick={() =>
                createRoom.mutate({
                  slug,
                  name: roomName.trim(),
                  purpose: roomPurpose.trim() || undefined,
                  visibility: roomPublic ? "public" : "private",
                })
              }
              disabled={createRoom.isPending || !roomName.trim()}
            >
              {tRooms("create")}
            </Button>
          </div>
        </div>

        {/* Rooms list */}
        {roomsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : roomsError ? (
          <ErrorState onRetry={roomsRefetch} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {(rooms ?? []).map((room) => (
              <li key={room.id} className="px-4 py-3">
                {editingRoomId === room.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`edit-room-name-${room.id}`}
                        className="text-sm font-medium"
                      >
                        {tRooms("name")}
                      </label>
                      <Input
                        id={`edit-room-name-${room.id}`}
                        value={draftRoomName}
                        onChange={(e) => setDraftRoomName(e.target.value)}
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`edit-room-purpose-${room.id}`}
                        className="text-sm font-medium"
                      >
                        {tRooms("purpose")}
                      </label>
                      <Input
                        id={`edit-room-purpose-${room.id}`}
                        value={draftRoomPurpose}
                        onChange={(e) => setDraftRoomPurpose(e.target.value)}
                        maxLength={500}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        id={`edit-room-visibility-${room.id}`}
                        checked={draftRoomPublic}
                        onCheckedChange={setDraftRoomPublic}
                        aria-label={tRooms("visibility")}
                      />
                      <label
                        htmlFor={`edit-room-visibility-${room.id}`}
                        className="cursor-pointer text-sm font-medium select-none"
                      >
                        {draftRoomPublic ? tRooms("public") : tRooms("private")}
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          updateRoom.mutate({
                            slug,
                            spaceId: room.id,
                            name: draftRoomName.trim(),
                            purpose: draftRoomPurpose.trim() || undefined,
                            visibility: draftRoomPublic ? "public" : "private",
                          })
                        }
                        disabled={updateRoom.isPending || !draftRoomName.trim()}
                      >
                        {t("save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingRoomId(null)}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {room.name ?? tRooms("untitled")}
                      </p>
                      {room.purpose && (
                        <p className="text-muted-foreground text-xs">
                          {room.purpose}
                        </p>
                      )}
                      <span className="text-muted-foreground font-mono text-xs">
                        /{" "}
                        {room.visibility === "private"
                          ? tRooms("private").toLowerCase()
                          : tRooms("public").toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${tRooms("edit")} ${room.name ?? ""}`}
                        onClick={() => {
                          setEditingRoomId(room.id);
                          setDraftRoomName(room.name ?? "");
                          setDraftRoomPurpose(room.purpose ?? "");
                          setDraftRoomPublic(room.visibility === "public");
                        }}
                      >
                        {tRooms("edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${tRooms("archive")} ${room.name ?? ""}`}
                        onClick={() =>
                          archiveRoom.mutate({ slug, spaceId: room.id })
                        }
                        disabled={archiveRoom.isPending}
                      >
                        {tRooms("archive")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
