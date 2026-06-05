import Link from "next/link"

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center px-6">
      <h1 className="text-2xl font-bold">Sign-in failed</h1>
      <p className="text-muted-foreground">Something went wrong during authentication. Please try again.</p>
      {reason && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 max-w-md">
          {decodeURIComponent(reason)}
        </p>
      )}
      <Link
        href="/"
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        Back to Home
      </Link>
    </div>
  )
}
