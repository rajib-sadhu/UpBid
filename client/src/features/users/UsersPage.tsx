import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema } from "shared";
import type { CreateUserInput, PublicUser } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { PasswordInput } from "../../components/ui/password-input.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

export function UsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const childRole = isAdmin ? "ORGANIZER" : "FRANCHISE";
  const endpoint = isAdmin ? "/api/users/organizers" : "/api/users/franchises";

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", name: "", password: "" },
  });

  async function load() {
    setUsers(await apiFetch<PublicUser[]>("/api/users"));
  }

  useEffect(() => {
    load().catch(() => setServerError("Failed to load users"));
  }, []);

  async function onSubmit(values: CreateUserInput) {
    setServerError(null);
    setSuccess(null);
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(values) });
      reset();
      await load();
      setSuccess(`${childRole.toLowerCase()} account created for ${values.email}`);
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Failed to create account");
    }
  }

  // Inline per-row password reset: the holder must change it again on login.
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function submitReset(u: PublicUser) {
    setServerError(null);
    setSuccess(null);
    setResetBusy(true);
    try {
      await apiFetch(`/api/users/${u.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: resetValue }),
      });
      setResetTarget(null);
      setResetValue("");
      await load();
      setSuccess(`Password reset for ${u.email} — they must change it on next login`);
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Failed to reset the password");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
      <Card className="h-fit">
        <h2 className="mb-4 font-medium">Create {childRole.toLowerCase()}</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Initial password</Label>
            <PasswordInput id="password" autoComplete="new-password" {...register("password")} />
            {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            <p className="text-xs text-slate-500">Share these credentials with the account holder.</p>
          </div>
          {serverError && <p className="text-sm text-red-400">{serverError}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : `Create ${childRole.toLowerCase()}`}
          </Button>
        </form>
      </Card>

      <Card className="min-w-0">
        <h2 className="mb-4 font-medium">
          {isAdmin ? "All users" : "Franchises you created"} ({users.length})
        </h2>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-800/50">
                <td className="py-2">{u.name}</td>
                <td className="py-2 text-slate-300">{u.email}</td>
                <td className="py-2 text-slate-400">{u.role}</td>
                <td className="py-2 text-slate-400">
                  {u.status}
                  {u.mustChangePassword && (
                    <span
                      className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400"
                      title="Signs in with a password someone else set — must change it on next login"
                    >
                      pwd pending
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {u.id !== user?.id &&
                    (resetTarget === u.id ? (
                      <span className="flex items-center justify-end gap-1.5">
                        <PasswordInput
                          autoComplete="new-password"
                          placeholder="New password"
                          className="h-7 w-40 text-xs"
                          value={resetValue}
                          onChange={(e) => setResetValue(e.target.value)}
                        />
                        <Button
                          className="px-2 py-1 text-xs"
                          disabled={resetBusy || resetValue.length < 8}
                          title={resetValue.length < 8 ? "At least 8 characters" : undefined}
                          onClick={() => void submitReset(u)}
                        >
                          {resetBusy ? "…" : "Set"}
                        </Button>
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-slate-200"
                          onClick={() => {
                            setResetTarget(null);
                            setResetValue("");
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                        onClick={() => {
                          setResetTarget(u.id);
                          setResetValue("");
                        }}
                      >
                        Reset password
                      </button>
                    ))}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
