import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { MyProfile, PublicUser, LoginResponse } from "shared";
import { useAuth } from "./AuthContext.js";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { PasswordInput } from "../../components/ui/password-input.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-rose-500/15 text-rose-300",
  ORGANIZER: "bg-indigo-500/15 text-indigo-300",
  FRANCHISE: "bg-emerald-500/15 text-emerald-300",
};
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Platform admin",
  ORGANIZER: "Organizer",
  FRANCHISE: "Franchise owner",
};

const nameSchema = z.object({ name: z.string().trim().min(1, "Name is required") });
type NameForm = z.infer<typeof nameSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function NameCard({ user, onSaved }: { user: PublicUser; onSaved: (u: PublicUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name: user.name } });

  async function onSubmit(values: NameForm) {
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<PublicUser>("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      onSaved(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save your name");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-medium">Account</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...register("name")} />
          {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user.email} disabled className="opacity-60" />
          <p className="text-xs text-slate-500">
            Your email is your login identity and can't be changed.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Member since {new Date(user.createdAt).toLocaleDateString()}
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Name updated.</p>}
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save name"}
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const { adoptSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: PasswordForm) {
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      adoptSession(res); // fresh token, stay signed in
      reset();
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to change the password");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-medium">Change password</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="currentPassword">Current password</Label>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p className="text-xs text-red-400">{errors.currentPassword.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="newPassword">New password</Label>
          <PasswordInput id="newPassword" autoComplete="new-password" {...register("newPassword")} />
          {errors.newPassword && (
            <p className="text-xs text-red-400">{errors.newPassword.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Password changed.</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}

/** Self-service profile for every role: edit name and password, never email. */
export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MyProfile>("/api/auth/profile")
      .then(setProfile)
      .catch(() => setError("Failed to load your profile"));
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!profile || !user) return <p className="text-slate-400">Loading profile…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${ROLE_STYLES[user.role] ?? ""}`}>
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <NameCard user={user} onSaved={updateUser} />
          <Card>
            <h2 className="mb-3 font-medium">
              {user.role === "FRANCHISE" ? "My teams" : "My leagues"}
            </h2>
            {user.role === "SUPER_ADMIN" ? (
              <p className="text-sm text-slate-400">
                Platform administrator — full access to every league.
              </p>
            ) : profile.affiliations.length === 0 ? (
              <p className="text-sm text-slate-500">
                {user.role === "FRANCHISE"
                  ? "No franchise has been assigned to you yet."
                  : "You don't organize any leagues yet."}
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {profile.affiliations.map((a) => (
                  <li key={a.name} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{a.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <PasswordCard />
      </div>
    </div>
  );
}
