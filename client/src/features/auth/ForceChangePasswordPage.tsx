import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { LoginResponse } from "shared";
import { useAuth } from "./AuthContext.js";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { PasswordInput } from "../../components/ui/password-input.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

const schema = z
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
type FormValues = z.infer<typeof schema>;

/**
 * Full-screen gate shown when the password was set by someone else (account
 * provisioning or a reset). Nothing else is reachable until it's replaced.
 */
export function ForceChangePasswordPage() {
  const { user, logout, adoptSession } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      adoptSession(res); // mustChangePassword is now false → the gate lifts
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Failed to change the password");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Choose your own password</h1>
        <p className="mb-6 text-sm text-slate-400">
          The password for <span className="text-slate-200">{user?.email}</span> was set by the
          person who created the account. Pick a new one to continue.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              {...register("newPassword")}
            />
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
          {serverError && <p className="text-sm text-red-400">{serverError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Set password & continue"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200"
          onClick={logout}
        >
          Sign out instead
        </button>
      </Card>
    </main>
  );
}
