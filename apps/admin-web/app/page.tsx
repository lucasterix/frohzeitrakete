import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">FrohZeitRakete Admin</h1>
        <p className="mt-3 text-slate-600">
          Zum grafischen Testen des Backends.
        </p>

        <Link
          href="/admin/users"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800"
        >
          Zu /admin/users
        </Link>
      </div>
    </main>
  );
}