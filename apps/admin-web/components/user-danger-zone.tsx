"use client";

import { useState } from "react";
import { User, activateUser, deactivateUser, deleteUser } from "@/lib/api";

type Props = {
  user: User;
  currentUserId: number | null;
  onUpdated: () => void;
};

export default function UserDangerZone({ user, currentUserId, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isSelf = currentUserId === user.id;

  async function handleDeactivate() {
    if (!window.confirm(`User "${user.email}" wirklich deaktivieren?`)) {
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deactivateUser(user.id);
      setSuccessMessage("User wurde deaktiviert und alle Sessions wurden widerrufen.");
      onUpdated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Fehler beim Deaktivieren");
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await activateUser(user.id);
      setSuccessMessage("User wurde aktiviert.");
      onUpdated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Fehler beim Aktivieren");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`User "${user.email}" wirklich endgültig löschen?`)) {
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteUser(user.id);
      setSuccessMessage("User wurde gelöscht.");
      onUpdated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Fehler beim Löschen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <h4 className="text-sm font-semibold text-red-800">Danger Zone</h4>
      <p className="mt-1 text-sm text-red-700">
        Deaktivieren widerruft alle Sessions. Löschen entfernt den User vollständig.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {user.is_active ? (
          <button
            onClick={handleDeactivate}
            disabled={loading || isSelf}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            User deaktivieren
          </button>
        ) : (
          <button
            onClick={handleActivate}
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            User aktivieren
          </button>
        )}

        <button
          onClick={handleDelete}
          disabled={loading || isSelf}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          User löschen
        </button>
      </div>

      {isSelf ? (
        <p className="mt-3 text-xs text-red-700">
          Du kannst dich nicht selbst deaktivieren oder löschen.
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}