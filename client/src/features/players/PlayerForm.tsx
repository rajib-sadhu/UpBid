import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPlayerSchema,
  SPORTS,
  FOOTBALL_POSITIONS,
  FOOTBALL_DETAIL_BY_BUCKET,
  CRICKET_ROLES,
  BATTING_POSITIONS,
  BOWLING_STYLES,
  ALL_ROUNDER_TYPES,
  CRICKET_ROLE_LABELS,
  BATTING_POSITION_LABELS,
  BOWLING_STYLE_LABELS,
  ALL_ROUNDER_TYPE_LABELS,
} from "shared";
import type { CreatePlayerInput, Player } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { NationSelect } from "../../components/ui/nation-select.js";

interface PlayerFormProps {
  mode: "create" | "edit";
  player?: Player; // required for edit; prefills the form
  onSuccess: (message: string) => void;
}

// Map an existing player (or nothing) to form defaults. Photo URL is intentionally
// left blank so editing never overwrites an existing photo unless explicitly set.
function toDefaults(p?: Player): CreatePlayerInput {
  return {
    name: p?.name ?? "",
    sport: p?.sport ?? "CRICKET",
    role: p?.role ?? "",
    nationality: p?.nationality ?? "",
    dateOfBirth: p?.dateOfBirth ?? "",
    externalRef: p?.externalRef ?? "",
    photoUrl: "",
    footballPosition: p?.footballPosition ?? "",
    footballDetailPosition: p?.footballDetailPosition ?? "",
    cricketRole: p?.cricketRole ?? "",
    battingPosition: p?.battingPosition ?? "",
    bowlingStyle: p?.bowlingStyle ?? "",
    allRounderType: p?.allRounderType ?? "",
  };
}

export function PlayerForm({ mode, player, onSuccess }: PlayerFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoKey, setPhotoKey] = useState(0); // bump to clear the file input
  const [photoMode, setPhotoMode] = useState<"upload" | "url">("upload");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreatePlayerInput>({
    resolver: zodResolver(createPlayerSchema),
    defaultValues: toDefaults(player),
  });

  const sport = watch("sport");
  const cricketRole = watch("cricketRole");
  const footballBucket = watch("footballPosition");
  const nationality = watch("nationality") ?? "";

  // Clear structured fields that don't apply to the chosen sport so stale
  // cross-sport values can't trip server-side validation.
  useEffect(() => {
    if (sport !== "CRICKET") {
      setValue("cricketRole", "");
      setValue("battingPosition", "");
      setValue("bowlingStyle", "");
      setValue("allRounderType", "");
    }
    if (sport !== "FOOTBALL") {
      setValue("footballPosition", "");
      setValue("footballDetailPosition", "");
    }
    if (sport === "CRICKET" || sport === "FOOTBALL") setValue("role", "");
  }, [sport, setValue]);

  // Keep the detailed position consistent with the chosen bucket.
  useEffect(() => {
    if (sport !== "FOOTBALL") return;
    if (!footballBucket) {
      setValue("footballDetailPosition", "");
    } else if (footballBucket === "GK") {
      setValue("footballDetailPosition", "GK");
    } else {
      const current = getValues("footballDetailPosition");
      if (current && !FOOTBALL_DETAIL_BY_BUCKET[footballBucket].includes(current)) {
        setValue("footballDetailPosition", "");
      }
    }
  }, [footballBucket, sport, setValue, getValues]);

  async function onSubmit(values: CreatePlayerInput) {
    setServerError(null);
    try {
      if (mode === "create") {
        // Multipart: an optional photo file + all non-empty fields in one request.
        const fd = new FormData();
        if (photoMode === "upload" && photoFile) fd.append("photo", photoFile);
        for (const [k, v] of Object.entries(values)) {
          if (k === "photoUrl" && photoMode !== "url") continue;
          if (typeof v === "string" && v !== "") fd.append(k, v);
        }
        await apiFetch("/api/players", { method: "POST", body: fd });
        reset(toDefaults());
        setPhotoFile(null);
        setPhotoKey((n) => n + 1);
        setPhotoMode("upload");
        onSuccess(`Player "${values.name}" added`);
      } else if (player) {
        // Edit: PATCH the data as JSON. A URL photo rides along; an uploaded file
        // goes to the dedicated photo endpoint afterwards.
        const payload: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
          if (k === "photoUrl" && photoMode !== "url") continue;
          if (typeof v === "string") payload[k] = v;
        }
        await apiFetch(`/api/players/${player.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (photoMode === "upload" && photoFile) {
          const fd = new FormData();
          fd.append("photo", photoFile);
          await apiFetch(`/api/players/${player.id}/photo`, { method: "POST", body: fd });
        }
        onSuccess(`Player "${values.name}" updated`);
      }
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Failed to save player");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>Photo (optional)</Label>
        {/* One OR the other: upload a file, or paste an image URL. */}
        <div className="flex rounded-md border border-slate-700 p-0.5 text-xs">
          {(["upload", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setPhotoMode(m);
                if (m === "upload") setValue("photoUrl", "");
                else {
                  setPhotoFile(null);
                  setPhotoKey((n) => n + 1);
                }
              }}
              className={`flex-1 rounded px-2 py-1 capitalize ${
                photoMode === m ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "upload" ? "Upload" : "URL"}
            </button>
          ))}
        </div>
        {photoMode === "upload" ? (
          <>
            <Input
              id="photo"
              key={photoKey}
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
            {photoFile && <p className="text-xs text-slate-500">{photoFile.name}</p>}
            {mode === "edit" && (
              <p className="text-xs text-slate-500">Leave empty to keep the current photo.</p>
            )}
          </>
        ) : (
          <>
            <Input
              id="photoUrl"
              placeholder="https://example.com/player.jpg"
              {...register("photoUrl")}
            />
            {errors.photoUrl && <p className="text-xs text-red-400">{errors.photoUrl.message}</p>}
          </>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="sport">Sport</Label>
        <Select id="sport" {...register("sport")}>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {/* Cricket: playing role first, then fields conditional on it. */}
      {sport === "CRICKET" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="cricketRole">Playing role</Label>
            <Select id="cricketRole" {...register("cricketRole")}>
              <option value="">—</option>
              {CRICKET_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CRICKET_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            {errors.cricketRole && (
              <p className="text-xs text-red-400">{errors.cricketRole.message}</p>
            )}
          </div>
          {cricketRole && (
            <div className="space-y-1">
              <Label htmlFor="battingPosition">Batting position</Label>
              <Select id="battingPosition" {...register("battingPosition")}>
                <option value="">—</option>
                {BATTING_POSITIONS.map((b) => (
                  <option key={b} value={b}>
                    {BATTING_POSITION_LABELS[b]}
                  </option>
                ))}
              </Select>
              {errors.battingPosition && (
                <p className="text-xs text-red-400">{errors.battingPosition.message}</p>
              )}
            </div>
          )}
          {(cricketRole === "BOWLER" || cricketRole === "ALL_ROUNDER") && (
            <div className="space-y-1">
              <Label htmlFor="bowlingStyle">Bowling style</Label>
              <Select id="bowlingStyle" {...register("bowlingStyle")}>
                <option value="">—</option>
                {BOWLING_STYLES.map((b) => (
                  <option key={b} value={b}>
                    {BOWLING_STYLE_LABELS[b]}
                  </option>
                ))}
              </Select>
              {errors.bowlingStyle && (
                <p className="text-xs text-red-400">{errors.bowlingStyle.message}</p>
              )}
            </div>
          )}
          {cricketRole === "ALL_ROUNDER" && (
            <div className="space-y-1">
              <Label htmlFor="allRounderType">All-rounder type</Label>
              <Select id="allRounderType" {...register("allRounderType")}>
                <option value="">—</option>
                {ALL_ROUNDER_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {ALL_ROUNDER_TYPE_LABELS[a]}
                  </option>
                ))}
              </Select>
              {errors.allRounderType && (
                <p className="text-xs text-red-400">{errors.allRounderType.message}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Football: broad position first, then a detail conditional on it. */}
      {sport === "FOOTBALL" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="footballPosition">Position</Label>
            <Select id="footballPosition" {...register("footballPosition")}>
              <option value="">—</option>
              {FOOTBALL_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            {errors.footballPosition && (
              <p className="text-xs text-red-400">{errors.footballPosition.message}</p>
            )}
          </div>
          {footballBucket && footballBucket !== "GK" && (
            <div className="space-y-1">
              <Label htmlFor="footballDetailPosition">Detailed position</Label>
              <Select id="footballDetailPosition" {...register("footballDetailPosition")}>
                <option value="">—</option>
                {FOOTBALL_DETAIL_BY_BUCKET[footballBucket].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              {errors.footballDetailPosition && (
                <p className="text-xs text-red-400">{errors.footballDetailPosition.message}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Cricket + football use structured roles; other sports keep a freeform role. */}
      {sport !== "CRICKET" && sport !== "FOOTBALL" && (
        <div className="space-y-1">
          <Label htmlFor="role">Role</Label>
          <Input id="role" placeholder="e.g. Point guard" {...register("role")} />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="nationality">Nationality</Label>
        <NationSelect
          id="nationality"
          value={nationality}
          onChange={(v) => setValue("nationality", v, { shouldValidate: true })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="dateOfBirth">Date of birth</Label>
        <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
        {errors.dateOfBirth && (
          <p className="text-xs text-red-400">{errors.dateOfBirth.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="externalRef">External reference</Label>
        <Input id="externalRef" placeholder="optional" {...register("externalRef")} />
        {errors.externalRef && (
          <p className="text-xs text-red-400">{errors.externalRef.message}</p>
        )}
      </div>

      {serverError && <p className="text-sm text-red-400">{serverError}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting
          ? mode === "create"
            ? "Adding…"
            : "Saving…"
          : mode === "create"
            ? "Add player"
            : "Save changes"}
      </Button>
    </form>
  );
}
